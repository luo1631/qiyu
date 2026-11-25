import { BufferGeometry, Color, DataTexture, DepthTexture, Float32BufferAttribute, LinearFilter, Matrix4, Mesh, RepeatWrapping, RGBAFormat, ShaderMaterial, UniformsLib, UniformsUtils, UnsignedIntType, Vector2, Vector3, Vector4 } from 'three';
import type { IUniform, WebGLRenderer } from 'three';
import { Water } from 'three/addons/objects/Water2.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Refractor } from 'three/addons/objects/Refractor.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { windWaves } from './pond-life';
import type { Ripple } from './pond-life';
import { makePondWakeField, wakeFieldExtent } from './PondWakeField';
import type { WakeBoatInput } from './PondWakeField';
import type { PaperWakeRipple } from './paper-wake';
import { makePondSurface } from './PondSurface';
import { isOnOuterBank, outerShoreGLSL, pondRim, shorePoint, shoreSegments } from './shore-layout';
import { terrainHeightMin, terrainHeightRange, terrainSize } from './PondTerrain';
import { reflectionLayer, refractionLayer, waterLevel } from './PondOptics';
import type { makePondLighting } from './PondLighting';
import type { WaterRenderSettings } from './render-profile';
import { moonAngularRadius } from './sky-light';

// Upstream r187 exposes this shader; @types/three does not yet declare it.
const waterShader = (Water as typeof Water & { WaterShader: {
  name: string; uniforms: Record<string, IUniform>; vertexShader: string; fragmentShader: string;
} }).WaterShader;
const normalSize = 128;
const normalPixels = new Map<number, Uint8Array>();

/** The planar cameras use these same periodic normals for distortion. */
function waterNormal(seed: number) {
  let pixels = normalPixels.get(seed);
  if (!pixels) {
    pixels = makeNormalPixels(seed);
    normalPixels.set(seed, pixels);
  }
  const texture = new DataTexture(pixels, normalSize, normalSize, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function makeNormalPixels(seed: number) {
  const size = normalSize, data = new Uint8Array(size * size * 4);
  const noise = new ImprovedNoise(), heights = new Float32Array(size * size);
  const sample = (x: number, y: number) => noise.noise(x * 5, y * 5, seed + 2) + noise.noise(x * 11, y * 11, seed + 6) * .22;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    heights[y * size + x] = (sample(u, v) * (1 - u) + sample(u - 1, v) * u) * (1 - v)
      + (sample(u, v - 1) * (1 - u) + sample(u - 1, v - 1) * u) * v;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]) * .45;
    const dy = (heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]) * .45;
    const offset = (y * size + x) * 4;
    data[offset] = Math.round((dx + 1) * 127.5);
    data[offset + 1] = Math.round((dy + 1) * 127.5);
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  return data;
}

