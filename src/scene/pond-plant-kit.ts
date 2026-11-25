import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { disposeSculpture } from './PondCreatures';
import { FloraGeometry } from './flora-geometry';
import { seededRandom } from './pond-life';
import { plantPrefabs } from './shore-plant-geometry';
import type { PlantKind } from './shore-plant-geometry';

const turn = 2.399963;
const tender = new Color('#a1a970'), grass = new Color('#607e50'), sedge = new Color('#466849');
const leafy = new Color('#547651'), young = new Color('#89a468'), branch = new Color('#76654d');
const stem = new Color('#698451'), ivory = new Color('#f2e1ad'), mauve = new Color('#cba2a4');

function grassRoot(variant: number, compact: boolean) {
  const shape = new FloraGeometry(), random = seededRandom(5374 + 111 * variant), color = new Color();
  const total = 7 + variant;
  for (let i = 0; i < total; i++) {
    const bearing = i * turn + random() * .65, x = Math.cos(bearing), z = Math.sin(bearing);
    const spread = .21 + random() * .62, length = (.19 + random() * .25) * (1 + variant * .12);
    const width = (.009 + random() * .025) * (1 + .13 * variant);
    if (compact && i >= 5) continue;
    const lean = length * spread;
    shape.leaf({ at: [x * .025, 0, z * .028], along: [x * spread, 1, z * spread], bend: [x * lean, -lean * .58, z * lean],
      length, width, rows: compact ? 3 : 6, color: color.copy(sedge).lerp(i % 3 === 0 ? tender : grass, .24 + random() * .66) });
  }
  return shape.build(compact ? `GrassCompact-${variant}` : `GrassRootVariant-${variant}`);
}

const shrubs = {
  spreading: { height: .67, width: .62, branches: 12 },
  compact: { height: .82, width: .43, branches: 13 },
  open: { height: .91, width: .49, branches: 8 },
} as const;

function leafyShrub(kind: keyof typeof shrubs, compact: boolean) {
  const profile = shrubs[kind], shape = new FloraGeometry(), random = seededRandom(profile.branches * 379), tint = new Color();
  for (let i = 0; i < profile.branches; i++) {
    const angle = i * turn + random() * .48, dx = Math.cos(angle), dz = Math.sin(angle);
    const spread = profile.width * (.39 + random() * .60), rise = profile.height * (.43 + random() * .57);
    shape.stem([[dx * .033, -.007, dz * .033, .023], [dx * spread * .32, rise * .54, dz * spread * .32, .018],
      [dx * spread, rise, dz * spread, .003]], branch, compact ? 4 : 5, compact ? 3 : 6);
    for (let n = 0; n < 8; n++) {
      const t = .33 + .64 * n / 7, radius = spread * t ** 1.53, side = n % 2 === 0 ? 1 : -1;
      const bearing = angle + side * (.50 + random() * .62);
      const length = (.12 + random() * .14) * (1.1 - .29 * t);
      const width = length * (.21 + random() * .15);
      const color = tint.copy(leafy).lerp(young, .17 + random() * .67);
      if (compact && n % 3 === 1) continue;
      shape.leaf({ at: [dx * radius, rise * t, dz * radius], along: [Math.cos(bearing), .42 - t * .23, Math.sin(bearing)],
        bend: [0, -.040, 0], length, width, color, rows: compact ? 2 : 4 });
    }
  }
  return shape.build(compact ? `PlantLow-${kind}` : `PondShrub-${kind}`);
}

function groundcover(compact: boolean) {
  const shape = new FloraGeometry(), random = seededRandom(61617), tint = new Color();
  for (let i = 0; i < 15; i++) {
    const spin = i * turn + random() * .24, x = Math.cos(spin), z = Math.sin(spin);
    const length = .20 + random() * .26, rise = .105 + random() * .09, phase = .025 + random() * .04;
    shape.stem([[0, 0, 0, .010], [x * length * .5, rise, z * length * .5, .007],
      [x * length, phase, z * length, .002]], stem, 4, compact ? 3 : 6);
    for (let n = 1; n <= 7; n++) {
      const side = n % 2 === 0 ? -1 : 1, t = .19 + n * .104;
      const blade = (.093 + random() * .05) * (1.14 - .5 * t);
      const bearing = spin + side * (1.15 - .62 * t);
      const color = tint.copy(leafy).lerp(young, .25 + random() * .72);
      if (compact && n % 2 === 0) continue;
      shape.leaf({ at: [x * length * t, phase * t + Math.sin(Math.PI * t) * (rise - phase * .5), z * length * t],
        along: [Math.cos(bearing), .29, Math.sin(bearing)], bend: [0, -.029, 0], length: blade, width: blade * .35, color, rows: compact ? 2 : 3 });
    }
  }
  return shape.build(compact ? 'PlantLow-cover' : 'PondGroundcover');
}

