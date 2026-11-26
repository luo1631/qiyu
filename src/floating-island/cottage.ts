import {
  BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide,
  Group, InstancedMesh, Mesh, MeshStandardMaterial, PointLight, TubeGeometry, Vector3,
} from 'three';
import type { Object3D } from 'three';
import {
  bridgeLandings, dockSite, gardenSeat, groundHeight, houseSite, islandPoint, lakeLevel, meadowPath, seeded, Surface,
} from './terrain';

function block(parent: Object3D, shape: BoxGeometry, material: MeshStandardMaterial,
  x: number, y: number, z: number, width: number, height: number, depth: number) {
  const mesh = new Mesh(shape, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function beam(parent: Object3D, shape: BoxGeometry, material: MeshStandardMaterial,
  from: Vector3, to: Vector3, width: number, depth = width) {
  const center = from.clone().lerp(to, .5);
  const mesh = block(parent, shape, material, center.x, center.y, center.z, width, from.distanceTo(to), depth);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
}

function batchBoards(root: Group, shape: BoxGeometry) {
  root.updateMatrixWorld(true);
  const toLocal = root.matrixWorld.clone().invert();
  const groups = new Map<MeshStandardMaterial, Mesh[]>();
  root.traverse(object => {
    if (object instanceof Mesh && object.geometry === shape && object.material instanceof MeshStandardMaterial) {
      const members = groups.get(object.material) ?? [];
      members.push(object);
      groups.set(object.material, members);
    }
  });
  for (const [material, boards] of groups) {
    if (boards.length < 2) continue;
    const mesh = new InstancedMesh(shape, material, boards.length);
    boards.forEach((board, index) => {
      mesh.setMatrixAt(index, board.matrixWorld.clone().premultiply(toLocal));
      board.removeFromParent();
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

const roofHalfWidth = 1.56;
const roofHalfLength = 1.43;
function roofHeight(u: number, z: number) {
  return 2.62 - 1.17 * Math.pow(u, .83) + .18 * u ** 8 + .11 * (z / roofHalfLength) ** 4;
}

function makeRoof() {
  const group = new Group();
  group.name = '青瓦屋面';
  const ceramic = new MeshStandardMaterial({ vertexColors: true, roughness: .7, side: DoubleSide, metalness: .025 });
  const palette = ['#53657c', '#596a80', '#607084', '#475a71', '#687489', '#516378', '#536681'].map(color => new Color(color));
  const tiles = new Surface();
  const base = new Surface();
  const random = seeded(61);
  const columns = 16;
  const rows = 9;
  for (const sign of [-1, 1]) {
    for (let row = 0; row < 14; row++) {
      const a = row / 14;
      const b = (row + 1) / 14;
      const edge = new Color('#3d4d59');
      for (let column = 0; column < 8; column++) {
        const z = (column / 8 * 2 - 1) * roofHalfLength;
        const next = ((column + 1) / 8 * 2 - 1) * roofHalfLength;
        base.quad([a * sign * roofHalfWidth, roofHeight(a, z) - .042, z],
          [a * sign * roofHalfWidth, roofHeight(a, next) - .042, next],
          [b * sign * roofHalfWidth, roofHeight(b, next) - .042, next],
          [b * sign * roofHalfWidth, roofHeight(b, z) - .042, z], edge);
      }
    }
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const from = .021 + row * .979 / rows;
        const to = .021 + (row + 1) * .979 / rows - .0022;
        const span = roofHalfLength * 2 / columns;
        const zStart = -roofHalfLength + column * span;
        const color = palette[Math.floor(random() * palette.length)].clone().multiplyScalar(.92 + random() * .17);
        for (let rib = 0; rib < 5; rib++) {
          const sill = (u: number, v: number) => {
            const z = zStart + span * v;
            const ribHeight = .028 * Math.sin(Math.PI * v) ** 1.35;
            return [sign * u * roofHalfWidth, roofHeight(u, z) + ribHeight + .010, z] as const;
          };
          const a = .017 + rib * .966 / 5;
          const b = .017 + (rib + 1) * .966 / 5;
          tiles.quad(sill(from, a), sill(to, a), sill(to, b), sill(from, b), color);
        }
      }
    }
  }
  group.add(base.mesh('连续屋面', ceramic), tiles.mesh('青瓦与瓦垄', ceramic));
  const edging = new MeshStandardMaterial({ color: '#3e4e63', roughness: .77 });
  function edge(points: Vector3[], radius: number) {
    const curve = new CatmullRomCurve3(points);
    const cap = new Mesh(new TubeGeometry(curve, 18, radius, 7, false), edging);
    cap.castShadow = true;
    cap.receiveShadow = true;
    group.add(cap);
  }
  const ridge = Array.from({ length: 9 }, (_, index) => {
    const z = (index / 8 * 2 - 1) * (roofHalfLength + .034);
    return new Vector3(0, roofHeight(0, z) + .052, z);
  });
  edge(ridge, .076);
  for (const z of [-roofHalfLength, roofHalfLength]) {
    const profile = Array.from({ length: 15 }, (_, index) => {
      const x = (index / 14 * 2 - 1) * roofHalfWidth;
      return new Vector3(x, roofHeight(Math.abs(x) / roofHalfWidth, z) + .011, z);
    });
    edge(profile, .035);
  }
  for (const x of [-roofHalfWidth, roofHalfWidth]) {
    edge(Array.from({ length: 7 }, (_, index) => {
      const z = (index / 6 * 2 - 1) * roofHalfLength;
      return new Vector3(x, roofHeight(1, z) + .006, z);
    }), .04);
  }
  return group;
}

export function makeCottage() {
  const home = new Group();
  home.name = '临湖小屋';
  home.position.set(houseSite.x, groundHeight(houseSite.x, houseSite.y), houseSite.y);
  home.rotation.y = -.24;
  home.scale.setScalar(1.085);
  const shape = new BoxGeometry();
  const wood = new MeshStandardMaterial({ color: '#875238', roughness: .87 });
  const darkWood = new MeshStandardMaterial({ color: '#654432', roughness: .90 });
  const porchWood = new MeshStandardMaterial({ color: '#a97249', roughness: .88 });
  const colors = ['#a3724a', '#ae7d51', '#986642', '#b48457', '#9d6b44'].map(color =>
    new MeshStandardMaterial({ color, roughness: .88 }));
  const plaster = new MeshStandardMaterial({ color: '#e3c8a0', roughness: .93 });
  const stone = new MeshStandardMaterial({ color: '#afa69a', roughness: .95 });
  const tread = new MeshStandardMaterial({ color: '#c3b7a0', roughness: .94 });
  const glass = new MeshStandardMaterial({ color: '#efb674', emissive: '#fc9b40', emissiveIntensity: .25, roughness: .35 });

  block(home, shape, stone, 0, .075, 0, 2.62, .26, 2.24);
  block(home, shape, tread, 0, .212, 0, 2.68, .075, 2.29);
  block(home, shape, plaster, 0, .925, 0, 2.49, 1.42, 2.08);
  block(home, shape, wood, 0, .29, 0, 2.57, .12, 2.13);
  for (const x of [-1.23, 1.23]) {
    for (const z of [-1.044, 1.044]) block(home, shape, wood, x, .943, z, .123, 1.45, .129);
    for (const y of [.58, 1.59]) block(home, shape, wood, x, y, 0, .13, .083, 2.14);
  }
  for (const z of [-1.058, 1.058]) {
    for (const y of [.58, 1.59]) block(home, shape, wood, 0, y, z, 2.52, .088, .103);
    block(home, shape, wood, -.13, 1.10, z, .072, 1.04, .057);
    block(home, shape, wood, .98, 1.11, z, .058, 1.02, .055);
  }
  for (let i = 0; i < 27; i++) {
    const x = (i / 26 * 2 - 1) * 1.186;
    for (const z of [-1.066, 1.066]) block(home, shape, colors[i % colors.length], x, .422, z, .087, .274, .051);
  }
  for (let i = 0; i < 22; i++) {
    const z = (i / 21 * 2 - 1) * .995;
    for (const x of [-1.257, 1.257]) block(home, shape, colors[(i * 3) % colors.length], x, .422, z, .05, .274, .089);
  }

  const gable = new Surface();
  for (const z of [-1.051, 1.051]) {
    for (let i = 0; i < 12; i++) {
      const x = (i / 12 * 2 - 1) * 1.246;
      const next = ((i + 1) / 12 * 2 - 1) * 1.246;
      gable.quad([x, 1.59, z], [next, 1.59, z], [next, roofHeight(Math.abs(next) / roofHalfWidth, z) - .047, z],
        [x, roofHeight(Math.abs(x) / roofHalfWidth, z) - .047, z], new Color('#dbc4a0'));
    }
    const front = z * 1.016;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * 1.25;
        const b = (i + 1) / 4 * 1.25;
        beam(home, shape, wood,
          new Vector3(sign * a, roofHeight(a / roofHalfWidth, z) - .075, front),
          new Vector3(sign * b, roofHeight(b / roofHalfWidth, z) - .075, front), .095, .073);
      }
      beam(home, shape, porchWood, new Vector3(0, 2.22, front), new Vector3(sign * .69, 1.62, front), .065, .063);
    }
    block(home, shape, wood, 0, 2.049, front, .09, .88, .072);
  }
  home.add(gable.mesh('山墙', new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: .96 })));

  function windowAt(x: number, z: number, yaw = 0) {
    const frame = new Group();
    frame.position.set(x, 1.11, z);
    frame.rotation.y = yaw;
    home.add(frame);
    block(frame, shape, darkWood, 0, 0, 0, .662, .529, .071);
    block(frame, shape, glass, 0, 0, .047, .531, .397, .034);
    for (const offset of [-.29, .29]) block(frame, shape, porchWood, offset, 0, .073, .046, .476, .052);
    for (const offset of [-.208, .208]) block(frame, shape, porchWood, 0, offset, .073, .584, .039, .052);
    for (const offset of [-.1, .1]) block(frame, shape, wood, offset, 0, .074, .025, .398, .028);
    block(frame, shape, wood, 0, 0, .078, .542, .028, .028);
    block(frame, shape, wood, 0, -.249, .077, .69, .053, .153);
  }
  windowAt(.52, 1.063);
  windowAt(1.265, -.18, Math.PI / 2);
  windowAt(-1.265, -.27, -Math.PI / 2);
  windowAt(.51, -1.063, Math.PI);
  block(home, shape, darkWood, -.54, .867, 1.075, .606, 1.252, .062);
  for (let i = 0; i < 6; i++) block(home, shape, colors[i % colors.length], -.78 + i * .096, .866, 1.116, .09, 1.208, .032);
  for (const y of [.49, 1.315]) block(home, shape, wood, -.54, y, 1.136, .559, .065, .052);
  const bronze = new MeshStandardMaterial({ color: '#c89751', metalness: .29, roughness: .59 });
  block(home, shape, bronze, -.353, .844, 1.144, .035, .081, .035);

  for (let step = 0; step < 3; step++) {
    block(home, shape, tread, -.54, .177 - step * .075, 1.19 + step * .155, .85 + step * .065, .111, .34);
  }
  home.add(makeRoof());
  for (const x of [-1.14, 1.14]) {
    for (const z of [-.9, -.4, .1, .6, 1.03]) {
      block(home, shape, wood, x, 1.599, z, .194, .138, .08);
    }
  }

  const lantern = new Group();
  lantern.position.set(.982, 1.435, 1.286);
  home.add(lantern);
  block(lantern, shape, darkWood, 0, .145, 0, .024, .27, .026);
  block(lantern, shape, bronze, 0, .025, 0, .14, .035, .141);
  block(lantern, shape, bronze, 0, -.18, 0, .132, .031, .131);
  block(lantern, shape, glass, 0, -.076, 0, .113, .173, .113);
  for (const x of [-.058, .058]) for (const z of [-.058, .058]) {
    block(lantern, shape, darkWood, x, -.08, z, .014, .174, .014);
  }
  const lamp = new PointLight('#ffb66d', .12, 3.6, 2);
  lamp.position.set(.86, 1.18, 1.58);
  home.add(lamp);

  batchBoards(home, shape);
  return { root: home, light: lamp, glass };
}

