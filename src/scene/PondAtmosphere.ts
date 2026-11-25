import { Color, Group, InstancedMesh, MathUtils, Object3D, PlaneGeometry, ShaderMaterial, Vector3, Vector4 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { northDirection } from './time';
import type { lightingAt } from './time';
import { seededRandom } from './pond-life';
import { lunarVisibility, moonAngularRadius, pondSkyLight, sunAngularRadius } from './sky-light';

const upstream = (Sky as typeof Sky & { SkyShader: { fragmentShader: string } }).SkyShader.fragmentShader;
const noiseStart = upstream.indexOf('vec2 gradient('), noiseEnd = upstream.indexOf('// constants for atmospheric scattering');
if (noiseStart < 0 || noiseEnd < noiseStart) throw new Error('Unsupported Three Sky shader');
export const skyNoiseGLSL = upstream.slice(noiseStart, noiseEnd);

const cloudField = `
  uniform float atmosphereTime;
  uniform vec3 atmosphereSun;
  float cloudField(vec2 world) {
    vec2 p = world * vec2(.029, .044) + vec2(3.4, 1.2) + vec2(-.0048, .0019) * atmosphereTime;
    float weather = noise(p * .32 + vec2(2.6, 7.1));
    float broad = noise(p);
    float billows = noise(p * 2.7 + vec2(1.7, 4.3));
    float wisps = fbm(p * 5.1, atmosphereTime * .0015);
    return clamp(.35 + weather * .23 + broad * .56 + billows * .22 + wisps * .047, 0.0, 1.0);
  }
  float cloudOpacity(vec2 world) { return smoothstep(.39, .70, cloudField(world)) * .93; }
  vec2 cloudIntersection(vec3 origin, vec3 direction) {
    return origin.xz + direction.xz * ((49.0 - origin.y) / max(direction.y, .045));
  }
  float cloudHorizon(vec3 direction) { return smoothstep(.055, .20, direction.y); }
`;
export const cloudFieldGLSL = skyNoiseGLSL + cloudField;

const skyDiscs = `
  uniform float atmosphereNight;
  uniform float skyAfterglow;
  uniform float sunWarmth;
  uniform float lunarDiscVisibility;
  uniform vec3 lunarDirection;
  uniform vec3 lunarRight;
  uniform vec3 lunarUp;
  uniform vec3 lunarIllumination;
  uniform vec4 craters[12];

  vec3 solarLight(vec3 skyColor, vec3 direction, vec3 sunward) {
    float separation = max(0.0, 1.0 - dot(direction, sunward));
    float sunHere = smoothstep(-.003, .024, sunward.y);
    const float solarEdge = ${(1 - Math.cos(sunAngularRadius)).toFixed(9)};
    float softness = max(fwidth(separation), solarEdge * .09);
    float disc = 1.0 - smoothstep(solarEdge - softness, solarEdge + softness, separation);
    vec3 sunColor = mix(vec3(9.7, 9.0, 7.6), vec3(9.1, 4.7, 1.65), sunWarmth);
    float glow = .13 * exp2(-1050.0 * separation) + .041 * exp2(-95.0 * separation);
    return skyColor + sunColor * (disc + glow) * sunHere;
  }

  vec3 lunarLight(vec3 skyColor, vec3 direction) {
    vec2 disk = vec2(dot(direction, lunarRight), dot(direction, lunarUp)) / ${Math.sin(moonAngularRadius).toFixed(8)};
    float radius = length(disk), softness = clamp(fwidth(radius) * .64, .008, .45);
    float separation = max(0.0, 1.0 - dot(direction, lunarDirection));
    float halo = exp2(-760.0 * separation) * lunarDiscVisibility * atmosphereNight;
    skyColor += vec3(.035, .047, .079) * halo;
    if (separation > .001 || radius > 1.0 + softness || lunarDiscVisibility <= .001) return skyColor;

    vec3 surface = vec3(disk, sqrt(max(0.0, 1.0 - radius * radius)));
    vec3 worldNormal = lunarRight * surface.x + lunarUp * surface.y - lunarDirection * surface.z;
    float light = dot(worldNormal, lunarIllumination);
    float terminator = smoothstep(-.019, .047, light);
    float maria = smoothstep(-.16, .39, noise(surface.xy * 3.4 + vec2(4.3, 2.3)) + noise(surface.yz * 5.1) * .38);
    float albedo = .93 - maria * .32 + noise(surface.xz * 19.0) * .043;
    for (int i = 0; i < 12; i++) {
      float r = craters[i].w;
      float d = length(surface - craters[i].xyz);
      albedo += exp(-pow((d - r) / (r * .22), 2.0)) * .14 - exp(-pow(d / r, 4.0)) * .19;
    }
    float cold = smoothstep(.04, .42, lunarDirection.y);
    vec3 silver = mix(vec3(2.8, 1.82, 1.16), vec3(2.50, 2.63, 2.81), cold);
    vec3 moonColor = silver * albedo * (.024 + terminator * (.42 + .58 * max(light, 0.0)));
    float coverage = 1.0 - smoothstep(1.0 - softness, 1.0 + softness, radius);
    float opacity = coverage * lunarDiscVisibility * mix(.37, 1.0, atmosphereNight);
    opacity *= mix(.12 * atmosphereNight, 1.0, terminator);
    return mix(skyColor, moonColor, opacity);
  }
`;

export function makePondAtmosphere() {
  const sky = new Sky();
  sky.scale.setScalar(1100);
  const random = seededRandom(9172);
  const craters = Array.from({ length: 12 }, () => {
    const y = random() * 2 - 1, az = random() * Math.PI * 2, radial = Math.sqrt(1 - y * y);
    return new Vector4(Math.cos(az) * radial, y, Math.abs(Math.sin(az)) * radial, .046 + random() * .14);
  });
  const uniforms = {
    atmosphereTime: { value: 0 }, atmosphereNight: { value: 0 }, atmosphereSun: { value: new Vector3() },
    skyAfterglow: { value: 0 }, sunWarmth: { value: 0 }, lunarDiscVisibility: { value: 0 },
    lunarDirection: { value: new Vector3() }, lunarRight: { value: new Vector3() }, lunarUp: { value: new Vector3() },
    lunarIllumination: { value: new Vector3() }, craters: { value: craters },
  };
  Object.assign(sky.material.uniforms, uniforms);
  const clouds = upstream.indexOf('// Clouds');
  const output = upstream.indexOf('gl_FragColor = vec4( texColor, 1.0 );', clouds);
  if (clouds < 0 || output < clouds) throw new Error('Unsupported Three Sky composition');
  const source = upstream.slice(0, clouds) + `
    float elevation = max(0.0, direction.y);
    float horizon = exp2(-6.1 * elevation);
    vec3 darkSky = mix(vec3(.0038, .0092, .025), vec3(.019, .037, .069), horizon);
    texColor = mix(texColor * .19, darkSky, atmosphereNight);
    float bearing = .5 + .5 * dot(normalize(direction.xz + vec2(.0001)), normalize(vSunDirection.xz + vec2(.0001)));
    float sunward = pow(clamp(bearing, 0.0, 1.0), 3.1);
    float sunset = smoothstep(-.28, .28, vSunDirection.x);
    float dusk = skyAfterglow * (1.0 - smoothstep(-.026, .175, vSunDirection.y));
    float horizonHeat = exp2(-9.8 * max(0.0, elevation - .036));
    vec3 clearTwilight = mix(vec3(.145, .156, .227), vec3(.025, .050, .124), smoothstep(.02, .44, elevation));
    vec3 ember = mix(vec3(.89, .438, .217), vec3(.85, .287, .198), sunset);
    vec3 twilight = mix(clearTwilight, ember, horizonHeat * sunward);
    texColor = mix(texColor, twilight, dusk);
    texColor = lunarLight(solarLight(texColor, direction, vSunDirection), direction);

    if (direction.y > .055) {
      vec2 point = cloudIntersection(cameraPosition, direction);
      vec3 keyLight = normalize(mix(atmosphereSun, lunarDirection, atmosphereNight * lunarDiscVisibility * .77) + vec3(.0001));
      float density = cloudField(point);
      float edgeLight = cloudField(point + keyLight.xz * 4.1);
      float volume = clamp(.56 + (density - edgeLight) * 2.9 + noise(point * .078) * .15, .10, 1.0);
      vec3 bright = mix(vec3(.22, .30, .39), vec3(1.17, 1.30, 1.39), volume);
      bright *= mix(vec3(1.0), vec3(1.21, .85, .68), sunWarmth);
      float moonFacing = max(0.0, dot(direction, lunarDirection));
      vec3 dim = mix(vec3(.012, .020, .039), vec3(.062, .092, .148), volume);
      dim += vec3(.026, .033, .049) * lunarDiscVisibility * pow(moonFacing, 8.0);
      vec3 cloudColor = mix(dim, bright, smoothstep(-.038, .235, vSunDirection.y));
      vec3 litEdge = mix(vec3(.121, .134, .203), ember * .64, sunward);
      vec3 violet = mix(vec3(.040, .054, .103), litEdge, volume);
      cloudColor = mix(cloudColor, violet, dusk);
      float mask = smoothstep(.39, .70, density) * .93 * cloudHorizon(direction);
      texColor = mix(texColor, cloudColor, mask);
    }
  ` + upstream.slice(output);
  // The same direction and cloud layer are evaluated from the real and mirrored cameras.
  sky.material.fragmentShader = source.replace('void main() {', cloudField + skyDiscs + '\nvoid main() {');

  const starMaterial = new ShaderMaterial({
    uniforms: { ...uniforms, starVisibility: { value: 0 } }, transparent: true, depthWrite: false,
    vertexShader: cloudFieldGLSL + `
      varying vec2 starUV; varying vec3 starTint; varying float starVeil; varying float starPhase;
      void main() {
        vec3 direction = normalize(mat3(modelMatrix) * instanceMatrix[3].xyz);
        vec4 center = viewMatrix * vec4(cameraPosition + direction * 740.0, 1.0);
        center.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * center;
        starUV = uv; starTint = instanceColor;
        starPhase = dot(direction, vec3(391.0, 142.0, 287.0));
        float veil = cloudOpacity(cloudIntersection(cameraPosition, direction)) * cloudHorizon(direction);
        starVeil = (1.0 - veil) * smoothstep(.045, .185, direction.y);
      }`,
    fragmentShader: `uniform float atmosphereTime; uniform float starVisibility;
      varying vec2 starUV; varying vec3 starTint; varying float starVeil; varying float starPhase;
      void main() {
        vec2 p = starUV * 2.0 - 1.0;
        float r = dot(p, p);
        float core = exp(-r * 21.0);
        float halo = exp(-r * 5.0) * .11;
        float twinkle = .91 + .09 * sin(atmosphereTime * .49 + starPhase);
        float alpha = min(1.0, (core + halo) * starVisibility * starVeil * twinkle);
        gl_FragColor = vec4(starTint, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const stars = new InstancedMesh(new PlaneGeometry(1, 1), starMaterial, 490);
  const transform = new Object3D(), starBlue = new Color().setRGB(1.15, 1.52, 2.10), starGold = new Color().setRGB(2.36, 1.86, 1.29);
  for (let i = 0; i < stars.count; i++) {
    const y = random() * 2 - 1, azimuth = random() * Math.PI * 2, radial = Math.sqrt(1 - y * y);
    transform.position.set(Math.cos(azimuth) * radial, y, Math.sin(azimuth) * radial);
    const bright = random() > .94;
    transform.scale.setScalar(bright ? 6.0 + random() * 2.4 : 1.9 + random() * 3.5);
    transform.updateMatrix();
    stars.setMatrixAt(i, transform.matrix);
    const tint = starBlue.clone().lerp(starGold, random()).multiplyScalar(bright ? 1.4 : .48 + random() * .42);
    stars.setColorAt(i, tint);
  }
  stars.frustumCulled = false;
  stars.name = 'PondStars';
  const group = new Group();
  group.add(sky, stars);
  const pole = new Vector3(), lightOnDisc = new Vector3();

  return {
    group, uniforms,
    update(time: number, light: ReturnType<typeof lightingAt>) {
      const air = pondSkyLight(light.sunAltitude);
      uniforms.atmosphereTime.value = time;
      uniforms.atmosphereNight.value = air.darkness;
      uniforms.skyAfterglow.value = air.afterglow;
      uniforms.sunWarmth.value = air.sunWarmth;
      const sun = uniforms.atmosphereSun.value.set(...light.sun).normalize();
      const moon = uniforms.lunarDirection.value.set(...light.moon).normalize();
      uniforms.lunarDiscVisibility.value = lunarVisibility(light.moonAltitude, light.moonFraction);
      const latitude = MathUtils.degToRad(light.latitude);
      pole.set(...northDirection).multiplyScalar(Math.cos(latitude)).setY(Math.sin(latitude));
      uniforms.lunarRight.value.crossVectors(pole, moon).normalize();
      uniforms.lunarUp.value.crossVectors(moon, uniforms.lunarRight.value);
      lightOnDisc.copy(sun).addScaledVector(moon, -sun.dot(moon)).normalize();
      const face = 2 * light.moonFraction - 1;
      uniforms.lunarIllumination.value.copy(lightOnDisc).multiplyScalar(Math.sqrt(Math.max(0, 1 - face * face))).addScaledVector(moon, -face);
      sky.material.uniforms.sunPosition.value.copy(sun);
      sky.material.uniforms.turbidity.value = 4.3 + air.afterglow * 2.45;
      sky.material.uniforms.rayleigh.value = 2.4;
      sky.material.uniforms.showSunDisc.value = 0;
      stars.quaternion.setFromAxisAngle(pole, light.siderealAngle);
      starMaterial.uniforms.starVisibility.value = air.starlight;
      stars.visible = air.starlight > .008;
    },
    dispose() {
      sky.geometry.dispose();
      sky.material.dispose();
      stars.geometry.dispose();
      starMaterial.dispose();
      stars.dispose();
    },
  };
}
