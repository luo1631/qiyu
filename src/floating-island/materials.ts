import { Color } from 'three';
import type { MeshStandardMaterial } from 'three';
import { skyNoiseGLSL } from '../scene/surface-noise';
import type { IslandSurfaceMask } from './terrain';

const finish = {
  grass: `
    vec2 p = islandSurfacePosition.xz;
    float meadow = smoothstep(.006, .052, diffuseColor.g - diffuseColor.r);
    float broad = noise(p * .60 + vec2(3., 8.));
    float tufts = noise(p * vec2(4.4, 5.8));
    float grain = noise(p * 24.);
    float detail = 1. - smoothstep(.013, .044, length(fwidth(p)));
    vec3 paleGreen = vec3(1.065, 1.035, .925);
    vec3 deepGreen = vec3(.90, .96, 1.04);
    vec3 pigment = mix(deepGreen, paleGreen, smoothstep(-.54, .62, broad + tufts * .27));
    diffuseColor.rgb *= mix(vec3(1.), pigment, meadow)
      * (1. + broad * .072 + tufts * mix(.035, .108, meadow) + grain * .10 * detail);
    float trail = texture2D(surfaceMask, (p - surfaceOrigin) / surfaceSpan).r;
    float trailEdge = clamp(trail + (.18 * tufts + .09 * grain * detail) * (1. - abs(2. * trail - 1.)), 0., 1.);
    vec3 dust = mix(trailShadow, trailSun, smoothstep(.16, .94, trailEdge + broad * .25));
    dust *= 1. + tufts * .095 + grain * .16 * detail;
    diffuseColor.rgb = mix(diffuseColor.rgb, dust, smoothstep(.04, .95, trailEdge));
  `,
  stone: `
    vec3 p = islandSurfacePosition;
    vec2 mineral = vec2(dot(p, vec3(.88, .25, -.48)), dot(p, vec3(.32, .78, .43)));
    float cloud = noise(mineral * vec2(1.7, 2.6));
    float fine = noise(mineral * 14.);
    float detail = 1. - smoothstep(.018, .059, length(fwidth(p)));
    vec3 quarry = mix(vec3(.92, .95, 1.055), vec3(1.08, 1.035, .95), smoothstep(-.53, .64, cloud));
    diffuseColor.rgb *= quarry * (1. + cloud * .11 + fine * .039 * detail);
  `,
};

export function islandSurface(material: MeshStandardMaterial, surface: 'stone'): MeshStandardMaterial;
export function islandSurface(material: MeshStandardMaterial, surface: 'grass', mask: IslandSurfaceMask): MeshStandardMaterial;
export function islandSurface(material: MeshStandardMaterial, surface: keyof typeof finish, mask?: IslandSurfaceMask) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 islandSurfacePosition;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vec4 surfaceVertex = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        surfaceVertex = instanceMatrix * surfaceVertex;
      #endif
      islandSurfacePosition = (modelMatrix * surfaceVertex).xyz;
      #include <project_vertex>
    `);
    let uniforms = '';
    if (mask) {
      shader.uniforms.surfaceMask = { value: mask.texture };
      shader.uniforms.surfaceOrigin = { value: mask.origin };
      shader.uniforms.surfaceSpan = { value: mask.span };
      shader.uniforms.trailShadow = { value: new Color('#876449') };
      shader.uniforms.trailSun = { value: new Color('#dc9f64') };
      uniforms = 'uniform sampler2D surfaceMask;\nuniform vec2 surfaceOrigin, surfaceSpan;\nuniform vec3 trailShadow, trailSun;\n';
    }
    shader.fragmentShader = skyNoiseGLSL + uniforms + 'varying vec3 islandSurfacePosition;\n'
      + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        { ${finish[surface]} }
      `);
  };
  material.customProgramCacheKey = () => `island-surface-${surface}`;
  return material;
}
