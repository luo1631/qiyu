import {
  BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, IcosahedronGeometry,
  InstancedMesh, MathUtils, MeshStandardMaterial, Object3D,
} from 'three';
import { FloraGeometry } from '../scene/flora-geometry';
import {
  groundHeight, inLake, islandPoint, islandRim, lakeLevel, occupiedGround, onIsland, rimDistance,
  seeded, shoreDistance, Surface, trailCoverage,
} from './terrain';

type Plant = {
  x: number; y: number; z: number; width: number; height: number; depth: number; turn: number;
  color?: string; lean?: number; roll?: number;
};

function batch(name: string, geometry: BufferGeometry, material: MeshStandardMaterial, plants: Plant[]) {
  const mesh = new InstancedMesh(geometry, material, plants.length);
  const transform = new Object3D();
  const pigment = new Color();
  plants.forEach((plant, index) => {
    transform.position.set(plant.x, plant.y, plant.z);
    transform.scale.set(plant.width, plant.height, plant.depth);
    transform.rotation.set(plant.lean ?? 0, plant.turn, plant.roll ?? 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (plant.color) mesh.setColorAt(index, pigment.set(plant.color));
  });
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function smoothNoise(x: number, z: number, seed: number) {
  const i = Math.floor(x), j = Math.floor(z);
  const tx = MathUtils.smoothstep(x - i, 0, 1), tz = MathUtils.smoothstep(z - j, 0, 1);
  const cell = (x: number, z: number) => {
    const key = Math.imul(x ^ seed, 374761393) + Math.imul(z, 668265263);
    return (Math.imul(key ^ key >>> 13, 1274126177) >>> 0) / 4294967295;
  };
  return MathUtils.lerp(MathUtils.lerp(cell(i, j), cell(i + 1, j), tx),
    MathUtils.lerp(cell(i, j + 1), cell(i + 1, j + 1), tx), tz);
}

function grassShape(tall: boolean) {
  const positions: number[] = [], colors: number[] = [], triangles: number[] = [];
  const root = new Color('#426f58'), tip = new Color(tall ? '#91b080' : '#b4c786'), color = new Color();
  const profile = [[0, .49], [.30, 1], [.62, .67], [.86, .32], [1, 0]];
  const heights = tall ? [1.03, .77, .59, 1.10, .88] : [.78, .63, .48, .96, .58, .85, .52];
  const bends = tall ? [.58, .73, .41, .38, .48] : [.47, .31, .43, .35, .48, .31, .37];
  for (const [blade, height] of heights.entries()) {
    const angle = blade * 2.399 + (tall ? .83 : .24);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const rootSpread = tall ? .044 + blade % 3 * .055 : .08 + blade % 4 * .117;
    const cross = Math.sin(blade * 4.73) * (tall ? .07 : .13);
    const offset = positions.length / 3;
    for (const [row, [t, taper]] of profile.entries()) {
      const center = rootSpread + bends[blade] * t ** 1.84;
      const spread = taper * ((tall ? .044 : .037) + (blade % 3) * .004);
      const y = height * t * (1 - .12 * t * t);
      for (const side of [-1, 0, 1]) {
        const fold = side === 0 ? spread * .19 : 0;
        const edge = cross + side * spread;
        positions.push(dx * (center + fold) - dz * edge, y, dz * (center + fold) + dx * edge);
        color.copy(root).lerp(tip, t ** 1.04).multiplyScalar((side === 0 ? 1.04 : .97) + blade % 2 * .07);
        colors.push(color.r, color.g, color.b);
      }
      if (row === profile.length - 1) continue;
      const a = offset + row * 3;
      triangles.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function grassMaterial(time: { value: number }) {
  const material = new MeshStandardMaterial({ roughness: .98, vertexColors: true, side: DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.grassTime = time;
    shader.vertexShader = 'uniform float grassTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec2 rootPosition = (modelMatrix * instanceMatrix[3]).xz;
      float gust = sin(grassTime * 1.66 + dot(rootPosition, vec2(.88, .61)));
      float flutter = sin(grassTime * 2.71 + dot(rootPosition, vec2(-1.09, 1.37)));
      vec2 wind = vec2(.074 + gust * .10 + flutter * .045, .026 + gust * .061);
      vec2 localX = normalize(instanceMatrix[0].xz);
      vec2 localZ = normalize(instanceMatrix[2].xz);
      transformed.xz += vec2(dot(wind, localX), dot(wind, localZ)) * (position.y * position.y);
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 grassUp = normalize(mat3(viewMatrix) * vec3(0., 1., 0.));
      normal = normalize(normal + grassUp * .51);
    `);
  };
  material.customProgramCacheKey = () => 'island-grass-wind';
  return material;
}

function fernShape() {
  const geometry = new Surface();
  const color = new Color('#578b69');
  const tip = new Color('#99b975');
  for (let i = 1; i <= 10; i++) {
    const t = i / 11;
    const y = Math.sin(t * Math.PI * .8) * .62;
    const span = .24 * Math.sin(t * Math.PI) ** .71;
    const end = Math.min(1, t + .13);
    for (const sign of [-1, 1]) {
      geometry.triangle([0, y, t], [sign * span * .71, y + .064, t + .028], [sign * span, y + .054, end],
        color, tip, color);
      geometry.triangle([0, y, t], [sign * span, y + .054, end], [sign * span * .40, y + .015, t + .087],
        color, color, tip);
    }
  }
  geometry.triangle([-.018, 0, 0], [.018, 0, 0], [0, .38, .97], color);
  return geometry.geometry();
}

function shrubShape() {
  const flora = new FloraGeometry();
  const random = seeded(5083);
  const shade = new Color('#345c50'), sun = new Color('#91ac6a');
  const leaf = new Color();
  for (let branch = 0; branch < 12; branch++) {
    const turn = branch * 2.40 + random() * .46;
    const dx = Math.cos(turn), dz = Math.sin(turn);
    const reach = .31 + random() * .52;
    const height = .38 + random() * .43;
    flora.stem([[0, 0, 0, .036], [dx * reach * .46, height * .64, dz * reach * .46, .023],
      [dx * reach, height, dz * reach, .006]], shade, 4, 4);
    for (let node = 0; node < 6; node++) {
      const t = .24 + node * .136;
      const bearing = turn + (node % 2 ? 1 : -1) * (.31 + random() * 1.04);
      const side = .76 + random() * .32;
      leaf.copy(shade).lerp(sun, .23 + t * .32 + random() * .40);
      flora.leaf({ at: [dx * reach * t, height * t ** .58, dz * reach * t],
        along: [Math.cos(bearing), .20 + random() * .42, Math.sin(bearing)], bend: [0, -.058, 0],
        length: side * (.28 + random() * .22), width: side * (.087 + random() * .05), color: leaf, rows: 4, solid: false });
    }
  }
  return flora.build('层层小枝与叶片的灌木');
}

function flowerShape(purple: boolean) {
  const flora = new FloraGeometry();
  const stem = new Color('#588956');
  const petal = new Color(purple ? '#ab88de' : '#fff0d5');
  const dark = new Color('#7451a7');
  const bloom = purple ? .43 : .23;
  flora.stem([[0, 0, 0, .008], [.026, bloom * .61, .016, .006], [.014, bloom, .010, .005]], stem, 5, 5);
  for (const [y, turn] of [[.066, .33], [.102, 3.1]]) {
    flora.leaf({ at: [0, y, 0], along: [Math.cos(turn), .58, Math.sin(turn)], bend: [.004, -.029, 0],
      length: .095, width: .023, color: stem, rows: 3, solid: false });
  }
  if (purple) {
    for (let ring = 0; ring < 6; ring++) {
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI * .5 + ring * .57;
        const tint = dark.clone().lerp(petal, .31 + ring * .10);
        flora.leaf({ at: [.017, bloom - .157 + ring * .029, .011], along: [Math.cos(angle), .68, Math.sin(angle)],
          bend: [0, .018, 0], length: .052 - ring * .005, width: .019 - ring * .0017, color: tint, rows: 3, solid: false });
      }
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      flora.leaf({ at: [.014, bloom, .010], along: [Math.cos(angle), .17, Math.sin(angle)], bend: [0, .019, 0],
        length: .068, width: .033, color: petal, rows: 4, solid: false });
    }
    flora.crown([.013, bloom + .014, .01], [.024, .018, .024], new Color('#eac46c'), .32);
  }
  return flora.build(purple ? '紫色花穗' : '奶白小花');
}

function lilyPadShape() {
  const surface = new Surface();
  const center = new Color('#678f67');
  const rim = new Color('#8ea366');
  const petiole = [0, .006, 0] as const;
  const outline = Array.from({ length: 24 }, (_, index) => {
    const turn = .28 + index / 23 * (Math.PI * 2 - .58);
    const radius = (1 + .058 * Math.sin(turn * 5.1) + .021 * Math.sin(turn * 14.6)) * (1 - .10 * Math.cos(turn));
    return [Math.cos(turn) * radius, .007 + .004 * Math.sin(turn * 5.7), Math.sin(turn) * radius] as const;
  });
  for (let i = 1; i < outline.length; i++) {
    const vein = i % 3 === 0 ? .50 : .65 + .16 * Math.sin(i * 1.31);
    surface.triangle(petiole, outline[i], outline[i - 1], center, center.clone().lerp(rim, vein), rim);
  }
  return surface.geometry();
}

function lotus() {
  const leaves = lilyPadShape();
  const pads: Plant[] = [], petals: Plant[] = [];
  const random = seeded(219);
  for (const [u, v, size, flowering] of [
    [-3.56, -1.17, .23, 1], [-3.31, -1.04, .20, 0], [-3.89, -1.09, .21, 0], [-2.89, -1.32, .20, 0],
    [-2.46, -1.34, .20, 1], [-2.17, -1.25, .20, 0], [-.64, -.65, .16, 0], [-.61, -.43, .145, 0],
    [-4.31, 1.34, .20, 1], [-4.06, 1.49, .22, 0], [-3.76, 1.53, .17, 0],
    [.36, 2.58, .17, 0], [.65, 2.71, .21, 1], [.92, 2.59, .17, 0],
  ]) {
    const { x, y: z } = islandPoint(u, v);
    if (!inLake(x, z)) continue;
    pads.push({ x, y: lakeLevel + .021, z, width: size, height: 1, depth: size * .91,
      color: random() > .4 ? '#dce7d0' : '#faf1ce', turn: random() * Math.PI * 2, lean: .033, roll: -.022 });
    if (!flowering) continue;
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 7; i++) {
      const theta = i / 7 * Math.PI * 2 + layer * .448;
      const distance = layer === 0 ? .062 : .04;
      petals.push({ x: x + .056 + Math.sin(theta) * distance, y: lakeLevel + .079 + layer * .02,
        z: z + Math.cos(theta) * distance, width: .041, height: .046, depth: .074 - layer * .018,
        color: layer === 0 ? '#d69eae' : '#efc3ce', turn: theta, lean: -.46 - layer * .2 });
    }
    petals.push({ x: x + .056, y: lakeLevel + .103, z: z + .024, width: .034, height: .032, depth: .034, color: '#edc25f', turn: 0 });
  }
  return [
    batch('荷叶', leaves, new MeshStandardMaterial({ roughness: .93, vertexColors: true, side: DoubleSide }), pads),
    batch('荷花', new IcosahedronGeometry(1, 0), new MeshStandardMaterial({ roughness: .91 }), petals),
  ];
}

const shrubPatches = [
  [-5.39, 2.15, .64], [-4.42, 2.98, .79], [-3.56, 3.31, .69], [-2.24, 3.62, .72], [-.25, 3.55, .46],
  [1.23, 3.83, .57], [2.86, 3.19, .47], [3.70, 3.14, .62], [4.78, 2.63, .68], [5.65, 1.68, .60],
  [5.80, -.07, .72], [5.2, -1.88, .47], [3.97, -3.26, .63], [2.65, -3.16, .51], [1.23, -2.91, .50],
  [-.63, -3.34, .55], [-1.51, -3.30, .50], [-2.03, -2.69, .50], [-3.52, -2.79, .61], [-4.56, -2.58, .60],
  [-5.62, -1.55, .55],
].map(([u, v, size]) => ({ point: islandPoint(u, v), size }));

export function makePlanting() {
  const root = new Group();
  root.name = '草甸、蕨丛与野花';
  const random = seeded(870491), time = { value: 0 };
  const plantsMaterial = new MeshStandardMaterial({ roughness: .97, vertexColors: true, side: DoubleSide });
  const grass = grassShape(false), tallGrass = grassShape(true), grassShader = grassMaterial(time);
  const tiles = new Map<string, { meadow: Plant[]; verge: Plant[] }>();
  const meadowTints = ['#c8d9c7', '#d7e5c5', '#c1d5bf', '#e6e7cb', '#bdd5be'];
  const vergeTints = ['#b0c9bc', '#bdd3bb', '#a5c0b6'];
  const shrubs: Plant[] = [], ferns: Plant[] = [], white: Plant[] = [], purple: Plant[] = [];
  const usable = (x: number, z: number, bank = .10) =>
    onIsland(x, z) && !inLake(x, z) && !occupiedGround(x, z) && shoreDistance(x, z) > bank;

  const west = Math.min(...islandRim.map(p => p.x)), east = Math.max(...islandRim.map(p => p.x));
  const north = Math.min(...islandRim.map(p => p.y)), south = Math.max(...islandRim.map(p => p.y));
  const spacing = .131;
  for (let row = north; row <= south; row += spacing) {
    for (let column = west; column <= east; column += spacing) {
      const x = column + (random() * 1.48 - .24) * spacing, z = row + (random() * 1.48 - .24) * spacing;
      if (!usable(x, z)) continue;
      const path = trailCoverage(x, z);
      const grain = smoothNoise(x * .76, z * .76, 805) * .68 + smoothNoise(x * 1.83, z * 1.83, 478) * .32;
      const verge = 1 - MathUtils.smoothstep(rimDistance(x, z), .20, 1.68);
      let scrub = 0;
      for (const { point, size } of shrubPatches) {
        const dx = x - point.x, dz = z - point.y;
        scrub = Math.max(scrub, 1 - MathUtils.smoothstep(dx * dx + dz * dz, size * .53, size * 2.05));
      }
      const light = Math.exp(-((x - .8) ** 2 * .064 + (z - 1.8) ** 2 * .095));
      const tall = Math.max(verge * .88, scrub) * MathUtils.smoothstep(grain, .24, .73);
      const coverage = (.55 + grain * .42 + light * .08) * (1 - MathUtils.smoothstep(path, .07, .90) * .985);
      if (random() > coverage) continue;
      const long = tall > .30 && random() < tall * .83;
      const breadth = .265 + random() * .121 + (long ? tall * .14 : 0);
      const height = (.123 + random() * .116 + grain * .080 + (long ? .17 + tall * .24 : 0)) * (1 - path * .52);
      const key = Math.floor(x / 4.4) + ',' + Math.floor(z / 4.4);
      let tile = tiles.get(key);
      if (!tile) {
        tile = { meadow: [], verge: [] };
        tiles.set(key, tile);
      }
      const palette = long ? vergeTints : meadowTints;
      const list = long ? tile.verge : tile.meadow;
      list.push({ x, y: groundHeight(x, z) - .023, z, width: breadth, height, depth: breadth * .93,
        turn: random() * Math.PI * 2, color: palette[Math.floor(random() * palette.length)] });
    }
  }
  for (const { meadow, verge } of tiles.values()) {
    if (meadow.length) root.add(batch('细叶草甸', grass, grassShader, meadow));
    if (verge.length) root.add(batch('沿边高草', tallGrass, grassShader, verge));
  }

  for (const { point, size } of shrubPatches) {
    if (!usable(point.x, point.y, .19) || trailCoverage(point.x, point.y) > .29) continue;
    const stretch = size * (.87 + random() * .29);
    shrubs.push({ x: point.x, y: groundHeight(point.x, point.y) - .072, z: point.y,
      width: stretch, height: size * (.76 + random() * .38), depth: stretch * .98, turn: random() * Math.PI * 2 });
    const x = point.x + (random() - .5) * 1.27, z = point.y + (random() - .5) * 1.17;
    if (!usable(x, z, .15) || trailCoverage(x, z) > .37) continue;
    for (let i = 0; i < 7; i++) {
      const spread = size * (.62 + random() * .84);
      ferns.push({ x, y: groundHeight(x, z) - .018, z, width: spread, height: spread * 1.24, depth: spread,
        turn: (i + random() * .5) * Math.PI * 2 / 7, color: meadowTints[random() > .6 ? 0 : 3], lean: -.11 + random() * .21 });
    }
  }

  for (const [u, v, radius, count, kind] of [
    [-4.46, -1.80, .49, 19, 0], [-3.60, -2.18, .45, 9, 1], [-1.77, -2.02, .61, 23, 0], [-.59, -1.97, .62, 15, 1],
    [-4.41, 2.42, .69, 24, 0], [-3.13, 2.45, .55, 11, 1], [-2.58, 3.03, .48, 14, 0], [-1.80, 2.73, .56, 15, 0],
    [-1.36, 2.44, .41, 12, 1], [-.90, 3.52, .53, 18, 0], [.14, 3.53, .48, 9, 1], [.78, 3.21, .40, 15, 0],
    [1.23, 3.41, .33, 10, 1], [1.44, 2.98, .37, 14, 0], [2.54, 2.96, .49, 15, 1], [2.80, 2.74, .53, 25, 0],
    [3.24, 1.97, .54, 12, 0], [3.82, 2.48, .64, 19, 1], [4.52, 2.17, .55, 23, 0], [5.66, 1.06, .50, 16, 1],
    [1.11, -.62, .59, 13, 0], [1.83, -.92, .46, 10, 1], [2.27, -2.70, .56, 15, 0], [4.51, -2.88, .55, 12, 1],
  ]) {
    const center = islandPoint(u, v);
    const flowers = kind ? purple : white;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * radius;
      const x = center.x + Math.cos(angle) * distance, z = center.y + Math.sin(angle) * distance;
      if (!usable(x, z, .14) || trailCoverage(x, z) > .47) continue;
      const size = .66 + random() * .55;
      flowers.push({ x, y: groundHeight(x, z) - .012, z, width: size * .91, height: size, depth: size,
        turn: angle, lean: (random() - .5) * .36 });
    }
  }
  root.add(batch('常绿灌木', shrubShape(), plantsMaterial, shrubs),
    batch('蕨丛', fernShape(), plantsMaterial, ferns),
    batch('成片白色野花', flowerShape(false), plantsMaterial, white),
    batch('成片紫色花穗', flowerShape(true), plantsMaterial, purple), ...lotus());
  return {
    root,
    update(elapsed: number) { time.value = elapsed; },
  };
}
