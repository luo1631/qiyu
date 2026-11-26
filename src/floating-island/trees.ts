import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MathUtils, Mesh, MeshStandardMaterial, Vector3,
} from 'three';
import { FloraGeometry } from '../scene/flora-geometry';
import type { StemSection } from '../scene/flora-geometry';
import { groundHeight, islandPoint, seeded } from './terrain';

const pineSite = islandPoint(-2.69, -2.64);
const barkMaterial = () => new MeshStandardMaterial({ vertexColors: true, roughness: .97 });
const leafMaterial = () => new MeshStandardMaterial({ vertexColors: true, roughness: .96, side: DoubleSide });
type Needles = { positions: number[]; colors: number[]; indices: number[] };

function needleSpray(mesh: Needles, base: Vector3, yaw: number, length: number, width: number,
  droop: number, color: Color, phase: number) {
  const alongX = Math.cos(yaw), alongZ = Math.sin(yaw);
  const offset = mesh.positions.length / 3;
  const rows = 18;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const taper = Math.sin(Math.PI * t ** .71) ** .76;
    const tooth = row % 2 ? 1.13 : .73;
    const spine = .10 * Math.sin(t * Math.PI) - t ** 1.56 * droop;
    const arc = width * .21 * Math.sin(t * Math.PI * 1.35 + phase) * Math.sin(t * Math.PI);
    for (const side of [-1, 0, 1]) {
      const irregularity = 1 + .13 * Math.sin(row * 2.35 + phase + side * 2.1);
      const span = arc + side * Math.max(.002, taper * width * tooth * irregularity);
      const run = t * length + (row % 2 && side ? length * .027 : 0);
      mesh.positions.push(
        base.x + alongX * run - alongZ * span,
        base.y + spine + (side === 0 ? taper * width * .31 : -taper * width * (.15 + side * .07)),
        base.z + alongZ * run + alongX * span,
      );
      const shade = .78 + t * .18 + (side === 0 ? .15 : .035) + .065 * Math.sin(row * 1.9 + phase);
      mesh.colors.push(color.r * shade, color.g * shade, color.b * shade);
    }
    if (row === rows) continue;
    const a = offset + row * 3;
    mesh.indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
  }
}

