import {
  BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial,
  SkinnedMesh, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type Point3 = readonly [number, number, number];
type Section = readonly [x: number, y: number, z: number, width: number, depth: number];
type Pigment = (point: Vector3, progress: number, angle: number) => Color;

export function boatSurface(positions: number[], faces: number[], uv: number[], colors?: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  if (colors) geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** An elliptical section follows an authored centreline. Width stays close to the reference axis. */
export function boatForm(
  sections: readonly Section[], rows: number, sides: number, widthAxis: Point3, pigment?: Pigment,
) {
  const spine = new CatmullRomCurve3(sections.map(([x, y, z]) => new Vector3(x, y, z)));
  const radii = new CatmullRomCurve3(sections.map(([, , , width, depth], i) => new Vector3(width, depth, i)), false, 'catmullrom');
  const tangent = new Vector3(), width = new Vector3(), normal = new Vector3(), point = new Vector3();
  const reference = new Vector3(...widthAxis).normalize();
  const positions: number[] = [], colors: number[] = [], faces: number[] = [], uv: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows, center = spine.getPoint(t), size = radii.getPoint(t);
    spine.getTangent(t, tangent);
    width.copy(reference).addScaledVector(tangent, -reference.dot(tangent));
    if (width.lengthSq() < .00001) width.set(0, 0, 1).addScaledVector(tangent, -tangent.z);
    width.normalize();
    normal.crossVectors(width, tangent);
    for (let col = 0; col < sides; col++) {
      const a = col * (Math.PI * 2 / sides);
      point.copy(center).addScaledVector(width, Math.max(.0003, size.x) * Math.cos(a));
      point.addScaledVector(normal, Math.max(.0003, size.y) * Math.sin(a));
      positions.push(point.x, point.y, point.z);
      uv.push(t, col / sides);
      if (pigment) {
        const color = pigment(point, t, a);
        colors.push(color.r, color.g, color.b);
      }
      if (row === rows) continue;
      const p = row * sides + col, q = row * sides + (col + 1) % sides;
      faces.push(p, p + sides, q, q, p + sides, q + sides);
    }
  }
  for (let col = 1; col < sides - 1; col++) {
    faces.push(0, col, col + 1);
    const end = rows * sides;
    faces.push(end, end + col + 1, end + col);
  }
  return boatSurface(positions, faces, uv, pigment ? colors : undefined);
}

export function boatPart(root: Group, name: string, geometry: BufferGeometry, material: MeshStandardMaterial) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}

export function boatBlock(root: Group, name: string, position: Point3, size: Point3, radius: number, material: MeshStandardMaterial) {
  const mesh = boatPart(root, name, new RoundedBoxGeometry(...size, 2, radius), material);
  mesh.position.set(...position);
  return mesh;
}

export function boatCurve(
  root: Group, name: string, points: readonly Point3[], radius: number, material: MeshStandardMaterial, rows = 16,
) {
  return boatPart(root, name, boatForm(points.map(([x, y, z]) => [x, y, z, radius, radius]), rows, 8, [1, 0, 0]), material);
}

/** Batch rigid pieces while keeping each animated joint and the lantern independently addressable. */
export function batchBoatParts(root: Group) {
  const groups = new Map<MeshStandardMaterial, Mesh[]>();
  for (const child of root.children) {
    if (!(child instanceof Mesh) || child instanceof InstancedMesh || child instanceof SkinnedMesh
      || !(child.material instanceof MeshStandardMaterial) || child.morphTargetInfluences || !child.castShadow) continue;
    const part = groups.get(child.material);
    if (part) part.push(child);
    else groups.set(child.material, [child]);
  }
  for (const [material, parts] of groups) {
    if (parts.length < 2) continue;
    const local = parts.map(part => {
      part.updateMatrix();
      const geometry = part.geometry.clone().applyMatrix4(part.matrix);
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, index) => index));
      return geometry;
    });
    const merged = mergeGeometries(local);
    local.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    for (const part of parts) {
      part.removeFromParent();
      part.geometry.dispose();
    }
    boatPart(root, parts[0].name, merged, material);
  }
}

export function boatTimber(color: string, painted = false, vertexColors = false) {
  const material = new MeshStandardMaterial({ color, roughness: painted ? .79 : .67, vertexColors });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 boardUV;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>', '#include <uv_vertex>\nboardUV = uv;',
    );
    shader.fragmentShader = 'varying vec2 boardUV;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float along = boardUV.x;
      float across = boardUV.y + .013 * sin(along * 6.9 + boardUV.y * 18.);
      float growth = sin(across * 118. + sin(across * 29. + along * 2.2));
      float pores = sin(across * 831. + sin(across * 135. - along * 9.) + sin(along * 30.));
      float grain = .57 * growth + .25 * pores + .18 * sin(across * 451. + along * 16.);
      diffuseColor.rgb *= 1. + grain * ${painted ? '.054' : '.095'};
      diffuseColor.rgb *= 1. + .033 * sin(along * 4.9 + across * 17.);
    `);
  };
  material.customProgramCacheKey = () => painted ? 'pond-boat-painted-grain' : 'pond-boat-ash-grain';
  return material;
}
