import {
  BufferGeometry, CatmullRomCurve3, Color, DataTexture, DoubleSide, Float32BufferAttribute,
  Group, LinearFilter, MathUtils, Mesh, MeshStandardMaterial, RGBAFormat, ShapeUtils, Vector2, Vector3,
} from 'three';
import type { Material } from 'three';
import { islandSurface } from './materials';

type Point = readonly [number, number, number];

export const islandScale = Math.SQRT2;
export const islandPoint = (x: number, z: number) => new Vector2(x * islandScale, z * islandScale);

const rimAnchors = [
  [-5.89, .12], [-6.34, 1.51], [-5.61, 2.47], [-4.48, 3.33], [-2.97, 3.99],
  [-1.25, 4.26], [.48, 4.30], [2.20, 4.12], [3.76, 3.62], [5.22, 2.77],
  [6.14, 1.64], [6.44, .23], [6.13, -1.37], [5.53, -2.51],
  [4.16, -3.63], [2.56, -4.03], [.76, -4.24], [-1.13, -4.13],
  [-2.97, -3.78], [-4.49, -3.11], [-5.55, -2.19], [-6.13, -1.04],
].map(([x, z]) => islandPoint(x, z));

const rimCurve = new CatmullRomCurve3(rimAnchors.map(point => new Vector3(point.x, 0, point.y)), true);
export const islandRim = rimAnchors.flatMap((anchor, index) => {
  if (index === 0) return [anchor]; // Keep the straight lip where the pond reaches the cliff.
  return [anchor, ...[1 / 3, 2 / 3].map(fraction => {
    const point = rimCurve.getPoint((index + fraction) / rimAnchors.length);
    const swell = Math.sin(index * 2.38 + fraction * 3.9) * Math.sin(fraction * Math.PI) * .25;
    const scale = 1 + swell / Math.hypot(point.x, point.z);
    return new Vector2(point.x * scale, point.z * scale);
  })];
});

const shoreAnchors = [islandRim[0], ...[
  [-5.49, -.03], [-5.17, -.409], [-4.62, -1.007], [-3.68, -1.442], [-2.52, -1.604],
  [-1.47, -1.460], [-.59, -1.059], [.15, -.614], [.48, -.40], [.56, .14], [.37, .61], [.42, .92],
  [.70, 1.24], [1.16, 1.43], [1.52, 1.80], [1.50, 2.27], [1.27, 2.76], [.85, 3.02], [.40, 3.04],
  [.07, 2.78], [-.10, 2.40], [-.24, 1.97], [-.56, 1.73], [-1.41, 1.73], [-2.75, 1.915], [-3.98, 1.746],
  [-4.86, 1.47], [-5.44, 1.27],
].map(([x, z]) => islandPoint(x, z)), islandRim[1]];

export const shore = new CatmullRomCurve3(shoreAnchors.map(p => new Vector3(p.x, 0, p.y)))
  .getPoints(108).map(p => new Vector2(p.x, p.z));
export const spill = { inner: islandRim[0], outer: islandRim[1] };
export const fishingSeat = islandPoint(-5.93, 1.60);
export const fishingHeading = 2.21;
export const lakeLevel = -.16;
export const seaLevel = -6.18;
export const houseSite = islandPoint(3.76, -1.0);
export const dockSite = islandPoint(-1.60, 1.89);
export const bridgeLandings = [islandPoint(1.75, 2.03), islandPoint(-.43, 2.11)] as const;
export const pavilionSite = islandPoint(-.14, -2.66);
export const gardenSeat = islandPoint(2.45, 2.84);
export const visitorSite = islandPoint(1.72, 3.49);
export const dogSite = islandPoint(1.05, 3.48);

const porchPath = islandPoint(2.80, .63);
const gardenPath = islandPoint(2.30, 1.40);
const secondaryTrails = [
  [islandPoint(3.07, .13), porchPath, islandPoint(2.57, 1.05), gardenPath,
    islandPoint(2.04, 1.78), bridgeLandings[0]],
  [bridgeLandings[1], islandPoint(-.81, 2.37), islandPoint(-1.22, 2.26), dockSite],
  [gardenPath, islandPoint(2.75, 1.70), islandPoint(3.01, 2.09), islandPoint(2.87, 2.49), gardenSeat],
  [porchPath, islandPoint(2.10, .49), islandPoint(1.58, .24), islandPoint(1.22, -.19),
    islandPoint(1.02, -.66), islandPoint(.70, -1.12), islandPoint(.39, -1.53), islandPoint(.12, -1.88),
    pavilionSite],
];

