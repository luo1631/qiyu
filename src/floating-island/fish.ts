import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, MathUtils, MeshStandardMaterial, Vector2 } from 'three';
import { Sculpture } from '../scene/sculpture';
import { bedHeight, inLake, islandPoint, lakeLevel, shoreDistance, Surface } from './terrain';

const profiles = [
  [-.252, .010, .012], [-.199, .021, .023], [-.140, .035, .037], [-.061, .057, .048],
  [.038, .069, .056], [.129, .064, .054], [.184, .047, .045], [.221, .030, .027], [.240, .014, .016],
] as const;

const fishSites = [
  { center: islandPoint(-3.89, .77), rx: .80, rz: .49, clock: .64, phase: .80, size: 1.04, color: '#d05d36', pale: '#f0d5ad' },
  { center: islandPoint(-3.31, .77), rx: .93, rz: .51, clock: .55, phase: 2.37, size: .89, color: '#d88b3e', pale: '#e6ca90' },
  { center: islandPoint(-2.78, -.32), rx: .82, rz: .64, clock: .48, phase: 3.70, size: 1.02, color: '#c65a40', pale: '#e9dec8' },
  { center: islandPoint(-3.76, -.41), rx: .69, rz: .37, clock: .58, phase: 2.92, size: .88, color: '#9c6250', pale: '#ddd6b1' },
];

function bodyGeometry(color: string, pale: string, variation: number) {
  const positions: number[] = [], pigment: number[] = [], indices: number[] = [];
  const light = new Color(pale), patch = new Color(color), dark = new Color('#757767'), tint = new Color();
  const rows = 41, sides = 16;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows * (profiles.length - 1);
    const i = Math.min(profiles.length - 2, Math.floor(t));
    const [za, wa, ha] = profiles[i], [zb, wb, hb] = profiles[i + 1], blend = t - i;
    const z = MathUtils.lerp(za, zb, blend), width = MathUtils.lerp(wa, wb, blend), height = MathUtils.lerp(ha, hb, blend);
    for (let column = 0; column < sides; column++) {
      const phi = column * 2 * Math.PI / sides;
      const x = Math.cos(phi), y = Math.sin(phi);
      positions.push(x * width, y * height, z);
      const spots = Math.sin(z * 25 + variation + 1.8 * Math.cos(phi + z * 4.1)) + .28 * Math.sin(z * 56 - phi * 1.6);
      tint.copy(light).lerp(patch, MathUtils.smoothstep(spots, -.35, .60) * MathUtils.smoothstep(y, -.73, .19));
      tint.lerp(dark, .17 * MathUtils.smoothstep(-y, .25, .95)).multiplyScalar(.95 + .11 * Math.max(0, y));
      pigment.push(tint.r, tint.g, tint.b);
      if (row === rows) continue;
      const a = row * sides + column, b = row * sides + (column + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(pigment, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeFish(site: (typeof fishSites)[number], index: number, material: MeshStandardMaterial) {
  const body = new Sculpture().add(bodyGeometry(site.color, site.pale, index * 2.61), '#ffffff');
  const fin = new Color(site.pale).lerp(new Color(site.color), .27);
  const finTip = new Color(site.pale).multiplyScalar(.94);
  const fins = new Surface();
  for (const side of [-1, 1]) {
    body.oval([side * .051, .025, .181], [.012, .011, .010], '#4b4640', [0, side * .27, 0], 10, 7);
    fins.triangle([side * .055, -.019, .124], [side * .122, -.039, .060],
      [side * .097, -.038, -.028], fin, finTip, fin);
    fins.triangle([side * .050, -.029, -.006], [side * .085, -.036, -.062], [side * .067, -.039, -.103],
      fin, fin, finTip);
  }
  fins.triangle([0, .055, .030], [-.007, .094, -.041], [0, .046, -.137], fin, finTip, fin);
  body.add(fins.geometry(), '#ffffff');
  const root = new Group();
  root.name = '池中的鱼 ' + (index + 1);
  root.scale.setScalar(site.size);
  root.add(body.mesh('鱼身、斑纹与胸鳍', material));

  const tailFin = new Surface();
  tailFin.triangle([0, 0, .014], [-.024, .057, -.131], [.011, .020, -.083], fin, finTip, fin);
  tailFin.triangle([0, 0, .014], [.011, .020, -.083], [.029, -.053, -.138], fin, fin, finTip);
  tailFin.triangle([0, 0, .014], [.029, -.053, -.138], [.041, -.019, -.104], fin, finTip, fin);
  const tail = new Group();
  tail.position.z = -.224;
  tail.add(new Sculpture().add(tailFin.geometry(), '#ffffff').mesh('摆动的叉形尾鳍', material));
  root.add(tail);
  return { root, tail, site };
}

function sampleSwim(site: (typeof fishSites)[number], time: number, swan: Vector2, boat: Vector2, result: Vector2) {
  const turn = site.phase + time * site.clock + Math.sin(time * .66 + site.phase) * .31;
  const x = site.center.x + site.rx * Math.cos(turn), z = site.center.y + site.rz * Math.sin(turn);
  result.set(x, z);
  for (const [obstacle, range, force] of [[swan, 1.24, .47], [boat, 1.31, .25]] as const) {
    const dx = result.x - obstacle.x, dz = result.y - obstacle.y;
    const distance = Math.hypot(dx, dz);
    const shift = (1 - MathUtils.smoothstep(distance, .20, range)) * force;
    result.x += dx / Math.max(.12, distance) * shift;
    result.y += dz / Math.max(.12, distance) * shift;
  }
  if (!inLake(result.x, result.y) || shoreDistance(result.x, result.y) < .63) result.set(x, z);
}

export function makeFishSchool() {
  const root = new Group();
  root.name = '四条浅水鱼';
  const material = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide, roughness: .66 });
  const fish = fishSites.map((site, i) => makeFish(site, i, material));
  root.add(...fish.map(f => f.root));
  root.traverse(object => { object.castShadow = false; });
  const here = new Vector2(), later = new Vector2();
  return {
    root,
    update(time: number, swan: Vector2, boat: Vector2) {
      for (const [index, { root, tail, site }] of fish.entries()) {
        sampleSwim(site, time, swan, boat, here);
        sampleSwim(site, time + .060, swan, boat, later);
        const floor = bedHeight(here.x, here.y);
        const depth = .118 + (.5 + .5 * Math.sin(time * .79 + site.phase)) * .133;
        const y = Math.min(lakeLevel - .115, Math.max(floor + .086, lakeLevel - depth));
        const yaw = Math.atan2(later.x - here.x, later.y - here.y);
        const beat = time * (5.0 + index * .61) + site.phase;
        root.position.set(here.x, y, here.y);
        root.rotation.set(.069 * Math.cos(time * .79 + site.phase), yaw + .065 * Math.sin(beat), .062 * Math.sin(beat), 'YXZ');
        tail.rotation.y = .43 * Math.sin(beat - .65);
      }
    },
  };
}
