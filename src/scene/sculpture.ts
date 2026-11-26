import {
  BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Float32BufferAttribute, Group,
  InstancedMesh, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type XYZ = [number, number, number];

/** Bake the separate parts into a single coloured mesh. */
export class Sculpture {
  private parts: BufferGeometry[] = [];

  add(geometry: BufferGeometry, color: string, at: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1], rotation: XYZ = [0, 0, 0]) {
    const object = new Object3D();
    object.position.set(...at);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    object.updateMatrix();
    const shape = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    shape.applyMatrix4(object.matrix);
    shape.deleteAttribute('uv');
    if (!shape.attributes.color) {
      const pigment = new Color(color);
      const colors = new Float32Array(shape.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) pigment.toArray(colors, i);
      shape.setAttribute('color', new Float32BufferAttribute(colors, 3));
    }
    this.parts.push(shape);
    return this;
  }

  oval(at: XYZ, scale: XYZ, color: string, rotation: XYZ = [0, 0, 0], segments = 10, rings = 6) {
    return this.add(new SphereGeometry(1, segments, rings), color, at, scale, rotation);
  }

  line(points: XYZ[], radius: number, color: string, segments = 8) {
    return this.add(new TubeGeometry(new CatmullRomCurve3(points.map(point => new Vector3(...point))), segments, radius, 4, false), color);
  }

  mesh(name: string, material = new MeshStandardMaterial({ vertexColors: true, roughness: .68, side: DoubleSide })) {
    const geometry = mergeGeometries(this.parts);
    this.parts.forEach(part => part.dispose());
    if (!geometry) throw new Error('Empty sculpture: ' + name);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
}

export function disposeSculpture(group: Group) {
  const materials = new Set<MeshStandardMaterial>();
  const geometries = new Set<BufferGeometry>();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    if (object instanceof InstancedMesh) object.dispose();
    if (object instanceof SkinnedMesh) object.skeleton.dispose();
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