const pathAnchors = [[2.30, 4.06], [1.77, 3.72], [1.63, 3.30], [1.95, 2.92], [2.14, 2.54],
  [2.07, 2.13], [2.03, 1.69], [1.75, 1.43], [1.17, 1.32]].map(([x, z]) => islandPoint(x, z));
export const meadowPath = new CatmullRomCurve3(pathAnchors.map(point => new Vector3(point.x, 0, point.y)))
  .getPoints(35).map(point => new Vector2(point.x, point.z));

export function seeded(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function inside(x: number, z: number, polygon: Vector2[]) {
  let hits = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[previous];
    const b = polygon[index];
    if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) hits = !hits;
  }
  return hits;
}

export const onIsland = (x: number, z: number) => inside(x, z, islandRim);
export const inLake = (x: number, z: number) => inside(x, z, shore);

export function lineDistance(x: number, z: number, line: readonly Vector2[], closed = false) {
  let closest = Infinity;
  const count = closed ? line.length : line.length - 1;
  for (let index = 0; index < count; index++) {
    const a = line[index];
    const b = line[index + 1] ?? line[0];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const along = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz)));
    const offsetX = x - a.x - dx * along;
    const offsetZ = z - a.y - dz * along;
    closest = Math.min(closest, offsetX * offsetX + offsetZ * offsetZ);
  }
  return Math.sqrt(closest);
}

export const shoreDistance = (x: number, z: number) => lineDistance(x, z, shore);
export const rimDistance = (x: number, z: number) => lineDistance(x, z, islandRim, true);

const structureClearances = [
  { point: pavilionSite, radius: 1.05 }, { point: gardenSeat, radius: .59 }, { point: dockSite, radius: .46 },
  { point: visitorSite, radius: .24 }, { point: dogSite, radius: .32 },
];

export function occupiedGround(x: number, z: number) {
  return (Math.abs(x - houseSite.x) < 1.56 && Math.abs(z - houseSite.y) < 1.49)
    || structureClearances.some(({ point, radius }) => (x - point.x) ** 2 + (z - point.y) ** 2 < radius ** 2)
    || lineDistance(x, z, bridgeLandings) < .45;
}

export function trailCoverage(x: number, z: number) {
  if (x < -2.9 || x > 4.8 || z < -4.5 || z > 6.3) return 0;
  const edge = Math.sin(x * 10.5 + z * 6.6) * .026 + Math.sin(x * 4.4 - z * 8.2) * .035;
  const primary = 1 - MathUtils.smoothstep(lineDistance(x, z, meadowPath) + edge, .35, .58);
  let secondary = 0;
  for (const path of secondaryTrails) {
    secondary = Math.max(secondary, 1 - MathUtils.smoothstep(lineDistance(x, z, path) + edge, .12, .41));
  }
  return Math.max(primary, secondary * .46);
}

export function groundHeight(x: number, z: number, bank = shoreDistance(x, z)) {
  const u = x / islandScale;
  const v = z / islandScale;
  const rise = Math.exp(-((u - 3.75) ** 2 + (v + 1.06) ** 2) * .31);
  const headland = Math.exp(-((u - .36) ** 2 + (v + 3.2) ** 2) * .82);
  const bumps = Math.sin(u * 2.2 + v * 1.18) * Math.cos(v * 2.4 - u * .83) * .044;
  const height = .106 + .16 * rise + .17 * headland + .064 * Math.sin(u * .8 + v * .54)
    + .052 * Math.cos(v * 1.55 - u * .26) + bumps;
  return MathUtils.lerp(lakeLevel - .009, height, MathUtils.smoothstep(bank, 0, .56));
}

export function bedHeight(x: number, z: number, bank = shoreDistance(x, z)) {
  return lakeLevel - .009 - .67 * MathUtils.smoothstep(bank, .0, 1.68);
}

export interface IslandSurfaceMask {
  texture: DataTexture;
  origin: Vector2;
  span: Vector2;
}

