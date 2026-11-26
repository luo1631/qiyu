import { Color, Float32BufferAttribute, Group, InstancedMesh, MathUtils, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector2, Vector3 } from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { islandSurface } from './materials';
import {
  bedHeight, bridgeLandings, dockSite, fishingHeading, fishingSeat, groundHeight, inLake, islandPoint, islandRim, lineDistance,
  onIsland, seeded, shore, trailCoverage,
} from './terrain';

type Stone = { x: number; y: number; z: number; size: number; turn: number; height: number; yaw: number };
type Face = { normal: Vector3; points: Vector3[] };

function stoneForm(variant: number, cliff: boolean) {
  const random = seeded(186 + variant * 111);
  const corners: Vector3[] = [];
  const sides = [5, 6, 5][variant];
  const cap = [.80, .63, .91][variant];
  for (let i = 0; i < sides; i++) {
    const angle = i / sides * 2 * Math.PI + (random() - .5) * .35;
    const size = .78 + random() * .20;
    const x = Math.cos(angle) * size;
    const z = Math.sin(angle) * size * (.68 + variant * .11);
    const lift = .14 * Math.sin(angle * 2 + variant * 1.32) + .067 * Math.cos(angle - variant);
    const crown = .62 + random() * .20;
    corners.push(new Vector3(x * .88, -.028 + lift * .10, z * .94),
      new Vector3(x, .25 + lift, z),
      new Vector3(x * crown + .13 * (variant - 1), cap + lift, z * crown + .085));
  }

  const uncut = new ConvexGeometry(corners);
  const faces: Face[] = [];
  const vertices = uncut.getAttribute('position'), normals = uncut.getAttribute('normal');
  for (let i = 0; i < vertices.count; i += 3) {
    const normal = new Vector3().fromBufferAttribute(normals, i);
    const first = new Vector3().fromBufferAttribute(vertices, i);
    let face = faces.find(side => side.normal.dot(normal) > .99999 && Math.abs(side.points[0].clone().sub(first).dot(normal)) < .001);
    if (!face) {
      face = { normal, points: [] };
      faces.push(face);
    }
    for (let j = i; j < i + 3; j++) {
      const point = new Vector3().fromBufferAttribute(vertices, j);
      if (!face.points.some(other => other.distanceToSquared(point) < .000001)) face.points.push(point);
    }
  }
  uncut.dispose();
  // Contract each flat cut toward its own center, then close the resulting bevels.
  const eased = faces.flatMap(({ points }) => {
    const center = points.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(points.length);
    return points.map(point => point.clone().lerp(center, .21));
  });
  const shape = new ConvexGeometry(eased);
  const position = shape.getAttribute('position'), normal = shape.getAttribute('normal');
  const cream = new Color(cliff ? '#817e9f' : '#eadcc0');
  const shade = new Color(cliff ? '#585578' : '#827d9c');
  const moss = new Color(cliff ? '#556d72' : '#83a052');
  const color = new Color();
  const pigment: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const lift = MathUtils.clamp(.24 + Math.max(-.28, normal.getY(i)) * .36 + y * .28
      + normal.getZ(i) * .16 + normal.getX(i) * -.12, 0, 1);
    const patches = Math.sin(x * 7 + z * 6 + variant * 1.8) * Math.cos(y * 4 - z * 4.8 + variant);
    const foliage = MathUtils.smoothstep(patches, .23, .89) * MathUtils.smoothstep(y, .18, .64) * .83;
    color.copy(shade).lerp(cream, lift).lerp(moss, foliage);
    color.multiplyScalar(.78 + .22 * MathUtils.smoothstep(y, -.02, .29));
    pigment.push(color.r, color.g, color.b);
  }
  shape.setAttribute('color', new Float32BufferAttribute(pigment, 3));
  return shape;
}

function stoneTransform(object: Object3D, stone: Stone) {
  object.position.set(stone.x, stone.y - stone.size * .19, stone.z);
  object.rotation.set(stone.turn, stone.yaw, -stone.turn * .60);
  object.scale.set(stone.size, stone.size * stone.height, stone.size);
  object.updateMatrix();
}

