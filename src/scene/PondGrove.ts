import { CatmullRomCurve3, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { FloraGeometry } from './flora-geometry';
import type { FloraPoint, StemSection } from './flora-geometry';
import { disposeSculpture } from './PondCreatures';
import { seededRandom } from './pond-life';
import { outerBankHeight, shorePoint } from './shore-layout';
import { softenVegetation } from './vegetation-material';

const species = {
  spreading: { radius: 1.48, height: 3.86, lean: .16, branches: 8, trunk: .22, bark: '#765e46', shade: '#45654b', light: '#91a773' },
  leaning: { radius: 1.56, height: 3.47, lean: .98, branches: 8, trunk: .24, bark: '#725739', shade: '#3e5c4d', light: '#839a66' },
  upright: { radius: 1.06, height: 4.29, lean: .21, branches: 9, trunk: .19, bark: '#77705b', shade: '#466a55', light: '#86a47b' },
  willow: { radius: 1.44, height: 3.75, lean: -.31, branches: 7, trunk: .22, bark: '#74664b', shade: '#526b44', light: '#9ead6a' },
} as const;
type Kind = keyof typeof species;
type ShoreSite = { kind: Kind; angle: number; outward: number; scale: number; turn: number };

// Staggered depths keep both the near water and the far ridge visible between trees.
export const shoreGroveSites: readonly ShoreSite[] = [
  { kind: 'spreading', angle: 3.28, outward: 2.48, scale: .71, turn: -.70 },
  { kind: 'leaning', angle: 3.66, outward: 2.1, scale: .93, turn: .65 },
  { kind: 'upright', angle: 3.94, outward: 3.0, scale: .64, turn: 2.4 },
  { kind: 'leaning', angle: 3.83, outward: 6.2, scale: .61, turn: -1.34 },
  { kind: 'willow', angle: 5.15, outward: 2.29, scale: .78, turn: -.52 },
  { kind: 'spreading', angle: 5.53, outward: 1.9, scale: .81, turn: -.30 },
  { kind: 'upright', angle: 5.93, outward: 2.91, scale: .79, turn: 1.35 },
  { kind: 'upright', angle: 5.76, outward: 6.0, scale: .68, turn: -.44 },
  { kind: 'willow', angle: 2.55, outward: 3.35, scale: .61, turn: 2.00 },
  { kind: 'spreading', angle: 1.11, outward: 2.10, scale: .64, turn: -.82 },
  { kind: 'upright', angle: 1.86, outward: 1.76, scale: .48, turn: .23 },
  { kind: 'leaning', angle: 2.08, outward: 3.84, scale: .56, turn: -.45 },
  { kind: 'willow', angle: 4.58, outward: 6.0, scale: .76, turn: 2.41 },
  { kind: 'upright', angle: 4.31, outward: 5.54, scale: .56, turn: -.45 },
  { kind: 'spreading', angle: 5.01, outward: 6.52, scale: .59, turn: .83 },
  { kind: 'leaning', angle: 1.71, outward: 4.88, scale: .60, turn: -1.43 },
];

const goldenAngle = 2.399963;

function leafyCrown(foliage: FloraGeometry, centre: FloraPoint, radius: number, depth: number, seed: number,
  shade: Color, light: Color, compact: boolean) {
  const random = seededRandom(seed), tint = new Color();
  const [x, y, z] = centre;
  foliage.crown(centre, [radius * .51, depth * .67, radius * .48], tint.copy(shade).lerp(light, .26), seed * .002);
  const sprays = compact ? 4 : 5;
  for (let group = 0; group < sprays; group++) {
    const yaw = group * Math.PI * 2 / sprays + random() * .39;
    const twist = .46 + random() * .22;
    const anchor: FloraPoint = [x + Math.cos(yaw) * radius * twist, y + depth * (random() - .48), z + Math.sin(yaw) * radius * twist * .86];
    const width = radius * (.36 + random() * .15), rise = depth * (.59 + random() * .32);
    foliage.crown(anchor, [width * .75, rise * .73, width * .64], tint.copy(shade).lerp(light, .29 + random() * .24), seed * .002 + yaw);
    const blades = compact ? 7 : 12;
    for (let i = 0; i < blades; i++) {
      const a = yaw + i * goldenAngle + random() * .38, dy = .81 - 1.61 * (i + .4) / blades;
      const ring = Math.sqrt(1 - dy * dy), dx = Math.cos(a), dz = Math.sin(a);
      const point: FloraPoint = [anchor[0] + dx * width * ring * .68, anchor[1] + dy * rise * .70,
        anchor[2] + dz * width * ring * .59];
      const length = radius * (.17 + random() * .19);
      foliage.leaf({ at: point, along: [Math.cos(a + .39), .22 + dy * .51, Math.sin(a + .39)],
        bend: [dx * .026, -.035, dz * .026], length, width: length * (.28 + random() * .20),
        color: tint.copy(shade).lerp(light, .32 + random() * .56), rows: compact ? 2 : 3, solid: false });
    }
  }
}

function hangingSprays(wood: FloraGeometry, foliage: FloraGeometry, at: Vector3, bearing: number,
  bark: Color, shade: Color, light: Color, compact: boolean, seed: number) {
  const random = seededRandom(seed), tint = new Color();
  for (let i = 0; i < (compact ? 6 : 9); i++) {
    const a = bearing + (i / 8 - .48) * 2.4, x = Math.cos(a), z = Math.sin(a);
    const descent = .61 + random() * .85, reach = .30 + random() * .55, top = .12 + random() * .22;
    const path = new CatmullRomCurve3([at.clone(),
      at.clone().add(new Vector3(x * reach * .59, top, z * reach * .59)),
      at.clone().add(new Vector3(x * reach, -descent * .35, z * reach)),
      at.clone().add(new Vector3(x * reach * 1.07, -descent, z * reach * 1.07))]);
    wood.stem(path.getPoints(3).map((p, n) => [p.x, p.y, p.z, [.015, .010, .005, .0018][n]]), bark, 4, 7);
    for (let n = 0; n < (compact ? 10 : 15); n++) {
      const t = .19 + n * (compact ? .079 : .054), side = n % 2 === 0 ? -1 : 1;
      const yaw = a + side * (.68 + random() * .49), size = (.15 + random() * .16) * (1 - .31 * t);
      foliage.leaf({ at: path.getPoint(t).toArray(), along: [Math.cos(yaw), -.34 - t * .49, Math.sin(yaw)],
        bend: [x * .03, -.074, z * .03], length: size, width: size * .14, rows: compact ? 2 : 3, solid: false,
        color: tint.copy(shade).lerp(light, .23 + random() * .70) });
    }
  }
}

function treeForm(site: ShoreSite, index: number, compact: boolean, heightAtRoot: (x: number, z: number) => number) {
  const form = species[site.kind], random = seededRandom(72871 + index * 1837);
  const wood = new FloraGeometry(), foliage = new FloraGeometry(), bark = new Color(form.bark);
  const shade = new Color(form.shade), light = new Color(form.light), height = form.height * (.92 + random() * .16);
  const drift = (random() - .5) * .61, lean = form.lean + (random() - .5) * .25;
  const r = form.trunk * (.91 + random() * .24);
  const trunk: StemSection[] = [[0, -.14, 0, r * 1.43], [lean * .12, height * .18, drift * .38, r * .91],
    [lean * .34 + .08, height * .40, drift * .61, r * .71], [lean * .73 - .09, height * .64, drift * .88, r * .49],
    [lean * .94, height * .83, drift, r * .29], [lean, height, drift + .14, .009]];
  const spine = new CatmullRomCurve3(trunk.map(([x, y, z]) => new Vector3(x, y, z)));
  wood.stem(trunk, bark, compact ? 8 : 12);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + random() * .46, length = .28 + random() * .44;
    const x = Math.cos(a) * length, z = Math.sin(a) * length;
    wood.stem([[x, heightAtRoot(x, z) - .019, z, .007], [x * .47, heightAtRoot(x * .47, z * .47) + .032, z * .47, r * .29],
      [lean * .048, .30, drift * .07, r * .53]], bark, 6, 7);
  }
  for (let i = 0; i < form.branches; i++) {
    const tier = i / (form.branches - 1), a = i * goldenAngle + random() * .39;
    const start = spine.getPoint(.38 + tier * .53), dx = Math.cos(a), dz = Math.sin(a);
    const reach = form.radius * (1.02 - .45 * tier) * (.78 + random() * .34);
    const rise = height * (site.kind === 'leaning' ? .097 : .166) * (1.25 - tier * .52);
    const joint = start.clone().add(new Vector3(dx * reach * .49, rise * .63, dz * reach * .47));
    const end = start.clone().add(new Vector3(dx * reach, rise, dz * reach));
    const width = r * (.57 - .32 * tier);
    wood.stem([[start.x, start.y, start.z, width], [joint.x, joint.y, joint.z, width * .48],
      [end.x, end.y, end.z, .006]], bark, compact ? 5 : 7, 7);

    if (site.kind === 'willow') {
      hangingSprays(wood, foliage, end, a, bark, shade, light, compact, index * 812 + i * 231);
      continue;
    }
    // Branch forks carry groups of leaves at unequal heights and leave gaps under the tier.
    for (let n = 0; n < 3; n++) {
      const angle = a + (n - 1) * (.78 + random() * .21);
      const span = form.radius * (.17 + random() * .19);
      const tip = end.clone().add(new Vector3(Math.cos(angle) * span, .09 + random() * .31, Math.sin(angle) * span));
      wood.stem([[joint.x, joint.y, joint.z, width * .36], [end.x, end.y + .03, end.z, width * .18],
        [tip.x, tip.y, tip.z, .003]], bark, 5, 6);
      const size = (.36 + random() * .31) * (1 - .25 * tier);
      const depth = size * (site.kind === 'leaning' ? .38 : .66);
      leafyCrown(foliage, [tip.x, tip.y + depth * .30, tip.z], size, depth, index * 913 + i * 89 + n * 49, shade, light, compact);
    }
  }
  if (site.kind !== 'willow') {
    leafyCrown(foliage, [lean, height, drift + .12], .52, .38, 361 + index * 790, shade, light, compact);
  }
  return { wood: wood.build(`${site.kind}-boughs`), foliage: foliage.build(`${site.kind}-leaves`) };
}

