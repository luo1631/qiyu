import { BufferGeometry, Color, Float32BufferAttribute, MathUtils, MeshStandardMaterial } from 'three';
import { skyNoiseGLSL } from './PondAtmosphere';

const profiles = [
  [[-.61,.49],[-.52,.70],[-.27,.93],[-.016,1],[.27,.87],[.49,.71],[.62,.47],[.65,.14]],
  [[-.62,.53],[-.58,.78],[-.34,.97],[-.16,1],[.13,.94],[.31,.83],[.42,.72],[.46,.24]],
  [[-.65,.47],[-.55,.70],[-.29,.89],[-.065,1],[.20,.90],[.45,.77],[.65,.51],[.71,.17]],
] as const;

/** Worn sections share an inner footprint with offset layers of exposed rock. */
export function stoneGeometry(variant = 0) {
  const profile = profiles[MathUtils.euclideanModulo(variant, profiles.length)], sides = 13;
  const seed = .81 + variant * 3.714, positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const under = new Color('#817d72'), mineral = new Color('#b8b3a8'), weather = new Color('#ded3bd'), tint = new Color();
  for (const [row,[y,radius]] of profile.entries()) {
    const joint = MathUtils.smoothstep(y, -.58, .44);
    for (let i = 0; i < sides; i++) {
      const a = 2*Math.PI*i/sides + seed*.22;
      const x = Math.cos(a), z = Math.sin(a);
      const face = 1 + .096 * Math.cos(a * 3 + seed) + .049 * Math.sin(a * 5 - seed * .71) + .042 * Math.cos(a*2 + row*.97 + seed);
      const broken = .070 * Math.cos(a * 3.0 + y*4.2 - seed) * Math.sin(Math.PI*(row+.47)/profile.length);
      positions.push(x*radius*face+.126*joint*Math.sin(seed),y+(.126*x-.082*z)*radius+broken,
        z*radius*(.94+.072*Math.cos(seed))*face - .088*joint*Math.cos(seed));
      const seam = .50 + .50 * Math.cos(y * 22 + x * 3.7 + z * 2.5 - seed);
      tint.copy(under).lerp(mineral, .42 + .58 * joint).lerp(weather, .32 * joint * (.63 + .37 * Math.sin(a + seed)));
      tint.multiplyScalar(.91 + .13 * seam + .039 * Math.sin(a*5 + seed));
      colors.push(tint.r,tint.g,tint.b);
      if (row + 1 === profile.length) continue;
      const p = row*sides+i, q = row*sides+(i+1)%sides;
      faces.push(p,p+sides,q, q,p+sides,q+sides);
    }
  }
  const last = (profile.length-1)*sides;
  for (let i = 1; i < sides-1; i++) faces.push(0,i,i+1, last,last+i+1,last+i);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

/** Mineral variation is world-scaled, so separate stones never repeat a map. */
export function weatherStone(material: MeshStandardMaterial) {
  const compile = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader = 'varying vec3 mineralPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 stoneVertex = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        stoneVertex = instanceMatrix * stoneVertex;
      #endif
      mineralPosition = (modelMatrix * stoneVertex).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader = skyNoiseGLSL + 'varying vec3 mineralPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 p = mineralPosition;
      vec2 grainPoint = p.xz * mat2(.85,-.53,.53,.85);
      grainPoint.y += p.y * .6;
      float mottling = noise(grainPoint * 9.0);
      float resolution = max(length(dFdx(p)), length(dFdy(p)));
      float fineDetail = 1.0 - smoothstep(.013, .034, resolution);
      vec2 seam = vec2(dot(p, vec3(.68,.25,-.69)), dot(p, vec3(.39,.76,.42)));
      float band = noise(seam * vec2(7.0, 24.0));
      float mineral = smoothstep(-.10, .38, band);
      float lamina = abs(fract(seam.y * 7.1 + .12 * mottling) - .50);
      float strata = (1.0 - smoothstep(.035, .155, lamina)) * smoothstep(.0, .39, band);
      float specks = noise(grainPoint * 87.0) * fineDetail;
      vec3 warm = diffuseColor.rgb * vec3(1.05, 1.00, .93);
      vec3 cool = diffuseColor.rgb * vec3(.88, .96, 1.05);
      diffuseColor.rgb = mix(warm, cool, mineral * .50 + .23);
      diffuseColor.rgb *= 1.0 + mottling * .20 + specks * .16 + strata * .075 * fineDetail;
    `);
  };
  material.customProgramCacheKey = () => 'pond-stone\n' + baseKey;
  material.needsUpdate = true;
  return material;
}