function makeSurfaceMask(): IslandSurfaceMask {
  const origin = new Vector2(Math.min(...islandRim.map(p => p.x)) - .12, Math.min(...islandRim.map(p => p.y)) - .12);
  const span = new Vector2(Math.max(...islandRim.map(p => p.x)) + .12, Math.max(...islandRim.map(p => p.y)) + .12).sub(origin);
  const width = 384, height = 272;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const z = origin.y + (row + .5) / height * span.y;
    for (let column = 0; column < width; column++) {
      const x = origin.x + (column + .5) / width * span.x;
      const wet = inLake(x, z);
      const offset = (row * width + column) * 4;
      data[offset] = Math.round(trailCoverage(x, z) * 255);
      data[offset + 1] = wet ? 255 : 0;
      data[offset + 2] = Math.round(Math.min(1, shoreDistance(x, z) / 1.72) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return { texture, origin, span };
}

export class Surface {
  private positions: number[] = [];
  private colors: number[] = [];

  triangle(a: Point, b: Point, c: Point, tint: Color, tintB = tint, tintC = tint) {
    this.positions.push(...a, ...b, ...c);
    this.colors.push(tint.r, tint.g, tint.b, tintB.r, tintB.g, tintB.b, tintC.r, tintC.g, tintC.b);
  }

  quad(a: Point, b: Point, c: Point, d: Point, tint: Color, other = tint) {
    this.triangle(a, b, c, tint);
    this.triangle(a, c, d, other);
  }

  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  mesh(name: string, material: Material) {
    const mesh = new Mesh(this.geometry(), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

function sheet(contour: Vector2[], height: (x: number, z: number) => number,
  tint: (x: number, z: number) => Color, depth: number) {
  const mesh = new Surface();
  function triangle(a: Vector2, b: Vector2, c: Vector2, divisions: number) {
    if (divisions > 0) {
      const ab = a.clone().lerp(b, .5);
      const bc = b.clone().lerp(c, .5);
      const ca = c.clone().lerp(a, .5);
      triangle(a, ab, ca, divisions - 1);
      triangle(ab, b, bc, divisions - 1);
      triangle(ca, bc, c, divisions - 1);
      triangle(ab, bc, ca, divisions - 1);
      return;
    }
    const [u, v] = (b.x - a.x) * (c.y - a.y) > (b.y - a.y) * (c.x - a.x) ? [c, b] : [b, c];
    mesh.triangle([a.x, height(a.x, a.y), a.y], [u.x, height(u.x, u.y), u.y],
      [v.x, height(v.x, v.y), v.y], tint(a.x, a.y), tint(u.x, u.y), tint(v.x, v.y));
  }
  for (const [a, b, c] of ShapeUtils.triangulateShape(contour, [])) triangle(contour[a], contour[b], contour[c], depth);
  return mesh;
}

function islandSides() {
  const sides = new Surface();
  const random = seeded(95);
  const slabTints = ['#57587c', '#6b6b90', '#555b7e', '#777697', '#686387', '#535576', '#6e7296']
    .map(value => new Color(value));
  const turf = new Color('#456b45');
  const earth = new Color('#8b664e');
  const bands = [
    { scale: 1, height: 0, x: 0, z: 0, spread: 0 },
    { scale: 1.002, height: -.17, x: 0, z: 0, spread: .055 },
    { scale: 1.006, height: -.35, x: 0, z: 0, spread: .090 },
    { scale: .95, height: -1.14, x: .09, z: -.03, spread: .42 },
    { scale: .76, height: -2.10, x: .25, z: .04, spread: .55 },
    { scale: .49, height: -3.04, x: .56, z: .33, spread: .48 },
    { scale: .13, height: -3.75, x: .98, z: .51, spread: .18 },
  ];
  const rings: Point[][] = bands.map((band, layer) => islandRim.map((point, i) => {
    if (layer === 0) return [point.x, groundHeight(point.x, point.y), point.y];
    const severity = layer < 3 ? .08 : .35;
    const cut = Math.sin(i * 2.07 + layer * 1.3) * severity * band.scale;
    const y = band.height + (random() - .5) * band.spread + (layer < 3
      ? (i < 2 ? lakeLevel : groundHeight(point.x, point.y)) : 0);
    return [point.x * band.scale + cut + band.x, y, point.y * band.scale - cut * .28 + band.z];
  }));
  for (let layer = 0; layer < rings.length - 1; layer++) {
    for (let index = 0; index < islandRim.length; index++) {
      const next = (index + 1) % islandRim.length;
      const atSpillway = layer === 0 && index === 0;
      const top = rings[layer][index];
      const nextTop = rings[layer][next];
      const a: Point = atSpillway ? [top[0], lakeLevel - .019, top[2]] : top;
      const b = rings[layer + 1][index];
      const c = rings[layer + 1][next];
      const d: Point = atSpillway ? [nextTop[0], lakeLevel - .019, nextTop[2]] : nextTop;
      const slab = slabTints[(index * 11 + layer * 3) % slabTints.length];
      const color = (layer === 0 ? turf : layer === 1 ? earth : slab).clone();
      color.multiplyScalar(.89 + random() * .20 - Math.max(0, layer - 2) * .025);
      if (layer < 2) {
        const shade = .87 + random() * .15;
        const base = color.clone().lerp(layer === 0 ? earth : slab, .54);
        sides.triangle(a, b, c, color, base, base.clone().multiplyScalar(shade));
        sides.triangle(a, c, d, color, base.clone().multiplyScalar(shade), color.clone().multiplyScalar(shade));
      } else if (layer === 2 || (index + layer) % 3 === 1) {
        sides.quad(a, b, c, d, color, color.clone().multiplyScalar(.87 + random() * .15));
      } else {
        const middle: Point = [(a[0] + b[0] + c[0] + d[0]) * .25 * 1.041,
          (a[1] + b[1] + c[1] + d[1]) * .25, (a[2] + b[2] + c[2] + d[2]) * .25 * 1.031];
        sides.triangle(a, b, middle, color.clone().multiplyScalar(.85));
        sides.triangle(b, c, middle, color.clone().multiplyScalar(.95));
        sides.triangle(c, d, middle, color.clone().multiplyScalar(1.08));
        sides.triangle(d, a, middle, color);
      }
    }
  }
  const bottom = rings[rings.length - 1];
  for (let i = 0; i < bottom.length; i++) {
    sides.triangle(bottom[i], [1.12, -3.91, .53], bottom[(i + 1) % bottom.length], new Color('#4b4e6b'));
  }
  const mesh = sides.mesh('草皮、薄土与蓝紫岩壁', islandSurface(new MeshStandardMaterial({ vertexColors: true, roughness: .91, side: DoubleSide }), 'stone'));
  mesh.castShadow = false;
  return mesh;
}

export function makeTerrain() {
  const root = new Group();
  root.name = '浮岛地形';
  const mask = makeSurfaceMask();
  const moss = new Color('#2f5e4b');
  const meadow = new Color('#a0b05d');
  const bankDirt = new Color('#77674c');
  const bed = new Color('#36716f');
  const sand = new Color('#9c9871');
  const shoreColor = (x: number, z: number) => {
    const patches = .43 + Math.sin(x * .67 + z * .42) * .13 + Math.cos(x * .43 - z * .68) * .13;
    const clearing = Math.exp(-((x - .7) ** 2 * .055 + (z - 2.15) ** 2 * .12)) * .36;
    const edge = MathUtils.smoothstep(rimDistance(x, z), .0, 1.65);
    const color = moss.clone().lerp(meadow, MathUtils.clamp((patches + clearing) * (.48 + edge * .52), 0, 1));
    const damp = 1 - MathUtils.smoothstep(shoreDistance(x, z), .035, .34);
    return color.lerp(bankDirt, damp * .85);
  };
  const land = sheet([...shore, ...islandRim.slice(2)], groundHeight, shoreColor, 4)
    .mesh('草地与土径', islandSurface(new MeshStandardMaterial({ roughness: .98, vertexColors: true }), 'grass', mask));
  const poolColor = (x: number, z: number) => sand.clone().lerp(bed, MathUtils.smoothstep(shoreDistance(x, z), .05, 1.6));
  const floor = sheet(shore, bedHeight, poolColor, 3)
    .mesh('湿润浅滩与湖盆', new MeshStandardMaterial({ vertexColors: true, roughness: .92 }));
  land.castShadow = floor.castShadow = false;
  root.add(land, floor, islandSides());
  return { root, land, floor, mask };
}