function makePine(woodMaterial: MeshStandardMaterial, needlesMaterial: MeshStandardMaterial) {
  const random = seeded(2517);
  const bark = new Color('#79543d');
  const green = new Color('#3a624c');
  const light = new Color('#9aaf68');
  const wood = new FloraGeometry();
  const leaves: Needles = { positions: [], colors: [], indices: [] };
  const trunk: StemSection[] = [
    [0, -.12, 0, .31], [-.047, .45, .016, .23], [-.10, 1.18, -.028, .168],
    [-.06, 1.86, .026, .131], [.01, 2.53, .017, .102], [.042, 3.15, -.05, .074],
    [.023, 3.78, -.093, .055], [-.029, 4.35, -.089, .037], [-.10, 4.82, -.12, .021],
    [-.16, 5.27, -.14, .004],
  ];
  wood.stem(trunk, bark, 9);
  for (const angle of [.17, 1.94, 3.12, 4.86]) {
    const x = Math.cos(angle), z = Math.sin(angle);
    wood.stem([[x * .79, -.071, z * .79, .027], [x * .35, .055, z * .35, .096], [0, .36, 0, .13]], bark, 6);
  }
  const tiers = [[2, 2.37, 7], [3, 2.12, 6], [4, 1.84, 6], [5, 1.45, 6], [6, 1.18, 5],
    [7, .82, 5], [8, .61, 4], [9, .31, 4]];
  for (const [tier, [joint, radius, arms]] of tiers.entries()) {
    const [cx, cy, cz, trunkRadius] = trunk[joint];
    for (let arm = 0; arm < arms; arm++) {
      const phase = random() * Math.PI * 2;
      const yaw = tier * 1.53 + arm * Math.PI * 2 / arms + (random() - .5) * .41;
      const length = radius * (.71 + random() * .45);
      const droop = .18 + length * (.12 + random() * .11);
      const dx = Math.cos(yaw), dz = Math.sin(yaw);
      const base = new Vector3(cx, cy + (random() - .5) * .18 - (joint === 9 ? .16 : 0), cz);
      const midpoint = base.clone().add(new Vector3(dx * length * .41, .064, dz * length * .41));
      const tip = base.clone().add(new Vector3(dx * length, -droop, dz * length));
      wood.stem([[...base.toArray(), trunkRadius * .50], [...midpoint.toArray(), trunkRadius * .28],
        [...tip.toArray(), .007]], bark, 5, 6);

      const color = green.clone().lerp(light, .14 + random() * .56 + tier * .022);
      const start = base.clone().lerp(midpoint, .35);
      start.y += .04;
      needleSpray(leaves, start, yaw, length * .97, length * (.128 + random() * .034), droop * .91, color, phase);
      for (const [step, side] of [[.23, -1], [.30, 1], [.44, -1], [.53, 1], [.66, -1], [.73, 1]]) {
        const fork = base.clone().add(new Vector3(dx * step * length, .063 - droop * step ** 1.7, dz * step * length));
        const reach = length * (.66 - step * .46) * (.73 + random() * .28);
        const spread = yaw + side * (.57 + random() * .40);
        const shade = color.clone().lerp(tier % 3 ? green : light, random() * .34);
        needleSpray(leaves, fork, spread, reach, length * (.065 + random() * .037), droop * .62, shade, phase + step * 8);
      }
    }
  }
  const foliage = new BufferGeometry();
  foliage.setAttribute('position', new Float32BufferAttribute(leaves.positions, 3));
  foliage.setAttribute('color', new Float32BufferAttribute(leaves.colors, 3));
  foliage.setIndex(leaves.indices);
  foliage.computeVertexNormals();
  const tree = new Group();
  tree.name = '后岸主树';
  tree.add(new Mesh(wood.build('主树树干与垂枝'), woodMaterial), new Mesh(foliage, needlesMaterial));
  for (const mesh of tree.children) mesh.castShadow = mesh.receiveShadow = true;
  tree.position.set(pineSite.x, groundHeight(pineSite.x, pineSite.y) - .015, pineSite.y);
  tree.rotation.y = .43;
  return tree;
}

function twigCanopy(foliage: FloraGeometry, center: Vector3, size: number, heading: number, random: () => number, peach: boolean) {
  const shade = new Color(peach ? '#aa667b' : '#315a49');
  const sun = new Color(peach ? '#f2c2bb' : '#8eaa66');
  const tint = new Color();
  const quantity = peach ? 34 : 38;
  for (let i = 0; i < quantity; i++) {
    const angle = heading + i * 2.399 + random() * .49;
    const distance = Math.sqrt(random()) * size * (.85 + .15 * Math.cos(angle * 3 + heading));
    const crown = 1 - (distance / size) ** 2;
    const height = (random() - .26) * Math.sqrt(crown) * size * .78;
    const point: [number, number, number] = [center.x + Math.cos(angle) * distance, center.y + height,
      center.z + Math.sin(angle) * distance * .82];
    tint.copy(shade).lerp(sun, .18 + random() * .53 + (height > 0 ? .17 : 0));
    if (peach && i % 6 !== 0) {
      const length = .045 + random() * .046;
      const lift = random() * .27;
      const tilt = .06 + random() * .54;
      for (let petal = 0; petal < 5; petal++) {
        const turn = angle + petal * Math.PI * .4;
        foliage.leaf({ at: point, along: [Math.cos(turn), lift + Math.cos(turn + heading) * tilt, Math.sin(turn)],
          bend: [0, .021, 0], length, width: length * .41, color: tint, rows: 3, solid: false });
      }
    } else {
      if (peach) tint.set('#849b67').multiplyScalar(.87 + random() * .17);
      foliage.leaf({ at: point, along: [Math.cos(angle), .26 + (random() - .5) * .91, Math.sin(angle)],
        bend: [0, -.042, 0], length: (peach ? .09 : .15) + random() * .13,
        width: (peach ? .025 : .050) + random() * .027, color: tint, rows: 3, solid: false });
    }
  }
}