export function makeRocks() {
  const root = new Group();
  root.name = '池岸与岩壁的岩石';
  const random = seeded(206104);
  const shoreForms = [0, 1, 2].map(variant => stoneForm(variant, false));
  const cliffForms = [0, 1, 2].map(variant => stoneForm(variant, true));
  const material = islandSurface(new MeshStandardMaterial({ vertexColors: true, roughness: .92 }), 'stone');
  const shoreStones: Stone[] = [], cliffStones: Stone[] = [];

  function stoneAt(x: number, y: number, z: number, size: number): Stone {
    return { x, y, z, size, height: .88 + random() * .42, turn: (random() - .5) * .44, yaw: random() * Math.PI * 2 };
  }
  function shoreStone(x: number, z: number, size: number) {
    if (!onIsland(x, z)) return;
    const height = inLake(x, z) ? bedHeight(x, z) : groundHeight(x, z);
    shoreStones.push(stoneAt(x, height, z, size));
  }

  for (let index = 5; index < shore.length - 4; index += 5) {
    const edge = shore[index];
    if (index % 15 === 0 || edge.distanceTo(dockSite) < .82 ||
        lineDistance(edge.x, edge.y, bridgeLandings) < .65 || trailCoverage(edge.x, edge.y) > .45) continue;
    const tangent = shore[index + 1].clone().sub(shore[index - 1]).normalize();
    const normal = new Vector2(-tangent.y, tangent.x);
    if (inLake(edge.x + normal.x * .11, edge.y + normal.y * .11)) normal.negate();
    const dryEdge = edge.clone().addScaledVector(normal, .10 + random() * .12);
    const size = .35 + random() ** 1.12 * .47;
    shoreStone(dryEdge.x, dryEdge.y, size);
    const chip = dryEdge.clone().addScaledVector(tangent, size * (random() > .32 ? 1 : -1) * .91)
      .addScaledVector(normal, .05 + random() * .25);
    shoreStone(chip.x, chip.y, size * (.38 + random() * .22));
  }

  for (const [u, v, size] of [
    [-4.61, 2.64, .52], [-2.95, 3.56, .43], [-4.08, -2.51, .65], [-1.30, -3.52, .43],
    [5.54, -1.80, .52], [5.34, 1.67, .49], [3.50, 3.41, .35], [3.79, -3.38, .58], [-1.88, 2.89, .41],
  ]) {
    const { x, y: z } = islandPoint(u, v);
    shoreStone(x, z, size);
    shoreStone(x + size * .86, z - size * .62, size * .47);
  }

  for (let index = 4; index < islandRim.length; index += 2) {
    const point = islandRim[index];
    const inset = .916 + random() * .023;
    cliffStones.push(stoneAt(point.x * inset, -.76 - random() * .62, point.y * inset, .67 + random() * .61));
    if (index % 6 === 0) {
      cliffStones.push(stoneAt(point.x * .77, -1.85 - random() * .34, point.y * .79, .72 + random() * .62));
    }
  }

  function addBatches(stones: Stone[], forms: typeof shoreForms, cliff: boolean) {
    const transform = new Object3D();
    for (const [variant, geometry] of forms.entries()) {
      for (const castsShadow of cliff ? [false] : [false, true]) {
        const sites = stones.filter((stone, index) => index % forms.length === variant &&
          (!cliff && stone.size >= .47) === castsShadow);
        if (!sites.length) continue;
        const mesh = new InstancedMesh(geometry, material, sites.length);
        sites.forEach((stone, index) => {
          stoneTransform(transform, stone);
          mesh.setMatrixAt(index, transform.matrix);
        });
        mesh.name = cliff ? '冷色崖石' : '奶白与灰紫岸石';
        mesh.castShadow = castsShadow;
        mesh.receiveShadow = true;
        root.add(mesh);
      }
    }
  }

  addBatches(shoreStones, shoreForms, false);
  addBatches(cliffStones, cliffForms, true);
  const seat = new Mesh(shoreForms[1], material);
  const { x: seatX, y: seatZ } = fishingSeat;
  seat.name = '瀑口的平顶坐石';
  seat.position.set(seatX, groundHeight(seatX, seatZ) - .055, seatZ);
  seat.scale.set(.61, .67, .54);
  seat.rotation.y = fishingHeading + .36;
  seat.castShadow = seat.receiveShadow = true;
  root.add(seat);
  seat.updateWorldMatrix(true, false);
  const seatProbe = new Raycaster(new Vector3(seatX, seat.position.y + 1, seatZ), new Vector3(0, -1, 0));
  const seatY = seatProbe.intersectObject(seat, false)[0]?.point.y ?? seat.position.y + .38;
  let count = 0;
  return {
    root, seatY,
    place(x: number, y: number, z: number) {
      const mesh = new Mesh(shoreForms[count++ % shoreForms.length], material);
      stoneTransform(mesh, stoneAt(x, y, z, .47 + random() * .21));
      mesh.name = '新放置的岸石';
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    },
  };
}