export function makeShoreGrove(low: boolean) {
  const group = new Group();
  group.name = 'ShoreGrove';
  const bark = softenVegetation(new MeshStandardMaterial({ vertexColors: true, roughness: .92 }), true, true);
  const canopy = softenVegetation(new MeshStandardMaterial({ vertexColors: true, roughness: .89, side: DoubleSide }), false, true, true);
  for (const [i, site] of shoreGroveSites.entries()) {
    const tree = new Group();
    tree.name = `PondTree-${site.kind}-${i}`;
    const { x, z } = shorePoint(site.angle, -site.outward);
    const y = outerBankHeight(x, z), c = Math.cos(site.turn), s = Math.sin(site.turn);
    const heightAtRoot = (dx: number, dz: number) => (outerBankHeight(x + (dx * c + dz * s) * site.scale,
      z + (dz * c - dx * s) * site.scale) - y) / site.scale;
    const form = treeForm(site, i, low, heightAtRoot);
    const trunk = new Mesh(form.wood, bark), leaves = new Mesh(form.foliage, canopy);
    trunk.castShadow = trunk.receiveShadow = leaves.castShadow = leaves.receiveShadow = true;
    tree.position.set(x, y, z);
    tree.scale.setScalar(site.scale);
    tree.rotation.y = site.turn;
    tree.add(trunk, leaves);
    group.add(tree);
  }
  return { group, dispose() { disposeSculpture(group); } };
}