function wildflowers(compact: boolean) {
  const shape = new FloraGeometry(), random = seededRandom(41026), gold = new Color('#c79247');
  for (let i = 0; i < 11; i++) {
    const spin = i * turn, x = Math.cos(spin), z = Math.sin(spin), reach = Math.sqrt((i + .4) / 11) * .34;
    const rise = .16 + random() * .18, actual = reach * 1.04, base = reach * .16;
    shape.stem([[x * base, 0, z * base, .009], [x * reach * .59, rise * .52, z * reach * .59, .005],
      [x * actual, rise, z * actual, .003]], stem, 4, compact ? 4 : 6);
    for (let n = 0; n < 3; n++) {
      const bearing = spin + n * 2.44;
      const attached = base + (actual - base) * (.17 + n * .21);
      shape.leaf({ at: [x * attached, rise * (.19 + n * .19), z * attached], along: [Math.cos(bearing), .44, Math.sin(bearing)],
        bend: [0, -.014, 0], length: .076, width: .027, color: grass, rows: compact ? 2 : 3 });
    }
    const petal = .028 + random() * .028, petals = compact ? 4 : 7, center: [number, number, number] = [x * actual, rise, z * actual];
    for (let n = 0; n < petals; n++) {
      const angle = spin + n * Math.PI * 2 / petals;
      shape.leaf({ at: center, along: [Math.cos(angle), .21, Math.sin(angle)], bend: [0, .012, 0],
        length: petal, width: petal * .33, color: i % 4 === 0 ? mauve : ivory, rows: compact ? 2 : 3 });
    }
    shape.crown(center, [petal * .30, petal * .18, petal * .30], gold, spin);
  }
  return shape.build(compact ? 'PlantLow-flowers' : 'PondWildflowers');
}

/** The placement kit is generated in Three.js; the scene uses the same rooted plant batches in both profiles. */
export function makePondPlantKit() {
  const kit = new Group(), variants = new Group();
  kit.name = 'PondPlantKit';
  variants.name = 'CompactPondPlants';
  kit.add(variants);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  const grasses = Array.from({ length: 3 }, (_, i) => grassRoot(i, false));
  for (let i = 0; i < grasses.length; i++) {
    const mesh = new Mesh(grassRoot(i, true), material);
    mesh.userData.compactGrassVariant = i;
    variants.add(mesh);
  }

  const groups = [['small', 9, .24], ['medium', 23, .42], ['large', 47, .59]] as const;
  for (const [kind, count, spread] of groups) {
    const patch = new Group();
    patch.name = plantPrefabs[kind];
    patch.userData.rootCount = count;
    const random = seededRandom(count * 184);
    for (let i = 0; i < count; i++) {
      const variant = i % grasses.length, root = new Mesh(grasses[variant], material);
      root.userData.grassVariant = variant;
      const angle = i * turn + random() * .21, radius = Math.sqrt(i / count) * spread * (.75 + random() * .32);
      root.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * .84);
      root.rotation.y = angle + random();
      root.scale.setScalar(.73 + random() * .40);
      patch.add(root);
    }
    kit.add(patch);
  }

  const forms: [PlantKind, (compact: boolean) => ReturnType<FloraGeometry['build']>][] = [
    ['spreading', compact => leafyShrub('spreading', compact)], ['compact', compact => leafyShrub('compact', compact)],
    ['open', compact => leafyShrub('open', compact)], ['cover', groundcover], ['flowers', wildflowers],
  ];
  for (const [kind, build] of forms) {
    const patch = new Group();
    patch.name = plantPrefabs[kind];
    patch.userData.rootCount = 1;
    const full = new Mesh(build(false), material), compact = new Mesh(build(true), material);
    full.userData.plantVariant = compact.userData.compactPlantVariant = kind;
    patch.add(full);
    kit.add(patch);
    variants.add(compact);
  }
  return { kit, dispose() { disposeSculpture(kit); } };
}
