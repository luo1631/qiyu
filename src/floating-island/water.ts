import {
  BufferGeometry, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MathUtils, Matrix4, Mesh, Points,
  ShaderMaterial, ShapeUtils, Vector2, Vector3,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { lakeLevel, seaLevel, seeded, shore, spill } from './terrain';
import type { IslandSurfaceMask } from './terrain';

export const lakeReflectionLayer = 1;

const lip = spill.outer.clone().sub(spill.inner);
const alongLip = lip.clone().normalize();
const outward = new Vector2(-alongLip.y, alongLip.x);
const lipCenter = spill.inner.clone().lerp(spill.outer, .5);

const waterNoise = `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float grain(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1., 0.)), blend.x),
      mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), blend.x), blend.y);
  }
`;

function makeLake(mask: IslandSurfaceMask, compact: boolean) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(shore.flatMap(p => [p.x, -p.y, 0]), 3));
  geometry.setIndex(ShapeUtils.triangulateShape(shore, []).flatMap(([a, b, c]) => {
    const ab = shore[b].clone().sub(shore[a]), ac = shore[c].clone().sub(shore[a]);
    return ab.cross(ac) > 0 ? [a, c, b] : [a, b, c];
  }));
  const lake = new Reflector(geometry, {
    textureWidth: compact ? 288 : 512, textureHeight: compact ? 320 : 384, multisample: 0, clipBias: .002,
    shader: {
      name: '池水、岸边倒影和游泳水痕',
      uniforms: {
        tDiffuse: { value: null }, color: { value: new Color() }, textureMatrix: { value: new Matrix4() },
        surfaceMask: { value: null }, surfaceOrigin: { value: mask.origin }, surfaceSpan: { value: mask.span },
        clock: { value: 0 }, night: { value: 0 }, twilight: { value: 0 },
        swimmer: { value: new Vector2() }, swimAngle: { value: 0 }, paddle: { value: 1 },
        boat: { value: new Vector2() }, hullAngle: { value: 0 }, lightDirection: { value: new Vector3() },
        outlet: { value: lipCenter }, outletDirection: { value: outward }, outletHalfWidth: { value: lip.length() * .5 },
        deepDay: { value: new Color('#427574') }, paleDay: { value: new Color('#a0bea2') },
        deepNight: { value: new Color('#30535c') }, paleNight: { value: new Color('#698b80') },
        skyDay: { value: new Color('#c1d9da') }, skyNight: { value: new Color('#668198') },
        rimTint: { value: new Color('#cce4cb') },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec2 ground;
        varying vec4 mirror;
        void main() {
          ground = (modelMatrix * vec4(position, 1.)).xz;
          mirror = textureMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader: waterNoise + `
        uniform sampler2D surfaceMask, tDiffuse;
        uniform vec2 surfaceOrigin, surfaceSpan, swimmer, boat, outlet, outletDirection;
        uniform float clock, night, twilight, swimAngle, hullAngle, paddle, outletHalfWidth;
        uniform vec3 deepDay, paleDay, deepNight, paleNight, skyDay, skyNight, rimTint, lightDirection;
        varying vec2 ground;
        varying vec4 mirror;
        vec2 withHeading(vec2 p, float yaw) {
          vec2 fwd = vec2(sin(yaw), cos(yaw));
          return vec2(dot(p, vec2(fwd.y, -fwd.x)), dot(p, fwd));
        }
        float oval(vec2 p, vec2 width) {
          vec2 u = p / width;
          return exp(-dot(u,u));
        }
        void main() {
          vec2 p = ground;
          vec3 cover = texture2D(surfaceMask, (p - surfaceOrigin) / surfaceSpan).rgb;
          float depth = smoothstep(.019, .72, cover.b);
          vec3 tint = mix(mix(paleDay, deepDay, depth), mix(paleNight, deepNight, depth), night);
          tint *= vec3(1. + twilight * .09, 1. - twilight * .02, 1. - twilight * .08);

          vec2 flowA = p + vec2(-.083, .044) * clock;
          vec2 flowB = p + vec2(.049, -.073) * clock;
          float curlA = grain(flowA * vec2(1.9, 2.8)), curlB = grain(flowB * vec2(3.3, 1.8));
          float phaseA = dot(flowA, vec2(2.6, 15.7)) + 6.1 * curlA;
          float phaseB = dot(flowB, vec2(-10.3, 12.6)) + 5.7 * curlB;
          float crisp = 1. - smoothstep(.53, 1.50, max(fwidth(phaseA), fwidth(phaseB)));
          float waves = (sin(phaseA) * .59 + sin(phaseB) * .41) * crisp;
          vec2 slope = vec2(.052 * cos(phaseB), .091 * cos(phaseA)) * crisp;
          vec3 normal = normalize(vec3(slope.x, 1., slope.y));
          vec3 eye = normalize(vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z));

          vec2 mirrorUv = mirror.xy / mirror.w + slope * vec2(.027, .020);
          const vec2 soften = vec2(.0036, .0047);
          vec4 mirrored = texture2D(tDiffuse, mirrorUv) * .40
            + (texture2D(tDiffuse, mirrorUv + soften) + texture2D(tDiffuse, mirrorUv - soften)
            + texture2D(tDiffuse, mirrorUv + vec2(soften.x, -soften.y))
            + texture2D(tDiffuse, mirrorUv + vec2(-soften.x, soften.y))) * .15;
          vec3 sky = mix(skyDay, skyNight, night) * vec3(1. + twilight * .06, 1., 1.);
          vec3 reflection = mix(sky, mirrored.rgb / max(.06, mirrored.a), mirrored.a * .80);
          float fresnel = pow(1. - max(dot(eye, normal), 0.), 2.6);
          vec3 color = mix(tint, reflection * vec3(.78, .98, .90), .18 + fresnel * .39 + depth * .075);
          color *= 1. + waves * .044;
          float glint = pow(max(dot(normalize(lightDirection + eye), normal), 0.), 44.);
          float fine = smoothstep(.68, .98, sin(phaseA)) * smoothstep(.26, .69, curlB)
            + smoothstep(.73, .98, sin(phaseB)) * smoothstep(.43, .86, curlA) * .62;
          color += rimTint * (glint * .060 + fine * crisp * .047) * (1. - night * .34);

          float lip = (1. - smoothstep(.015, .075, cover.b)) * smoothstep(.22, .70, cover.g);
          float shallows = (1. - smoothstep(.073, .27, cover.b)) * (1. - lip * .77);
          float caustic = smoothstep(.46, .90, sin(phaseA + .52 * sin(phaseB)) * .61 + sin(phaseB) * .39);
          color += rimTint * (lip * (.16 + .14 * grain(p * 12.)) + caustic * shallows * crisp * .082) * (1. - night * .32);

          vec2 bird = withHeading(p - swimmer, swimAngle);
          vec2 hull = withHeading(p - boat, hullAngle);
          color *= 1. - .27 * oval(bird - vec2(0., -.02), vec2(.195, .45))
            - .36 * oval(hull, vec2(.36, .94));
          float behind = smoothstep(.13, .42, -bird.y) * exp(-max(0.,-bird.y) * 1.48);
          float trail = abs(bird.x) - (.098 + max(0., -bird.y) * .34);
          float wake = exp(-trail * trail * 158.) * behind *
            (.37 + smoothstep(.14, .90, cos(bird.y * 25. - clock * 4.4)) * .63);
          float bow = exp(-pow((length(vec2(bird.x * 1.55, bird.y - .08)) - .34) * 23., 2.))
            * smoothstep(.10, .38, bird.y);
          float hullWater = exp(-pow((length(hull / vec2(.44, 1.02)) - .94) * 15., 2.))
            * (.40 + .60 * grain(p * 11. + clock * .17));
          color += rimTint * (paddle * (wake * .20 + bow * .09) + hullWater * .063) * (1. - night * .40);

          vec2 inrush = p - outlet;
          float inward = max(0., -dot(inrush, outletDirection));
          float crossfall = dot(inrush, vec2(outletDirection.y, -outletDirection.x)) / outletHalfWidth;
          float mouth = (1. - smoothstep(.57, .98, abs(crossfall))) * (1. - smoothstep(.12, 1.18, inward));
          float streaks = smoothstep(.44, .84, grain(vec2(crossfall * 20., inward * 2.0 + clock * 1.48)));
          float crest = mouth * exp(-inward * 10.) * (.52 + .48 * streaks);
          color += rimTint * (mouth * streaks * .085 + crest * .19) * (1. - night * .27);

          float alpha = mix(.49, .810, depth) * mix(.77, 1., smoothstep(.13, .71, cover.g));
          alpha = mix(alpha, .90, crest * .69);
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  lake.name = '透明浅滩与池面倒影';
  lake.position.y = lakeLevel;
  lake.rotation.x = -Math.PI / 2;
  const material = lake.material as ShaderMaterial;
  material.uniforms.surfaceMask.value = mask.texture;
  material.transparent = true;
  lake.renderOrder = 1;
  const drawReflection = lake.onBeforeRender;
  const reflectedCamera = new Matrix4(), reflectedProjection = new Matrix4();
  const changed = (a: Matrix4, b: Matrix4) => a.elements.some((value, i) => Math.abs(value - b.elements[i]) > .00002);
  let reflectionDirty = true;

  // A static mirror of the shore is reused until the camera, lighting or placements change.
  lake.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    if (!reflectionDirty && !changed(camera.matrixWorld, reflectedCamera) &&
        !changed(camera.projectionMatrix, reflectedProjection)) return;
    lake.getReflectionCamera(camera).layers.set(lakeReflectionLayer);
    drawReflection.call(lake, renderer, scene, camera, geometry, material, group);
    reflectedCamera.copy(camera.matrixWorld);
    reflectedProjection.copy(camera.projectionMatrix);
    reflectionDirty = false;
  };
  return { lake, material, invalidate: () => { reflectionDirty = true; } };
}

function fallingPoint(across: number, down: number, peel: number) {
  const fold = MathUtils.smoothstep(down, .028, .36);
  const spread = 1 - .26 * MathUtils.smoothstep(down, .06, .67) + .047 * MathUtils.smoothstep(down, .81, 1);
  const center = .49 - .033 * Math.sin(down * Math.PI) + .01 * (1 - fold);
  const bulge = fold * (.079 * Math.sin(across * 12.9 - down * 3.2) + .11 * Math.sin(Math.PI * across));
  const drift = .80 * (1 - Math.exp(-down * 9.4)) + .36 * down + bulge + peel;
  const p = spill.inner.clone().addScaledVector(lip, center + (across - .5) * spread).addScaledVector(outward, drift);
  const y = lakeLevel + (seaLevel - lakeLevel) * down ** 1.67 - .035 * down * Math.sin(across * 7.9) - .043 * down ** 5;
  return new Vector3(p.x, y, p.y);
}

function makeSea(impact: Vector3) {
  const geometry = new CircleGeometry(84, 64).rotateX(-Math.PI / 2);
  const material = new ShaderMaterial({
    name: '岛下的海面、远雾与落水圈',
    transparent: true, depthWrite: false,
    uniforms: {
      clock: { value: 0 }, night: { value: 0 }, twilight: { value: 0 }, splash: { value: new Vector2(impact.x, impact.z) },
      splashAxis: { value: outward },
      dayWater: { value: new Color('#76aab5') }, dayHaze: { value: new Color('#b6d5d8') },
      nightWater: { value: new Color('#304a65') }, nightHaze: { value: new Color('#586e85') },
    },
    vertexShader: `
      varying vec2 ground;
      varying float skyward;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.);
        vec4 clip = projectionMatrix * viewMatrix * world;
        skyward = .5 + .5 * clip.y / clip.w;
        ground = world.xz;
        gl_Position = clip;
      }
    `,
    fragmentShader: waterNoise + `
      uniform float clock, night, twilight;
      uniform vec2 splash, splashAxis;
      uniform vec3 dayWater, dayHaze, nightWater, nightHaze;
      varying vec2 ground;
      varying float skyward;
      void main() {
        vec2 p = ground;
        float far = smoothstep(.17, .82, skyward);
        float horizon = 1. - smoothstep(.49, .79, skyward);
        vec3 nearTone = mix(dayWater, nightWater, night);
        vec3 haze = mix(dayHaze, nightHaze, night);
        haze *= vec3(1. + twilight * .14, 1. - twilight * .036, 1. - twilight * .055);
        vec3 color = mix(nearTone, haze, far * .84);
        float swellA = grain(p * vec2(.26, .49) + vec2(.071, -.052) * clock);
        float swellB = grain(p * vec2(.26, .67) - vec2(.063, -.030) * clock);
        float tide = sin(dot(p, vec2(.84, 3.65)) + swellA * 6.8 - clock * 1.18);
        float wrinkle = sin(dot(p, vec2(1.91,-5.12)) + swellB * 4.7 + clock * 1.22);
        float surface = (.58 * tide + .42 * wrinkle) * horizon;
        float sheen = smoothstep(.45,.93, surface) * smoothstep(.33,.79,swellB);
        color *= 1. + surface * .075;
        color += haze * sheen * .12 * (1. - .27 * night);

        float islandShade = exp(-dot(p * vec2(.085, .116), p * vec2(.085, .116)) * 1.58);
        color *= 1. - .20 * islandShade;
        vec2 delta = p - splash;
        vec2 impact = vec2(dot(delta, vec2(splashAxis.y, -splashAxis.x)), dot(delta, splashAxis));
        if (dot(impact, impact) < 18.) {
          vec2 soaked = impact * vec2(1.04, 2.65);
          float spread = exp(-dot(soaked, soaked) * 1.13);
          float churning = grain(impact * vec2(11., 16.) + vec2(.71, -1.80) * clock);
          float bubbles = smoothstep(.29, .77, churning + swellB * .20 - .07);
          float foam = spread * (.27 + .73 * bubbles);
          float fragments = .19 + .81 * smoothstep(.26, .68, grain(impact * vec2(2.5, 3.5) - clock * .22));
          float ruffles = 0.;
          for (int ring = 0; ring < 3; ring++) {
            float age = fract(clock * .63 + float(ring) * .3333);
            vec2 wake = (impact - vec2(.12, .32) * age) * vec2(.68, 1.11);
            float radius = length(wake) + (grain(impact * 4.8 + float(ring) * 2.2) - .5) * .11;
            float width = .086 + age * .058;
            float wave = 1. - smoothstep(.025, width, abs(radius - (.24 + age * 1.93)));
            float cycle = smoothstep(.045, .14, age) * (1. - smoothstep(.56, .98, age));
            ruffles += wave * cycle * fragments;
          }
          vec3 seaFoam = mix(vec3(.78, .94, .89), vec3(.30, .49, .61), night);
          color = mix(color, seaFoam, foam * .50);
          color += seaFoam * ruffles * (.17 - .052 * night);
        }
        gl_FragColor = vec4(color, .98 * horizon);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = '带落水涟漪的海洋';
  mesh.position.y = seaLevel;
  mesh.renderOrder = -7;
  return mesh;
}

function makeWaterfall() {
  const geometry = new BufferGeometry();
  const positions: number[] = [], uvs: number[] = [], style: number[] = [], indices: number[] = [];
  const streams = [
    { center: .5, width: 1, endWidth: 1, start: 0, peel: 0, turn: 0, seed: 0 },
    { center: .18, width: .17, endWidth: .080, start: .11, peel: .16, turn: -.045, seed: 3.1 },
    { center: .44, width: .27, endWidth: .165, start: .065, peel: .20, turn: -.039, seed: 6.8 },
    { center: .72, width: .14, endWidth: .070, start: .18, peel: .135, turn: .062, seed: 9.2 },
  ];
  for (const stream of streams) {
    const offset = positions.length / 3;
    const columns = stream.start ? 10 : 30, rows = stream.start ? 42 : 51;
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const down = MathUtils.lerp(stream.start, 1, t);
      const flow = Math.sin(t * Math.PI);
      const span = MathUtils.lerp(stream.width, stream.endWidth, t ** .79);
      for (let column = 0; column <= columns; column++) {
        const u = column / columns;
        const across = stream.center + (u - .5) * span + stream.turn * flow;
        const separation = stream.peel * flow * (.76 + .24 * Math.sin(Math.PI * u));
        positions.push(...fallingPoint(across, down, separation).toArray());
        uvs.push(u, down);
        style.push(stream.start, stream.seed, across);
        if (row === rows || column === columns) continue;
        const a = offset + row * (columns + 1) + column, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('streamStyle', new Float32BufferAttribute(style, 3));
  geometry.setIndex(indices);
  const material = new ShaderMaterial({
    name: '卷过池缘的水帘和分流',
    transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    uniforms: {
      clock: { value: 0 }, night: { value: 0 }, twilight: { value: 0 }, lightDirection: { value: new Vector3() },
      cliffNormal: { value: new Vector3(outward.x, 0, outward.y) },
      dayBody: { value: new Color('#6ba4b1') }, dayFoam: { value: new Color('#e7f5ec') },
      nightBody: { value: new Color('#43758c') }, nightFoam: { value: new Color('#a9cbdf') },
    },
    vertexShader: `
      uniform float clock;
      uniform vec3 cliffNormal;
      attribute vec3 streamStyle;
      varying vec2 waterUV;
      varying vec3 style, worldPoint;
      void main() {
        waterUV = uv;
        style = streamStyle;
        float freedom = sin(uv.y * 3.14159);
        float tremor = sin(uv.y * 19. - clock * 2.54 + style.y + style.z * 14.)
          + .51 * sin(style.z * 27. + uv.y * 11. - clock * 1.66);
        vec3 moved = position + cliffNormal * (freedom * tremor * .025);
        vec4 world = modelMatrix * vec4(moved, 1.);
        worldPoint = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: waterNoise + `
      uniform float clock, night, twilight;
      uniform vec3 dayBody, dayFoam, nightBody, nightFoam, lightDirection;
      varying vec2 waterUV;
      varying vec3 style, worldPoint;
      void main() {
        float u = waterUV.x, down = waterUV.y, across = style.z;
        float ribbon = step(.01, style.x);
        float slide = down * 8.7 - clock * 2.02;
        float silk = grain(vec2(across * 8.1 + style.y, slide * .51));
        float ruffle = grain(vec2(across * 24. + silk * 1.44, slide * 1.63 + style.y * .4));
        float froth = grain(vec2(across * 40. - .51 * ruffle, slide * 2.64));
        float folds = grain(vec2(across * 15.6 + silk * 1.33 + .17 * sin(slide), slide * .31 + style.y));
        float thread = smoothstep(.40, .82, .65 * folds + .35 * ruffle);
        float flecks = smoothstep(.58, .89, .54 * ruffle + .46 * froth);
        float crest = exp(-pow((down - .042) * 13.1, 2.)) * (.49 + silk * .51) * (1. - ribbon);
        float curlLine = exp(-pow((down - .073 + (silk - .5) * .025) * 45., 2.))
          * smoothstep(.22, .76, ruffle * .69 + froth * .31) * (1. - ribbon);
        float foamAtFoot = smoothstep(.72, .995, down) * (.30 + .70 * ruffle);

        vec3 normal = normalize(cross(dFdx(worldPoint), dFdy(worldPoint)));
        vec3 eye = normalize(vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z));
        float grazing = pow(1. - clamp(abs(dot(normal, eye)), 0., 1.), 2.3);
        float sparkle = pow(abs(dot(normal, normalize(eye + lightDirection))), 18.);
        vec3 body = mix(dayBody, nightBody, night) * (.89 + .17 * folds);
        vec3 softFoam = mix(dayFoam, nightFoam, night) * vec3(1. + twilight * .07, 1., 1. - twilight * .07);
        float white = .17 + .25 * silk + .24 * thread + .15 * flecks
          + .22 * crest + .32 * curlLine + .26 * foamAtFoot + .08 * grazing + .07 * sparkle + .06 * ribbon;
        vec3 color = mix(body, softFoam, clamp(white, 0., .94));
        float margin = mix(.099, .21, ribbon);
        float softEdge = smoothstep(0., margin, u) * (1. - smoothstep(1. - margin, 1., u));
        float origin = mix(1., smoothstep(style.x, style.x + .13, down), ribbon);
        float fullness = mix(.36 + .27 * silk + .17 * thread + .11 * crest + .19 * curlLine, .16 + .38 * thread + .18 * flecks, ribbon);
        float breaks = 1. - smoothstep(.937 + .039 * froth, 1., down);
        gl_FragColor = vec4(color, clamp(softEdge * origin * fullness * breaks, 0., .90));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = '卷过池口的水帘和三道细流';
  mesh.renderOrder = 2;
  return mesh;
}

function makeSpray(impact: Vector3) {
  const random = seeded(4024), geometry = new BufferGeometry();
  const seeds: number[] = [], types: number[] = [];
  for (let i = 0; i < 83; i++) {
    seeds.push(random(), random(), random());
    types.push(i < 33 ? 0 : 1);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(seeds, 3));
  geometry.setAttribute('droplet', new Float32BufferAttribute(types, 1));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      clock: { value: 0 }, night: { value: 0 }, pixelScale: { value: 40 },
      lipAxis: { value: alongLip }, cliffAxis: { value: outward },
    },
    vertexShader: `
      uniform float clock, pixelScale;
      uniform vec2 lipAxis, cliffAxis;
      attribute float droplet;
      varying float strength, bead;
      void main() {
        bead = droplet;
        float speed = mix(.44 + position.z * .28, .82 + position.z * .72, bead);
        float age = fract(position.x + clock * speed);
        float az = position.y * 6.283;
        float lateral = (position.y - .5) * 1.15 + cos(az) * age * mix(.73, 1.16, bead);
        float away = .076 + age * (.31 + position.z * .62) + sin(az) * age * .43;
        vec2 spread = lateral * lipAxis + away * cliffAxis;
        float lift = mix(.13 + age * (.32 + position.z * .31),
          .030 + age * (1. - age) * (1.48 + position.z * 2.62), bead);
        vec3 offset = vec3(spread.x, lift, spread.y);
        float visible = smoothstep(.0, .12, age) * (1. - smoothstep(.44, 1., age));
        strength = visible * (.53 + .47 * position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(offset, 1.);
        float size = mix(.32 + age * .33 + .18 * position.z, .033 + position.z * .076, bead);
        gl_PointSize = clamp(pixelScale * size, 1.5, mix(68., 13., bead));
      }
    `,
    fragmentShader: `
      uniform float night;
      varying float strength, bead;
      void main() {
        vec2 q = gl_PointCoord * 2. - 1.;
        float radius = length(q * vec2(1., mix(1.42, .94, bead)));
        float wisps = exp(-radius * radius * 3.3) * (1. - smoothstep(.59, 1., radius));
        float glint = 1. - smoothstep(.08, .88, radius);
        float alpha = strength * mix(wisps * .28, glint * .52, bead);
        vec3 tint = mix(vec3(.82,.94,.90),vec3(.40,.59,.72),night);
        gl_FragColor = vec4(tint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Points(geometry, material);
  mesh.name = '瀑脚的低水雾和飞滴';
  mesh.position.set(impact.x, seaLevel + .012, impact.z);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return mesh;
}

interface WaterFrame {
  time: number; night: number; twilight: number; lightDirection: Vector3; pixelScale: number;
  swimmer: Vector2; swimAngle: number; paddle: number; boat: Vector2; hullAngle: number;
}

export function makeWater(mask: IslandSurfaceMask, compact: boolean) {
  const { lake, material: surface, invalidate } = makeLake(mask, compact);
  const impact = fallingPoint(.5, 1, 0);
  const sea = makeSea(impact), waterfall = makeWaterfall(), spray = makeSpray(impact);
  const root = new Group();
  root.name = '池塘、瀑布与海洋';
  root.add(sea, lake, waterfall, spray);
  const materials = [surface, sea.material, waterfall.material, spray.material];
  let reflectedNight = -1, reflectedTwilight = -1;
  return {
    root,
    invalidate,
    update({ time, night, twilight, lightDirection, pixelScale, swimmer, swimAngle, paddle, boat, hullAngle }: WaterFrame) {
      for (const material of materials) {
        material.uniforms.clock.value = time;
        material.uniforms.night.value = night;
      }
      if (Math.abs(night - reflectedNight) + Math.abs(twilight - reflectedTwilight) > .037) {
        reflectedNight = night;
        reflectedTwilight = twilight;
        invalidate();
      }
      const uniforms = surface.uniforms;
      uniforms.twilight.value = twilight;
      uniforms.lightDirection.value.copy(lightDirection);
      uniforms.swimmer.value.copy(swimmer);
      uniforms.swimAngle.value = swimAngle;
      uniforms.paddle.value = paddle;
      uniforms.boat.value.copy(boat);
      uniforms.hullAngle.value = hullAngle;
      sea.material.uniforms.twilight.value = twilight;
      waterfall.material.uniforms.twilight.value = twilight;
      waterfall.material.uniforms.lightDirection.value.copy(lightDirection);
      spray.material.uniforms.pixelScale.value = pixelScale;
    },
    dispose() { lake.getRenderTarget().dispose(); },
  };
}
