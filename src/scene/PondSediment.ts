import { MeshStandardMaterial } from 'three';
import type { DataTexture } from 'three';
import { cloudFieldGLSL } from './PondAtmosphere';
import type { makePondAtmosphere } from './PondAtmosphere';
import { terrainSize } from './PondTerrain';
import { outerShoreGLSL, shoreSedimentGLSL, wetShoreSand } from './shore-layout';

/** The bed and the submerged portions of the island skirts share this palette. */
export function makePondSediment(terrain: DataTexture, atmosphere: ReturnType<typeof makePondAtmosphere>['uniforms']) {
  const time = { value: 0 }, sunlight = { value: 1 };
  const apply = (material: MeshStandardMaterial, skirt: boolean) => {
    const uniforms = { pondTime: time, pondSunlight: sunlight, pondTerrain: { value: terrain }, wetShoreSand: { value: wetShoreSand } };
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, atmosphere);
      shader.vertexShader = 'varying vec3 sedimentPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nsedimentPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = cloudFieldGLSL + shoreSedimentGLSL + (skirt ? '' : outerShoreGLSL) + `
        varying vec3 sedimentPosition;
        uniform float pondTime;
        uniform float pondSunlight;
        uniform sampler2D pondTerrain;
        uniform vec3 wetShoreSand;

        float shallowCaustics(vec2 point) {
          // A warped cellular field concentrates light in short, uneven arcs.
          vec2 drift = vec2(pondTime * .027, -pondTime * .018);
          vec2 warp = vec2(noise(point * 1.3 + drift), noise(point * 1.1 - drift + 5.2));
          vec2 p = point * 1.52 + warp * .63 + drift;
          vec2 cell = floor(p), local = fract(p);
          float nearest = 8.0, second = 8.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)), id = cell + offset;
            vec2 random = fract(sin(vec2(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)))) * 43758.5453);
            vec2 focus = .5 + .28 * sin(random * 6.28318 + pondTime * .22);
            vec2 delta = offset + focus - local;
            float distance = dot(delta, delta);
            second = min(second, max(nearest, distance));
            nearest = min(nearest, distance);
          }
          float pool = smoothstep(.0, .28, noise(point * .47 + vec2(2.5, 11.8)));
          float breaks = smoothstep(-.12, .25, noise(point * 2.4 + warp));
          return (1.0 - smoothstep(.006, .080, second - nearest)) * pool * mix(.15, 1.0, breaks);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec2 point = sedimentPosition.xz;
        float depth = max(0.0, -sedimentPosition.y);
        ${skirt ? '' : 'float sandGrain = 1.0 - smoothstep(.009, .029, max(length(dFdx(point)), length(dFdy(point))));'}
        ${skirt ? `
          float footprint = max(length(dFdx(point)), length(dFdy(point)));
          float grainFilter = 1.0 - smoothstep(.008, .029, footprint);
          float gritFilter = 1.0 - smoothstep(.020, .069, footprint);
          float skirtRelief = 0.0;
          if (sedimentPosition.y > -.10) {
            float patches = noise(point * 2.65) + noise(point * 6.9) * .31;
            float grit = noise(point * 16.5) * gritFilter;
            float grains = noise(point * 67.0) * grainFilter;
            float grass = smoothstep(.006, .075, diffuseColor.g - diffuseColor.r);
            float crust = smoothstep(-.21, .45, patches);
            vec3 pigment = mix(vec3(.83,.83,.78), vec3(1.13,1.10,1.02), crust);
            diffuseColor.rgb *= mix(pigment, vec3(.86,1.09,.97), grass * crust * .45);
            diffuseColor.rgb *= 1.0 + grit * mix(.24, .15, grass) + grains * .12;
            float lip = (1.0 - smoothstep(.036, .155, sedimentPosition.y)) * (1.0 - grass * .8);
            vec3 dampSand = shoreSediment(point, sedimentPosition.y * 3.5, wetShoreSand, grainFilter);
            diffuseColor.rgb = mix(diffuseColor.rgb, dampSand, lip * .75);
            skirtRelief = (.013 * patches + .0052 * grit + .0023 * grains) * smoothstep(-.10, .022, sedimentPosition.y);
          }
        ` : ''}
        ${skirt ? 'if (sedimentPosition.y < .095) {' : ''}
          vec4 data = texture2D(pondTerrain, point / ${terrainSize.toFixed(1)} + .5);
          float soil = smoothstep(.04, .92, data.g);
          float mineral = noise(point * 3.15 + vec2(9.8, 2.4));
          vec3 silt = vec3(.101, .160, .130);
          vec3 sand = vec3(.33, .302, .216);
          vec3 bed = mix(silt, sand, soil);
          bed = mix(bed, vec3(.248, .261, .211), data.a * .38);
          float moss = smoothstep(.55, .87, data.b + mineral * .19);
          vec3 mossColor = mix(vec3(.138, .199, .100), vec3(.230, .285, .151), .5 + .5 * mineral);
          bed = mix(bed, mossColor, moss * .60);
          // Warm mineral sediment reads through the shelves. Deep silt has less local contrast.
          bed = mix(wetShoreSand, bed, smoothstep(.015, .70, depth));
          bed = mix(bed, silt, smoothstep(1.10, 1.86, depth) * .56);
          float fine = noise(point * 26.0);
          bed *= 1.0 + (.14 * mineral + .09 * fine) * smoothstep(.0, .18, depth);
          ${skirt ? '' : `
            if (depth < .22) {
              float rim = outerShoreDistance(point);
              if (rim > -.84) {
                vec3 sediment = shoreSediment(point, rim, wetShoreSand, sandGrain);
                bed = mix(bed, sediment, smoothstep(-.84, -.17, rim));
              }
            }
          `}
          float focus = smoothstep(.08, .26, depth) * (1.0 - smoothstep(.68, 1.55, depth));
          if (pondSunlight > .03 && focus > .01) {
            vec2 shadowPoint = cloudIntersection(sedimentPosition, atmosphereSun);
            float sun = pondSunlight * (1.0 - .75 * cloudOpacity(shadowPoint));
            vec3 refractedSun = refract(-atmosphereSun, vec3(0.0, 1.0, 0.0), .752);
            vec2 surfaceEntry = point - refractedSun.xz * depth / max(.35, -refractedSun.y);
            bed *= 1.0 + shallowCaustics(surfaceEntry) * focus * sun * .38;
          }
          ${skirt ? 'diffuseColor.rgb = mix(bed, diffuseColor.rgb, smoothstep(-.10, .095, sedimentPosition.y));' : 'diffuseColor.rgb = bed;'}
        ${skirt ? '}' : ''}
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        ${skirt ? 'roughnessFactor = mix(.59, .97, smoothstep(.025, .19, abs(sedimentPosition.y)));'
          : 'roughnessFactor = mix(.56, .98, smoothstep(.02, .22, -sedimentPosition.y));'}
      `);
      if (skirt) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        vec3 groundDx = dFdx(-vViewPosition), groundDy = dFdy(-vViewPosition);
        vec3 gradX = cross(groundDy, normal), gradY = cross(normal, groundDx);
        float area = dot(groundDx, gradX);
        vec3 slope = dFdx(skirtRelief) * gradX + dFdy(skirtRelief) * gradY;
        normal = normalize(max(abs(area), .00000001) * normal - sign(area) * slope);
      `);
    };
    material.customProgramCacheKey = () => skirt ? 'pond-sediment-skirt' : 'pond-sediment-bed';
    material.needsUpdate = true;
    return material;
  };
  const ground = apply(new MeshStandardMaterial({ roughness: .98 }), false);
  return {
    ground,
    applyToSkirt: (material: MeshStandardMaterial) => apply(material, true),
    update(pondTime: number, sunPower: number) { time.value = pondTime; sunlight.value = sunPower / 2.6; },
  };
}
