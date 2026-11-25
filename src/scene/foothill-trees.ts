import { Color, MathUtils } from 'three';
import { FloraGeometry, type FloraPoint } from './flora-geometry';
import { seededRandom } from './pond-life';

const turn = Math.PI * (3 - Math.sqrt(5));
const bark = new Color('#ac9e85');

export function makeFoothillTree(evergreen: boolean, seed: number) {
  const tree = new FloraGeometry(), random = seededRandom(seed), leafTint = new Color();
  const shade = new Color(evergreen ? '#9bb49a' : '#acbf97');
  const sun = new Color(evergreen ? '#d7dfb4' : '#f5ebbd');
  const lean = (random() - .5) * .27, twist = random() * Math.PI * 2;
  const trunkAt = (y: number): FloraPoint => [lean * y * y, y, .065 * y * Math.sin(y * 2.6 + twist)];
  tree.stem([
    [...trunkAt(0), evergreen ? .044 : .062], [...trunkAt(.29), .033],
    [...trunkAt(.68), .015], [...trunkAt(evergreen ? 1.05 : .94), .002],
  ], bark, 7, 7);

  if (evergreen) {
    // Long lower boughs hang and turn up at their tips. The shoots along each
    // bough open at different angles, exposing the trunk between layers.
    for (let i = 0; i < 16; i++) {
      const h = .17 + (i + random() * .65) * .052;
      const a = twist + i * turn + random() * .31;
      const [x, y, z] = trunkAt(h);
      const dx = Math.cos(a), dz = Math.sin(a);
      const reach = (.58 + .17 * random()) * (1 - h) ** .79;
      const droop = .102 * (1 - h);
      const tip = [x + dx * reach, y + .036, z + dz * reach] as const;
      tree.stem([[x, y, z, .021 * (1 - h) + .004],
        [x + dx * reach * .52, y - droop, z + dz * reach * .52, .010 * (1 - h) + .002],
        [...tip, .002]], bark, 5, 4);
      for (let j = 0; j < 5; j++) {
        const t = (j + 1) / 5, side = j % 2 === 0 ? 1 : -1;
        const spray: FloraPoint = [x + dx * reach * t, y - droop * Math.sin(t * Math.PI) + .036 * t, z + dz * reach * t];
        const bearing = a + side * ((1 - t) * .96 + .12);
        for (let n = 0; n < 4; n++) {
          const angle = bearing + (n - 1.5) * (.25 + random() * .16);
          const size = (.08 + reach * .29) * (.71 + random() * .54) * (1 - .19 * t);
          const lift = .16 + random() * .64;
          leafTint.copy(shade).lerp(sun, .21 + .48 * random() + .23 * t);
          tree.leaf({ at: spray, along: [Math.cos(angle), lift, Math.sin(angle)], bend: [0, -.19 * size, 0],
            length: size, width: size * (.19 + .12 * random()), color: leafTint, rows: 2, solid: false });
        }
      }
    }
  } else {
    // Each bough has its own crown of twigs and leaves, with openings from
    // the lowest forks into the brighter shoots at the top.
    for (let i = 0; i < 10; i++) {
      const h = .27 + i * .058 + random() * .047;
      const a = twist + i * turn + random() * .32;
      const [x, y, z] = trunkAt(h);
      const dx = Math.cos(a), dz = Math.sin(a);
      const reach = (.31 + random() * .18) * (1 - .66 * MathUtils.smoothstep(h, .56, .90));
      const rise = .09 + random() * .12;
      const elbow: FloraPoint = [x + dx * reach * .43, y + rise * .52, z + dz * reach * .43];
      const end: FloraPoint = [x + dx * reach, y + rise, z + dz * reach];
      tree.stem([[x, y, z, .033 * (1 - h) + .007], [...elbow, .013], [...end, .0025]], bark, 5, 4);
      for (let j = 0; j < 4; j++) {
        const t = (j + .42) / 3.65;
        const bearing = a + (j % 2 === 0 ? 1 : -1) * (.54 + .61 * random());
        const spread = .065 + random() * .13;
        const start: FloraPoint = [x + dx * reach * t, y + rise * t, z + dz * reach * t];
        const twig: FloraPoint = [start[0] + Math.cos(bearing) * spread, start[1] + .042 + random() * .065,
          start[2] + Math.sin(bearing) * spread];
        tree.stem([[...start, .007], [...twig, .0017]], bark, 4, 1);
        for (let n = 0; n < 8; n++) {
          const s = (n + .91) / 8;
          const angle = bearing + (n % 2 === 0 ? 1 : -1) * (.35 + random() * 1.43);
          const size = (.175 + random() * .112) * (1 - .27 * s);
          const at: FloraPoint = [MathUtils.lerp(start[0], twig[0], s), MathUtils.lerp(start[1], twig[1], s), MathUtils.lerp(start[2], twig[2], s)];
          leafTint.copy(shade).lerp(sun, .085 + .55 * random() + .20 * h);
          tree.leaf({ at, along: [Math.cos(angle), .11 + random() * .86, Math.sin(angle)], bend: [0, -.28 * size, 0],
            length: size, width: size * (.36 + .21 * random()), color: leafTint, rows: 3, solid: false });
        }
      }
    }
  }
  return tree.build(evergreen ? 'FoothillSilverFir' : 'FoothillCoppice');
}