function waterGeometry() {
  const positions = [pondRim.x, -pondRim.z, 0], uvs = [pondRim.x / terrainSize + .5, -pondRim.z / terrainSize + .5];
  const indices: number[] = [];
  for (let i = 0; i < shoreSegments; i++) {
    // Overlap the wet margin so the shader can feather the final centimetres.
    const { x, z } = shorePoint(i / shoreSegments * Math.PI * 2, -.10);
    positions.push(x, -z, 0);
    uvs.push(x / terrainSize + .5, -z / terrainSize + .5);
    indices.push(0, (i + 1) % shoreSegments + 1, i + 1);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function supportedRefractionSamples(renderer: WebGLRenderer, desired: number) {
  if (renderer.capabilities.maxSamples < 2 || !renderer.extensions.has('EXT_color_buffer_float')) return 0;
  const gl = renderer.getContext();
  if (!('getInternalformatParameter' in gl)) return 0;
  // The resolved colour and depth are consumed together. Use the same sample
  // count for both attachments and only request it when both formats support it.
  const colour = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array | null;
  const depth = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES) as Int32Array | null;
  return Math.max(0, ...Array.from(colour ?? []).filter(samples => samples <= desired && depth?.includes(samples)));
}

export function makePondWater(settings: WaterRenderSettings, terrain: DataTexture, renderer: WebGLRenderer,
  islandLandAt: (x: number, z: number) => boolean, captureEveryFrame = false) {
  const { resolution, wakeCellSize, captureHz, reflectionSamples, antialiasRefraction } = settings;
  const waveResolution = wakeFieldExtent / wakeCellSize;
  const wakeField = makePondWakeField(renderer, waveResolution, (x, z) => isOnOuterBank(x, z) || islandLandAt(x, z));
  const surface = makePondSurface(renderer, wakeCellSize);
  const normal0 = waterNormal(0), normal1 = waterNormal(2);
  const geometry = waterGeometry();
  const nativeCapture = resolution === 'viewport';
  const initialSize = nativeCapture ? 1 : resolution;
  const targetOptions = { textureWidth: initialSize, textureHeight: initialSize };
  const reflector = new Reflector(geometry, { ...targetOptions, multisample: reflectionSamples });
  const refractionSamples = antialiasRefraction ? supportedRefractionSamples(renderer, reflectionSamples || 2) : 0;
  // A small projection bias keeps the clipped color target from opening a
  // one-pixel seam where the projected island bank meets the transparent plane.
  const refractor = new Refractor(geometry, { ...targetOptions, multisample: refractionSamples, clipBias: .001 });
  const reflectionTarget = reflector.getRenderTarget();
  const refractionTarget = refractor.getRenderTarget();
  const refractionDepth = new DepthTexture(initialSize, initialSize, UnsignedIntType);
  refractionDepth.name = 'PondRefractionDepth';
  refractionTarget.depthTexture = refractionDepth;
  refractionTarget.resolveDepthBuffer = true;
  const refractionToWorld = new Matrix4();
  reflectionTarget.texture.name = 'PondReflection';
  refractionTarget.texture.name = 'PondRefraction';
  refractor.camera.layers.set(refractionLayer);
  const capturedView = new Matrix4(), capturedProjection = new Matrix4();
  let capturedLight = NaN, capturedTime = -Infinity;
  let captureTime = 0, lightingTime = 0, captures = 0;
  const material = new ShaderMaterial({
    name: waterShader.name,
    fog: true,
    transparent: true,
    uniforms: Object.assign(UniformsUtils.merge([UniformsLib.fog, waterShader.uniforms]), {
      textureMatrix: refractor.material.uniforms.textureMatrix,
      tReflectionMap: { value: reflectionTarget.texture },
      tRefractionMap: { value: refractionTarget.texture },
      pondRefractionDepth: { value: refractionDepth },
      pondRefractionToWorld: { value: refractionToWorld },
      tNormalMap0: { value: normal0 }, tNormalMap1: { value: normal1 },
      flowDirection: { value: new Vector2(.55, .21) },
      config: { value: new Vector4(0, .075, .075, terrainSize * .186) },
      color: { value: new Color() }, reflectivity: { value: .028 },
      pondSunDirection: { value: new Vector3() },
      pondMoonDirection: { value: new Vector3() },
      pondSunLight: { value: new Color() },
      pondMoonLight: { value: new Color() },
      pondTime: { value: 0 },
      pondWakeField: { value: wakeField.texture },
      pondDay: { value: 1 },
      pondMoonVisibility: { value: 0 },
      pondTerrain: { value: terrain },
    }),
    vertexShader: waterShader.vertexShader
      .replace('varying vec3 vToEye;', 'varying vec3 vToEye;\nvarying vec3 pondSurface;')
      .replace('vToEye = cameraPosition - worldPosition.xyz;', 'vToEye = cameraPosition - worldPosition.xyz;\npondSurface = worldPosition.xyz;'),
    fragmentShader: waterShader.fragmentShader
      .replace('varying vec3 vToEye;', 'varying vec3 vToEye;\nvarying vec3 pondSurface;')
      .replace('uniform vec3 color;', `uniform vec3 color;
        uniform vec3 pondSunDirection; uniform vec3 pondMoonDirection;
        uniform vec3 pondSunLight; uniform vec3 pondMoonLight;
        uniform float pondTime;
        uniform float pondDay;
        uniform sampler2D pondRefractionDepth;
        uniform mat4 pondRefractionToWorld;
        uniform sampler2D pondWakeField;
        uniform sampler2D pondTerrain; uniform float pondMoonVisibility;
        ${outerShoreGLSL}`)
      .replace('// calculate the fresnel term', `
        ${windWaves.map(w => `normal.xz -= vec2(${w.x}, ${w.z}) * cos(dot(pondSurface.xz, vec2(${w.x}, ${w.z})) * ${w.frequency} - pondTime * ${w.speed}) * ${w.amplitude * w.frequency};`).join('\n')}
        // One persistent water field has continuous slopes, with no separate ring crests.
        float wakeHeight = 0.0;
        float wakeRoughness = 0.0;
        vec2 wakeUV = pondSurface.xz / ${wakeFieldExtent.toFixed(1)} + .5;
        if (min(wakeUV.x, wakeUV.y) > .0 && max(wakeUV.x, wakeUV.y) < 1.0) {
          vec2 texel = vec2(${(1 / waveResolution).toFixed(9)});
          vec2 slope = vec2(
            texture2D(pondWakeField, wakeUV + vec2(texel.x, 0.0)).r - texture2D(pondWakeField, wakeUV - vec2(texel.x, 0.0)).r,
            texture2D(pondWakeField, wakeUV + vec2(0.0, texel.y)).r - texture2D(pondWakeField, wakeUV - vec2(0.0, texel.y)).r
          ) / ${(2 * wakeFieldExtent / waveResolution).toFixed(5)};
          // Crossing crests may add physically, but must not fold the optical normal
          // into a mirror wall. Smooth saturation preserves direction and small ripples.
          float steepness = length(slope);
          wakeRoughness = smoothstep(.035, .18, steepness);
          slope *= inversesqrt(1.0 + dot(slope, slope) / (.12 * .12));
          normal.xz -= slope * 1.35;
          wakeHeight = texture2D(pondWakeField, wakeUV).r * 3.0;
        }
        normal = normalize(normal);
        // calculate the fresnel term`)
      .replace('vec2 uv = coord.xy + coord.z * normal.xz * 0.05;', `
        // Screen-space refraction must not smear the render target's border.
        vec2 border=min(coord.xy,vec2(1.0)-coord.xy);
        float edgeFade=smoothstep(0.0,.055,min(border.x,border.y));
        float shoreCalm=smoothstep(.04,.95,-outerShoreDistance(pondSurface.xz));
        float opticalSpread = mix(1.0, .65, wakeRoughness)*shoreCalm;
        float depth = max(0.0,${-terrainHeightMin} - texture2D(pondTerrain,pondSurface.xz/${terrainSize.toFixed(1)}+.5).r * ${terrainHeightRange});
        float shallowCalm = smoothstep(.05, .29, depth);
        vec2 uv=coord.xy+coord.z*normal.xz*.033*edgeFade*opticalSpread*shallowCalm;
        // Let sunlight use the same moving surface as the clouds. Calm water
        // keeps the lunar phase legible, with the same distortion in steep wakes.
        vec3 reflectedRay=vec3(-toEye.x,toEye.y,-toEye.z);
        const float lunarEdge=${(1 - Math.cos(moonAngularRadius)).toFixed(9)};
        float separation=1.0-dot(pondMoonDirection,reflectedRay);
        float nearMoon=(1.0-smoothstep(lunarEdge,lunarEdge*8.0,separation))*pondMoonVisibility;
        float reflectionSpread=mix(.098,mix(.038,.098,wakeRoughness),nearMoon);
        vec2 reflectionOffset=coord.z*normal.xz*reflectionSpread*edgeFade*opticalSpread;
        float reflectionRoom=max(0.0,min(border.x,border.y))*.90;
        reflectionOffset*=min(1.0,reflectionRoom/max(length(reflectionOffset),.00001));
        vec2 reflectionUV=coord.xy+reflectionOffset;`)
      .replace('vec2( 1.0 - uv.x, uv.y )','vec2( 1.0 - reflectionUV.x, reflectionUV.y )')
      .replace('// multiply water color', `
        // Dry island geometry occludes the surface directly; the outer edge
        // feathers against the bank mesh, whose visible contour uses the same rim.
        float outerBank = -outerShoreDistance(pondSurface.xz);
        // Undo the refractor's oblique projection to recover the visible object
        // along this ray. A fish near the surface travels less light through
        // water than the bed beneath it.
        float storedDepth = texture2D(pondRefractionDepth, uv).r;
        float submerged = depth;
        if (storedDepth < .9999) {
          vec4 hit = pondRefractionToWorld * vec4(vec3(uv,storedDepth)*2.0-1.0,1.0);
          submerged = clamp(pondSurface.y - hit.y/hit.w, 0.0, depth+.32);
        }
        // Use the refracted depth for light travelling to the visible object.
        float path = submerged / max(.52, toEye.y);
        vec3 transmission = exp(-vec3(.55, .27, .22) * path);
        vec3 inscatter = mix(vec3(.014,.025,.039), vec3(.033,.082,.081), pondDay);
        refractColor.rgb = refractColor.rgb * transmission + inscatter * (1.0 - transmission);
        // multiply water color`)
      .replace('gl_FragColor = vec4( color, 1.0 ) * mix( refractColor, reflectColor, reflectance );',
        `// Near-shore water retains the actual sand/soil colour. Tint and
         // reflection grow with depth; the waterline uses the analytic contour,
         // not a quantized depth-map alpha that would scallop the shoreline.
         vec3 waterTint=mix(vec3(1.0),color,smoothstep(.25,1.85,depth)*.42);
         float contactFade = smoothstep(.024, .175, submerged);
         float shelfFade = mix(.38, 1.0, smoothstep(.11, .39, depth));
         float waterCoverage = smoothstep(-.025, .055, outerBank) * contactFade * shelfFade;
         float depthReflection=reflectance*smoothstep(.13,.83,depth)*smoothstep(.055,.24,submerged);
         gl_FragColor = vec4(mix(waterTint * refractColor.rgb, reflectColor.rgb, depthReflection), waterCoverage);`)
      .replace('#include <tonemapping_fragment>', `
        // Spread and dim the specular peak over steep disturbed water; do not clip
        // the final colour, which would erase the pond's day/night illumination.
        float sharpness = mix(190.0, 105.0, wakeRoughness);
        float sunGlint = pow(max(dot(reflect(-pondSunDirection, normal), toEye), 0.0), sharpness);
        // The surface shimmer and the disc in the reflection share the sky's bearing.
        float moonGlint = pow(max(dot(reflect(-pondMoonDirection, normal), toEye), 0.0), mix(136.0,76.0,wakeRoughness));
        gl_FragColor.rgb += pondSunLight * sunGlint * mix(.42,.20,wakeRoughness)
          + pondMoonLight * moonGlint * mix(.22,.15,wakeRoughness);
        // The simulated wave field supplies shore responses; no permanent
        // concentric highlight rings around otherwise still islands.
        gl_FragColor.rgb += vec3(.045,.065,.060) * clamp(wakeHeight, -.6, .6) * (.45 + .55 * pondDay);
        #include <tonemapping_fragment>
      `),
  });
  const water = new Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2;
  water.position.y = waterLevel;
  water.name = 'PondWater';
  const captureInterval = captureHz ? 1 / captureHz - .002 : 0;
  const context = renderer.getContext();
  const targetLimit = Math.min(renderer.capabilities.maxTextureSize, context.getParameter(context.MAX_RENDERBUFFER_SIZE));
  water.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    const viewChanged = !capturedView.equals(camera.matrixWorld) || !capturedProjection.equals(camera.projectionMatrix);
    const sceneChanged = capturedLight !== lightingTime;
    const elapsed = captureTime - capturedTime;
    if (!captureEveryFrame && !viewChanged && !sceneChanged && elapsed <= captureInterval) return;
    reflector.getReflectionCamera(camera).layers.set(reflectionLayer);
    water.visible = false;
    try {
      reflector.matrixWorld.copy(water.matrixWorld);
      refractor.matrixWorld.copy(water.matrixWorld);
      reflector.onBeforeRender(renderer, scene, camera, geometry, material, group);
      refractor.onBeforeRender(renderer, scene, camera, geometry, material, group);
      refractionToWorld.copy(refractor.camera.projectionMatrix).invert().premultiply(refractor.camera.matrixWorld);
      capturedView.copy(camera.matrixWorld);
      capturedProjection.copy(camera.projectionMatrix);
      capturedLight = lightingTime;
      capturedTime = captureTime;
      captures++;
    } finally {
      water.visible = true;
    }
  };
  return {
    water, wakeField, wakeCellSize, surface, reflectionTarget, refractionSamples,
    get resolution() { return nativeCapture ? Math.round(Math.sqrt(reflectionTarget.width * reflectionTarget.height)) : resolution; },
    get captureSize() { return [reflectionTarget.width, reflectionTarget.height]; },
    get captures() { return captures; },
    fitCaptures(viewWidth: number, viewHeight: number, dpr: number) {
      const stretch = Math.sqrt(Math.max(.38, Math.min(2.6, viewWidth / Math.max(viewHeight, 1))));
      const requestedWidth = nativeCapture ? viewWidth * dpr : Math.round(resolution * stretch / 32) * 32;
      const requestedHeight = nativeCapture ? viewHeight * dpr : Math.round(resolution / stretch / 32) * 32;
      const scale = Math.min(1, targetLimit / Math.max(1, requestedWidth, requestedHeight));
      const width = Math.max(1, Math.floor(requestedWidth * scale)), height = Math.max(1, Math.floor(requestedHeight * scale));
      if (width === reflectionTarget.width && height === reflectionTarget.height) return;
      reflectionTarget.setSize(width, height);
      refractionTarget.setSize(width, height);
      capturedLight = NaN;
    },
    invalidateCapture() { capturedLight = NaN; },
    prepareCapture(time: number, timestamp: number) {
      captureTime = time;
      lightingTime = timestamp;
    },
    update(time: number, light: ReturnType<typeof makePondLighting>['surface'], boat: WakeBoatInput, night: number, ripples: readonly Ripple[], moonVisibility: number, paperWake: readonly PaperWakeRipple[], animate: boolean) {
      const uniforms = water.material.uniforms;
      if (animate) {
        wakeField.update(time, paperWake, boat, ripples);
        uniforms.pondWakeField.value = wakeField.texture;
        void surface.update(time, wakeField.texture, wakeField.active);
      }
      const offset = time * .008 % .15;
      uniforms.config.value.x = offset;
      uniforms.config.value.y = (offset + .075) % .15;
      uniforms.pondSunDirection.value.copy(light.sun.direction);
      uniforms.pondMoonDirection.value.copy(light.moon.direction);
      uniforms.pondSunLight.value.copy(light.sun.color).multiplyScalar(light.sun.power);
      uniforms.pondMoonLight.value.copy(light.moon.color).multiplyScalar(light.moon.power);
      uniforms.pondTime.value = time;
      uniforms.pondDay.value = 1 - night;
      uniforms.pondMoonVisibility.value = moonVisibility;
      uniforms.reflectivity.value = .028 + night * .024;
      uniforms.color.value.copy(dayWater).lerp(nightWater, night);
    },
    dispose() {
      wakeField.dispose();
      surface.dispose();
      reflector.dispose(); refractor.dispose();
      normal0.dispose(); normal1.dispose(); geometry.dispose(); material.dispose();
    },
  };
}

const dayWater = new Color('#afcfc8'), nightWater = new Color('#a6c4db');
