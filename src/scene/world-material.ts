import { LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Material, Object3D } from 'three';
import { skyNoiseGLSL } from './PondAtmosphere';

const timberAxes = new Map([
  ['LandingWood', new Vector3(1, 0, 1)],
  ['Wood', new Vector3(1, 0, 0)],
  ['WoodLight', new Vector3(1, 0, 0)],
  ['WoodEnd', new Vector3(1, 0, 0)],
  ['MailCedar', new Vector3(0, 0, 1)],
  ['MailCedarWarm', new Vector3(0, 0, 1)],
  ['MailCedarLight', new Vector3(0, 1, 0)],
  ['PavilionTimber', new Vector3(0, 1, 0)],
]);

function outdoorTimber(material: MeshStandardMaterial, grainAxis: Vector3) {
  material.roughness = Math.max(material.roughness, .76);
  material.onBeforeCompile = shader => {
    shader.uniforms.timberAxis = { value: grainAxis };
    shader.vertexShader = 'varying vec3 timberPosition;\nvarying vec3 timberNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      timberPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      timberNormal = (vec4(transformedNormal, 0.0) * viewMatrix).xyz;
    `);
    shader.fragmentShader = skyNoiseGLSL + '\nvarying vec3 timberPosition;\nvarying vec3 timberNormal;\nuniform vec3 timberAxis;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 p = timberPosition;
      float damp = 1.0 - smoothstep(-.14, .21, p.y);
      float detail = 1.0 - smoothstep(.009, .033, length(fwidth(p)));
      // Preserve upward grain on the wet piles, and follow the axis of the boards above.
      vec3 axis = timberAxis;
      if (axis.x > 0.5 && axis.z > 0.5) {
        float upright = (1.0 - smoothstep(.08, .36, p.y)) * (1.0 - abs(normalize(timberNormal).y));
        axis = normalize(vec3(1.0 - upright, upright, 0.0));
      }
      float along = dot(p, axis);
      vec3 across = p - along * axis;
      vec2 grain = vec2(dot(across, vec3(.79, .53, .97)), along);
      float rings = noise(grain * vec2(27.0, 2.0));
      float fibers = noise(grain * vec2(92.0, 7.0));
      float weather = noise(p.xz * 4.0 + p.y * vec2(.9, 1.8));
      float bleaching = smoothstep(.02, .48, weather) * (1.0 - damp);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.89, 1.02, 1.18), bleaching * .42);
      diffuseColor.rgb *= 1.0 + weather * .16 + (rings * .20 + fibers * .105) * detail - damp * .20;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + bleaching * .11 - damp * .18, .5, .96);
    `);
  };
  material.customProgramCacheKey = () => 'pond-outdoor-timber';
}

/** One light response for the live islands and their authoring review. Palette
 * maps and vertex pigments remain authored; roughness survives GLB optimization. */
export function worldMaterial(source: Material, node?: Object3D): Material {
  const material = source.clone();
  if (material instanceof MeshStandardMaterial) {
    material.metalness = Math.min(.12, material.metalness);
    material.roughness = Math.max(.28, material.roughness);
    const grainAxis = timberAxes.get(material.name);
    if (grainAxis) {
      const axis = node && material.name.startsWith('MailCedar')
        ? grainAxis.clone().applyQuaternion(node.getWorldQuaternion(new Quaternion())) : grainAxis;
      outdoorTimber(material, axis);
    }
  }
  return material;
}

/** The monitor retains the contrast of its lettering in shadow and at night. */
export function tuneDeskDisplay(material: MeshStandardMaterial) {
  material.roughness = .68;
  material.metalness = 0;
  material.color.set('#c4c6b5');
  material.emissive.set('#b8c4ad');
  material.emissiveIntensity = .035;
  const map = material.map;
  if (!map) return;
  // Filter the small embedded reference across the reflected surface as well.
  if (map.anisotropy < 4 || map.minFilter !== LinearMipmapLinearFilter || !map.generateMipmaps) {
    map.minFilter = LinearMipmapLinearFilter;
    map.magFilter = LinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = 4;
    map.needsUpdate = true;
  }
  material.emissiveMap = map;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      // A small falloff along the glass, kept neutral around the symbol.
      vec2 glass = abs(vMapUv - vec2(.565, .547));
      diffuseColor.rgb *= 1.0 - smoothstep(.26, .60, length(glass)) * .13;
    `);
  };
  material.customProgramCacheKey = () => 'pond-desk-display';
}