export function makeShoreStructures(lanternGlass: MeshStandardMaterial) {
  const root = new Group();
  root.name = '木桥、长椅与泊位';
  const shape = new BoxGeometry();
  const timber = ['#a47749', '#be8b53', '#986c44', '#ac794d', '#b08051'].map(color =>
    new MeshStandardMaterial({ color, roughness: .89 }));
  const dark = new MeshStandardMaterial({ color: '#816346', roughness: .91 });
  const dock = new Group();
  dock.name = '泊舟木台';
  dock.position.set(dockSite.x, groundHeight(dockSite.x, dockSite.y) - .06, dockSite.y);
  dock.rotation.y = -.41;
  root.add(dock);
  for (let i = 0; i < 10; i++) {
    block(dock, shape, timber[(i * 3) % timber.length], -i * .143 + .32, .076, 0, .139, .081, .79);
  }
  for (const z of [-.288, .288]) {
    block(dock, shape, dark, -.34, -.013, z, 1.45, .106, .101);
    for (const x of [-.865, .218]) block(dock, shape, dark, x, -.293, z, .101, .79, .105);
  }
  for (const z of [-.339, .339]) {
    block(dock, shape, timber[3], -.895, .212, z, .102, .285, .103);
    block(dock, shape, timber[1], -.895, .357, z, .12, .041, .12);
  }

  const bridge = new Group();
  bridge.name = '浅湾木拱桥';
  const [near, far] = bridgeLandings;
  const span = near.distanceTo(far);
  bridge.position.set(near.x, 0, near.y);
  bridge.rotation.y = Math.atan2(far.x - near.x, far.y - near.y);
  root.add(bridge);
  const nearHeight = groundHeight(near.x, near.y) + .015;
  const farHeight = groundHeight(far.x, far.y) + .028;
  const deckHeight = (t: number) => nearHeight * (1 - t) + farHeight * t + .41 * Math.sin(Math.PI * t);
  const deckCount = 14;
  for (let i = 0; i < deckCount; i++) {
    const t = (i + .5) / deckCount;
    const step = block(bridge, shape, timber[(i * 3) % timber.length], 0, deckHeight(t), t * span,
      1.08, .092, span / deckCount - .008);
    step.rotation.x = -Math.atan2(deckHeight((i + 1) / deckCount) - deckHeight(i / deckCount), span / deckCount);
  }
  const joints = [0, .25, .5, .75, 1];
  for (const side of [-1, 1]) {
    const x = side * .474;
    for (const [index, t] of joints.entries()) {
      const height = deckHeight(t);
      block(bridge, shape, dark, x, height + .18, t * span, .112, .57, .112);
      block(bridge, shape, timber[1], x, height + .474, t * span, .135, .047, .138);
      if (index === 0 || index === joints.length - 1) continue;
      const bottom = lakeLevel - .64;
      block(bridge, shape, dark, x, (bottom + height) / 2, t * span, .121, height - bottom, .122);
    }
    for (let i = 1; i < joints.length; i++) {
      const from = joints[i - 1];
      const to = joints[i];
      for (const [offset, width, depth, material] of [[-.074, .14, .16, dark], [.36, .088, .088, timber[0]]] as const) {
        beam(bridge, shape, material, new Vector3(x, deckHeight(from) + offset, from * span),
          new Vector3(x, deckHeight(to) + offset, to * span), width, depth);
      }
    }
  }

  const stoneMat = new MeshStandardMaterial({ color: '#9b9c83', roughness: .97 });
  const caps = new MeshStandardMaterial({ color: '#929883', roughness: .97 });
  const baseShape = new CylinderGeometry(1, 1, 1, 6);
  const capShape = new CylinderGeometry(.27, 1, 1, 6);
  const seat = new Group();
  seat.name = '花地边的长椅';
  seat.position.set(gardenSeat.x, groundHeight(gardenSeat.x, gardenSeat.y), gardenSeat.y);
  seat.rotation.y = -1.67;
  root.add(seat);
  for (const x of [-.53, .53]) {
    block(seat, shape, stoneMat, x, .103, -.03, .20, .28, .412);
    block(seat, shape, dark, x, .367, -.181, .081, .54, .082);
  }
  for (const z of [-.13, .012, .154]) block(seat, shape, timber[1], 0, .266, z, 1.42, .082, .134);
  for (const y of [.438, .58]) block(seat, shape, timber[0], 0, y, -.201, 1.42, .118, .074);

  for (const [point, size] of [[islandPoint(.68, -1.84), 1.07], [islandPoint(3.10, 2.64), .91]] as const) {
    const lantern = new Group();
    lantern.name = '石灯';
    lantern.position.set(point.x, groundHeight(point.x, point.y) - .016, point.y);
    lantern.rotation.y = .24;
    lantern.scale.setScalar(size);
    root.add(lantern);
    const courses = [
      [baseShape, stoneMat, .04, .236, .12], [baseShape, stoneMat, .205, .093, .28],
      [baseShape, stoneMat, .363, .201, .084], [baseShape, lanternGlass, .475, .093, .151],
      [capShape, caps, .623, .239, .146],
    ] as const;
    for (const [geometry, material, y, radius, height] of courses) {
      const course = new Mesh(geometry, material);
      course.position.y = y;
      course.scale.set(radius, height, radius);
      course.castShadow = course.receiveShadow = true;
      lantern.add(course);
    }
    for (const x of [-.104, .104]) for (const z of [-.074, .074]) {
      block(lantern, shape, stoneMat, x, .478, z, .038, .181, .038);
    }
  }

  const fence = [[2.28, 3.54], [2.97, 3.38], [3.65, 3.13], [4.26, 2.89]].map(([x, z]) => {
    const point = islandPoint(x, z);
    return new Vector3(point.x, groundHeight(point.x, point.y), point.y);
  });
  for (const [i, point] of fence.entries()) {
    block(root, shape, dark, point.x, point.y + .161, point.z, .108, .44, .115);
    if (i === 0) continue;
    for (const y of [.118, .294]) {
      const offset = new Vector3(0, y, 0);
      beam(root, shape, timber[2], fence[i - 1].clone().add(offset), point.clone().add(offset), .073, .08);
    }
  }

  const stones = new Surface();
  const random = seeded(879);
  const placements = [6, 11, 18, 23, 27].map(index => meadowPath[index]);
  for (const [i, point] of placements.entries()) {
    const color = new Color(['#bcad8e', '#cdb99a', '#a49b86'][i % 3]);
    const width = .069 + random() * .095;
    const depth = .051 + random() * .088;
    const turn = (random() - .5) * 2.7;
    const x = point.x + (random() - .5) * .42;
    const z = point.y + (random() - .5) * .40;
    const y = groundHeight(x, z) + .021;
    const border = Array.from({ length: 7 }, (_, index) => {
      const angle = index * Math.PI * 2 / 7 + turn;
      const variation = .85 + random() * .2;
      return [x + Math.cos(angle) * width * variation, y + random() * .012, z + Math.sin(angle) * depth * variation] as const;
    });
    for (let j = 0; j < border.length; j++) {
      const a = border[j];
      const b = border[(j + 1) % border.length];
      stones.triangle([x, y + .016, z], b, a, color);
      stones.quad(a, b, [b[0], b[1] - .082, b[2]], [a[0], a[1] - .082, a[2]], color.clone().multiplyScalar(.76));
    }
  }
  root.add(stones.mesh('露出草面的踏石', new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: .92 })));
  batchBoards(root, shape);
  return { root, tie: dock.localToWorld(new Vector3(-.895, .285, -.339)) };
}