function makeRoundTree(woodMaterial: MeshStandardMaterial, leavesMaterial: MeshStandardMaterial, peach: boolean, seed: number) {
  const random = seeded(seed);
  const bark = new Color(peach ? '#795340' : '#755641');
  const wood = new FloraGeometry();
  const foliage = new FloraGeometry();
  const trunk: StemSection[] = [
    [0, -.085, 0, .164], [-.11, .43, .035, .115], [-.08, .83, .032, .091], [.048, 1.18, .063, .071],
    [.04, 1.57, -.08, .048], [.14, 2.03, -.145, .029], [.29, 2.55, -.19, .009],
  ];
  wood.stem(trunk, bark, 7);
  for (let arm = 0; arm < 7; arm++) {
    const yaw = arm * 2.40 + .36 + (random() - .5) * .59;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const joint = 2 + arm % 4;
    const [x, y, z, radius] = trunk[joint];
    const span = (.64 + random() * .49) * (1.16 - .12 * (joint - 2)) * (peach ? 1.26 : 1);
    const elbow = new Vector3(x + dx * span * .43, y + .15, z + dz * span * .43);
    const tip = new Vector3(x + dx * span, y + .39 + random() * .42, z + dz * span);
    wood.stem([[x, y, z, radius * .59], [...elbow.toArray(), radius * .37], [...tip.toArray(), .014]], bark, 5, 7);
    for (const [along, side] of [[.20, -.88], [.60, .86], [.91, -.25]]) {
      const turn = yaw + side * (.79 + random() * .41);
      const twigRoot = elbow.clone().lerp(tip, along);
      const reach = .23 + random() * .23;
      const crown = twigRoot.clone().add(new Vector3(Math.cos(turn) * reach, .15 + random() * .26, Math.sin(turn) * reach));
      const mid = twigRoot.clone().lerp(crown, .64);
      mid.y -= .026;
      wood.stem([[...twigRoot.toArray(), .022], [...mid.toArray(), .012], [...crown.toArray(), .003]], bark, 4, 5);
      twigCanopy(foliage, crown, .20 + random() * .19 + (peach ? .075 : .021), turn, random, peach);
    }
  }
  twigCanopy(foliage, new Vector3(.29, 2.54, -.19), peach ? .44 : .35, 2.34, random, peach);
  const tree = new Group();
  tree.add(new Mesh(wood.build('棕色树干和细枝'), woodMaterial), new Mesh(foliage.build(peach ? '桃花枝簇' : '小乔木叶簇'), leavesMaterial));
  for (const mesh of tree.children) mesh.receiveShadow = true;
  return tree;
}

export function makeIslandTrees() {
  const root = new Group();
  root.name = '针叶主树与圆冠小树';
  const wood = barkMaterial(), leaves = leafMaterial();
  const pine = makePine(wood, leaves);
  const round = makeRoundTree(wood, leaves, false, 54007);
  const leaning = makeRoundTree(wood, leaves, false, 11393);
  const peach = makeRoundTree(wood, leaves, true, 80213);
  root.add(pine);

  function plant(template: Group, x: number, y: number, z: number, size: number, turn: number, name: string) {
    const tree = template.clone();
    tree.position.set(x, y - .015, z);
    tree.rotation.y = turn;
    tree.scale.setScalar(size);
    tree.name = name;
    root.add(tree);
  }

  const saplingSites = [
    [-4.66, -2.37, .62, -.37], [-.93, -3.34, .66, .94], [1.44, -3.35, .70, 2.42],
    [2.86, -3.18, .58, 1.69], [-5.20, -1.49, .44, 1.79], [-4.02, 3.05, .46, -.80], [5.53, .19, .50, .48],
  ];
  for (const [index, [u, v, size, turn]] of saplingSites.entries()) {
    const { x, y: z } = islandPoint(u, v);
    plant(index % 2 ? round : leaning, x, groundHeight(x, z), z, size, turn, '岸边小树');
  }
  const peachSite = islandPoint(4.83, -2.25);
  plant(peach, peachSite.x, groundHeight(peachSite.x, peachSite.y), peachSite.y, .84, .26, '屋后桃树');

  const random = seeded(767);
  return {
    root,
    place(x: number, y: number, z: number) {
      plant(random() < .5 ? round : leaning, x, y, z, MathUtils.lerp(.49, .65, random()), random() * Math.PI * 2, '新种植的小树');
    },
  };
}
