import { BackSide, Box3, Color, FrontSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshDepthMaterial, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import { softenVegetation } from './vegetation-material';
import { waterLevel, waterPassMargin } from './PondOptics';
import { windWaves } from './pond-life';

export const plantPrefabs = {
  small: 'EN_GrassSmall', medium: 'EN_GrassMedium', large: 'EN_GrassLarge',
  spreading: 'EN_ShrubSpreading', compact: 'EN_ShrubCompact', open: 'EN_ShrubOpen',
  cover: 'EN_Groundcover', flowers: 'EN_MeadowFlowers',
} as const;
export type PlantKind = keyof typeof plantPrefabs;
export interface PlantClump {
  kind: PlantKind; x: number; z: number; scale: number; angle: number; zone: string;
  spread?: readonly [width: number, depth: number];
  heightScale?: number;
  tint?: Color;
  maxRoots?: number;
  rootDepth?: number;
}

const plantBend = `
  if (plantWind.z > 0.0) {
    vec2 strength = sin(plantWindPhase - plantWind.xy);
    vec2 gust = plantWindAxes.xy * strength.x + plantWindAxes.zw * strength.y;
    transformed.xz += gust * plantFlex * plantWind.z;
  }
`;

function applyPlantWind(material: MeshDepthMaterial | MeshStandardMaterial, wind: { value: Vector3 }) {
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.uniforms.plantWind = wind;
    shader.vertexShader = 'uniform vec3 plantWind;\nattribute vec2 plantWindPhase;\nattribute vec4 plantWindAxes;\nattribute float plantFlex;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + plantBend);
  };
  material.customProgramCacheKey = () => key + '\npond-plant-wind';
}

/** Ground each authored root independently and split geometry batches along
 * the waterline so each capture submits only the blades it can see. */
export function placePlantClumps(kit: Object3D, placements: PlantClump[], heightAt: (x: number, z: number) => number, low = false) {
  const group = new Group(); group.name = 'PlantClumps';
  const wind = { value: new Vector3() };
  const grassDepth = new MeshDepthMaterial();
  applyPlantWind(grassDepth, wind);
  kit.updateWorldMatrix(true, true);
  const compact = new Map<number | string, Mesh>();
  if (low) kit.traverse(object => {
    if (object instanceof Mesh) {
      const variant = object.userData.compactGrassVariant ?? object.userData.compactPlantVariant;
      if (variant !== undefined) compact.set(variant, object);
    }
  });
  const batches = new Map<string, { source: Mesh; matrices: Matrix4[]; colors: Color[]; wet: boolean; grass: boolean; groundcover: boolean; name: string }>();
  const roots: { x: number; y: number; z: number; zone: string; clump: number }[] = [];
  const zoneCounts: Record<string, number> = {};
  const rotation = new Quaternion(), up = new Vector3(0, 1, 0), point = new Vector3(), bounds = new Box3();
  const local = new Matrix4(), neutral = new Color().setRGB(.97, .98, .94);
  placements.forEach((placement, clump) => {
    const prefab = kit.getObjectByName(plantPrefabs[placement.kind]);
    if (!prefab) throw new Error('Missing plant prefab: ' + plantPrefabs[placement.kind]);
    const toPrefab = new Matrix4().copy(prefab.matrixWorld).invert();
    const base = new Matrix4().compose(
      new Vector3(placement.x, 0, placement.z),
      rotation.setFromAxisAngle(up, placement.angle),
      new Vector3(placement.scale, placement.scale * (placement.heightScale ?? 1), placement.scale),
    );
    const rootCount = Number(prefab.userData.rootCount) || 1;
    const keep = Math.min(rootCount, placement.maxRoots ?? rootCount);
    let rootIndex = 0;
    prefab.traverse(source => {
      if (!(source instanceof Mesh)) return;
      // Evenly sample the ordered planting pattern while retaining its first root.
      const index = rootIndex++;
      if (Math.ceil(index * keep / rootCount) === Math.ceil((index + 1) * keep / rootCount)) return;
      local.multiplyMatrices(toPrefab, source.matrixWorld);
      if (placement.spread) {
        local.elements[12] *= placement.spread[0];
        local.elements[14] *= placement.spread[1];
      }
      const matrix = base.clone().multiply(local);
      const variant = source.userData.grassVariant ?? source.userData.plantVariant;
      const shape = compact.get(variant) ?? source;
      const geometry = shape.geometry;
      point.setFromMatrixPosition(matrix);
      const height = heightAt(point.x, point.z);
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const verticalScale = Math.hypot(matrix.elements[4], matrix.elements[5], matrix.elements[6]);
      matrix.elements[13] = height - geometry.boundingBox!.min.y * verticalScale - (placement.rootDepth ?? .002);
      roots.push({ x: point.x, y: height, z: point.z, zone: placement.zone, clump });
      zoneCounts[placement.zone] = (zoneCounts[placement.zone] ?? 0) + 1;
      // A handful of roots at the waterline must not pull hundreds of dry
      // blades into the refraction pass via the batch's combined bounds.
      const wet = bounds.copy(geometry.boundingBox!).applyMatrix4(matrix).min.y <= waterLevel + waterPassMargin;
      const grass = placement.kind === 'small' || placement.kind === 'medium' || placement.kind === 'large';
      const groundcover = placement.kind === 'cover' || placement.kind === 'flowers';
      const key = `${geometry.uuid}:${wet}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { source: shape, matrices: [], colors: [], wet, grass, groundcover, name: geometry.name || shape.name || placement.kind };
        batches.set(key, batch);
      }
      batch.matrices.push(matrix);
      batch.colors.push(placement.tint ?? neutral);
    });
  });
  const grassyCasters: InstancedMesh[] = [];
  for (const { source, matrices, colors, wet, grass, groundcover, name } of batches.values()) {
    const original = Array.isArray(source.material) ? source.material[0] : source.material;
    const material = original.clone();
    if (material instanceof MeshStandardMaterial) {
      softenVegetation(material, false, groundcover, !grass && !groundcover);
      // Blender exports an outward-wound closed shell for each blade and stem.
      // The opposite surfaces are already present in the geometry.
      material.side = FrontSide;
      material.shadowSide = BackSide;
      if (grass) applyPlantWind(material, wind);
    }
    const mesh = new InstancedMesh(source.geometry.clone(), material, matrices.length);
    mesh.name = (wet ? 'WaterSedges-' : 'ShorePlants-') + name;
    mesh.castShadow = !wet;
    mesh.receiveShadow = true;
    matrices.forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, colors[i]); });
    if (grass) {
      if (!wet) { mesh.customDepthMaterial = grassDepth; grassyCasters.push(mesh); }
      // Each static root contributes a fixed phase and local direction. The
      // visible and shadow shaders share these streams and a single clock.
      const positions = mesh.geometry.attributes.position;
      const flex = new Float32Array(positions.count);
      for (let i = 0; i < flex.length; i++) flex[i] = Math.min(Math.max(0, positions.getY(i)) ** 2, .36);
      const phases = new Float32Array(matrices.length * 2), axes = new Float32Array(matrices.length * 4);
      matrices.forEach((matrix, i) => {
        const m = matrix.elements;
        windWaves.forEach(({ x, z, frequency, amplitude }, wave) => {
          phases[i * 2 + wave] = (m[12] * x + m[14] * z) * frequency * .31;
          const strength = amplitude * 10;
          axes[i * 4 + wave * 2] = (m[0] * x + m[2] * z) * strength / (m[0] ** 2 + m[1] ** 2 + m[2] ** 2);
          axes[i * 4 + wave * 2 + 1] = (m[8] * x + m[10] * z) * strength / (m[8] ** 2 + m[9] ** 2 + m[10] ** 2);
        });
      });
      mesh.geometry.setAttribute('plantFlex', new Float32BufferAttribute(flex, 1));
      mesh.geometry.setAttribute('plantWindPhase', new InstancedBufferAttribute(phases, 2));
      mesh.geometry.setAttribute('plantWindAxes', new InstancedBufferAttribute(axes, 4));
      mesh.computeBoundingSphere();
      mesh.boundingSphere!.radius += .09;
    }
    group.add(mesh);
  }
  group.userData.plantRoots = roots;
  group.userData.clumps = placements;
  group.userData.zoneCounts = zoneCounts;
  return { group, grassyCasters, update(time: number) {
    const fade = Math.min(1, time / 1.1);
    wind.value.set(time * windWaves[0].speed * 1.65, time * windWaves[1].speed * 1.65, fade * fade * (3 - 2 * fade));
  }, dispose() { grassDepth.dispose(); } };
}
