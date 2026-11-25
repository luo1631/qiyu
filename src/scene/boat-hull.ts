import {
  CatmullRomCurve3, Color, CylinderGeometry, Group, InstancedMesh, MathUtils, Matrix4, MeshStandardMaterial,
  SphereGeometry, Vector3,
} from 'three';
import { batchBoatParts, boatBlock, boatCurve, boatForm, boatPart, boatSurface, boatTimber } from './boat-shapes';
import type { Point3 } from './boat-shapes';

const stations = [
  [-1.672, .014, .723], [-1.552, .202, .665], [-1.356, .384, .594], [-1.091, .540, .558],
  [-.711, .680, .545], [-.282, .758, .537], [.154, .773, .537], [.578, .744, .553],
  [.981, .657, .592], [1.312, .518, .627], [1.548, .359, .678], [1.610, .314, .687],
] as const;
const sheer = new CatmullRomCurve3(stations.map(([z, beam, y]) => new Vector3(beam, y, z)), false, 'centripetal');

function section(t: number, height: number, side: number, thickness = 0) {
  const rail = sheer.getPoint(t);
  const bowLift = 1 - MathUtils.smoothstep(t, 0, .40);
  const sternLift = MathUtils.smoothstep(t, .78, 1);
  const bottom = -.101 + .314 * bowLift + .125 * sternLift;
  const keel = Math.min(rail.x, .048 + .122 * sternLift);
  const spread = Math.pow(Math.sin(height * Math.PI * .5), .78);
  const x = Math.max(.003, MathUtils.lerp(keel, rail.x, spread) - thickness * spread);
  const y = MathUtils.lerp(bottom + thickness * .64, rail.y - thickness * .25, height ** .94);
  const z = rail.z + (.208 * bowLift - .044 * sternLift) * (1 - height) ** 1.75;
  return new Vector3(x * side, y, z);
}

const deckTop = .217;
export const forwardBench = { z: -1.057, y: .430 };
const plankPigments = ['#516d64', '#62837d', '#77968c', '#8da99e', '#a1b6aa'].map(hex => new Color(hex));
const innerPigments = ['#75543d', '#967251', '#9c7452', '#b28a62', '#be9368'].map(hex => new Color(hex));
const strakeSections = [0, .223, .435, .637, .828, 1];
const crossSections = [0, .025, .12, .52, .88, .973, 1];

function makePlanks(interior: boolean) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], faces: number[] = [];
  const lengths = 67, rowWidth = crossSections.length, stain = new Color();
  for (const side of [-1, 1]) {
    for (let band = 0; band < strakeSections.length - 1; band++) {
      const start = positions.length / 3;
      for (let row = 0; row < lengths; row++) {
        const t = row / (lengths - 1);
        for (let column = 0; column < rowWidth; column++) {
          const v = crossSections[column];
          const h = MathUtils.lerp(strakeSections[band], strakeSections[band + 1], v);
          const p = section(t, h, side, interior ? .035 : 0);
          // The lap is a shallow step. The boards contact at the root of it.
          const lip = Math.sin(Math.PI * v) ** .52 * (1 - .48 * v);
          p.x += side * .010 * lip * MathUtils.smoothstep(t, 0, .09) * (interior ? -1 : 1);
          positions.push(p.x, p.y, p.z);
          uv.push(t * 1.16, (band + v) / 5);
          const edge = .79 + .21 * MathUtils.smoothstep(v, 0, .16) - .18 * MathUtils.smoothstep(v, .949, 1);
          stain.copy((interior ? innerPigments : plankPigments)[band])
            .multiplyScalar(edge * (.93 + .08 * Math.sin(t * 4.7 + band * 1.7 + side * .25)));
          colors.push(stain.r, stain.g, stain.b);
          if (row === lengths - 1 || column === rowWidth - 1) continue;
          const a = start + row * rowWidth + column, b = a + rowWidth;
          if ((side > 0) !== interior) faces.push(a, a + 1, b, b, a + 1, b + 1);
          else faces.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
  }
  return boatSurface(positions, faces, uv, colors);
}

function closeHull(end: 'bow' | 'stern' | 'keel', interior: boolean) {
  const positions: number[] = [], uv: number[] = [], faces: number[] = [];
  const thickness = interior ? .036 : 0;
  for (let row = 0; row <= 48; row++) {
    const v = row / 48, t = end === 'keel' ? v : end === 'bow' ? 0 : 1;
    const p = section(t, end === 'keel' ? 0 : v, 1, thickness);
    const z = interior ? p.z + (end === 'bow' ? .018 : end === 'stern' ? -.021 : 0) : p.z;
    positions.push(-p.x, p.y, z, p.x, p.y, z);
    uv.push(v, 0, v, 1);
    if (row === 48) continue;
    const a = row * 2;
    if ((end === 'stern' || end === 'keel') !== interior) faces.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else faces.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return boatSurface(positions, faces, uv);
}

function makeTransom() {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], faces: number[] = [];
  const columns = 13, tint = new Color();
  for (let band = 0; band < strakeSections.length - 1; band++) {
    const start = positions.length / 3;
    for (let row = 0; row < crossSections.length; row++) {
      const v = crossSections[row], height = MathUtils.lerp(strakeSections[band], strakeSections[band + 1], v);
      const end = section(1, height, 1);
      for (let col = 0; col < columns; col++) {
        const u = col / (columns - 1), span = u * 2 - 1;
        const rounding = (1 - span ** 4) * (.018 + .006 * Math.sin(Math.PI * v));
        positions.push(span * end.x, end.y, end.z + rounding);
        uv.push(u, height);
        tint.copy(plankPigments[band]).multiplyScalar(.76 + .21 * MathUtils.smoothstep(v, .03, .30)
          - .14 * MathUtils.smoothstep(v, .940, 1) + .04 * Math.sin(u * 4 + band * 1.5));
        colors.push(tint.r, tint.g, tint.b);
        if (row === crossSections.length - 1 || col === columns - 1) continue;
        const a = start + row * columns + col, b = a + columns;
        faces.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  return boatSurface(positions, faces, uv, colors);
}

function narrowHullAt(z: number, y: number) {
  let start = 0, end = 1, p = new Vector3();
  for (let i = 0; i < 13; i++) {
    const t = (start + end) / 2;
    const bottom = section(t, 0, 1, .034).y, top = section(t, 1, 1, .034).y;
    const height = MathUtils.clamp(MathUtils.inverseLerp(bottom, top, y), 0, 1) ** (1 / .94);
    p = section(t, height, 1, .034);
    if (p.z < z) start = t;
    else end = t;
  }
  return Math.max(.004, p.x - .011);
}

function fitDeck(root: Group, wood: MeshStandardMaterial, trim: MeshStandardMaterial) {
  const underside = deckTop - .049;
  for (let i = -2; i <= 2; i++) {
    const center = i * .177;
    const ends = [1.298 - .092 * i * i, 1.437 - .097 * i * i];
    const positions: number[] = [], uv: number[] = [], faces: number[] = [];
    for (let row = 0; row <= 35; row++) {
      const t = row / 35, z = MathUtils.lerp(-ends[0], ends[1], t);
      const beam = narrowHullAt(z, underside) - .008;
      const left = MathUtils.clamp(center - .086, -beam, beam), right = MathUtils.clamp(center + .086, -beam, beam);
      positions.push(left, deckTop, z, right, deckTop, z, right, underside, z, left, underside, z);
      uv.push(t, .10, t, .94, t, .73, t, .31);
      if (row === 35) continue;
      for (let side = 0; side < 4; side++) {
        const a = row * 4 + side, b = row * 4 + (side + 1) % 4;
        faces.push(a, a + 4, b, b, a + 4, b + 4);
      }
    }
    boatPart(root, 'Floorboard', boatSurface(positions, faces, uv), i % 2 === 0 ? wood : trim);
  }
  const seats = [{ ...forwardBench, seat: .229 }, { z: -.205, y: .386, seat: .205 }, { z: .960, y: .434, seat: .237 }];
  for (const { z, y, seat } of seats) {
    const width = 2 * Math.min(narrowHullAt(z - seat * .5, y - .051), narrowHullAt(z + seat * .5, y - .051));
    boatBlock(root, 'Thwart', [0, y - .025, z], [width + .011, .050, seat], .012, wood);
    for (const side of [-1, 1]) boatBlock(root, 'Seat bracket', [side * (width * .5 - .079), y - .075, z],
      [.076, .083, seat * .89], .011, trim);
  }
  for (const t of [.19, .309, .428, .567, .717, .856]) {
    for (const side of [-1, 1]) {
      const parts = Array.from({ length: 8 }, (_, i) => {
        const p = section(t, .23 + .75 * i / 7, side, .075);
        return [p.x, p.y, p.z, .022, .021] as const;
      });
      boatPart(root, 'Steam-bent rib', boatForm(parts, 15, 8, [0, 0, 1]), trim);
    }
  }
}

function fastenPlanks(root: Group, brass: MeshStandardMaterial) {
  const rows = [0.132, .244, .360, .470, .599, .727, .855, .951];
  const pegs = new InstancedMesh(new SphereGeometry(1, 7, 5), brass, rows.length * 8);
  pegs.name = 'Copper plank rivets';
  pegs.castShadow = pegs.receiveShadow = true;
  const transform = new Matrix4(), normal = new Vector3(), axis = new Vector3(0, 0, 1);
  let index = 0;
  for (const t of rows) for (const side of [-1, 1]) for (const h of [.31, .53, .739, .929]) {
    const p = section(t, h, side);
    const tangent = section(t + .001, h, side).sub(p);
    normal.crossVectors(section(t, h + .001, side).sub(p), tangent).normalize().multiplyScalar(side);
    const up = new Vector3().crossVectors(normal, axis).normalize();
    const across = new Vector3().crossVectors(up, normal).normalize();
    transform.makeBasis(normal.multiplyScalar(.0036), up.multiplyScalar(.0057), across.multiplyScalar(.0057));
    transform.setPosition(p.addScaledVector(normal, 2.3));
    pegs.setMatrixAt(index++, transform);
  }
  pegs.computeBoundingSphere();
  root.add(pegs);
}

function makeOar(root: Group, ash: MeshStandardMaterial, bronze: MeshStandardMaterial) {
  boatPart(root, 'Oar shaft', boatForm([
    [-.368, .705, .023, .023, .023], [-.432, .694, .016, .021, .023], [-.761, .544, -.116, .018, .018],
    [-1.028, .387, -.244, .018, .018], [-1.122, .335, -.287, .016, .015],
  ], 30, 14, [0, .23, 1]), ash);
  boatPart(root, 'Oar blade', boatForm([
    [-1.065, .364, -.261, .016, .017], [-1.118, .328, -.289, .030, .021], [-1.205, .272, -.325, .080, .014],
    [-1.324, .215, -.366, .128, .012], [-1.400, .193, -.397, .113, .010], [-1.469, .215, -.423, .054, .008],
    [-1.483, .220, -.427, .007, .004],
  ], 28, 20, [0, .46, 1]), ash);
  const ironLoop = boatCurve(root, 'Rowlock', [[-.750, .545, -.146], [-.767, .591, -.150],
    [-.793, .594, -.124], [-.793, .567, -.089], [-.772, .539, -.084]], .012, bronze, 16);
  ironLoop.rotation.y = -.010;
}

function makeLantern(root: Group, iron: MeshStandardMaterial, brass: MeshStandardMaterial) {
  const lamp = new Group();
  lamp.name = 'Bow lantern';
  lamp.userData.pondBoatLantern = true;
  lamp.position.set(-.442, .412, -1.408);
  root.add(lamp);
  const glassMaterial = new MeshStandardMaterial({ color: '#edc58a', emissive: '#ed873d', emissiveIntensity: .4, roughness: .57 });
  const fireMaterial = new MeshStandardMaterial({ color: '#fff0b7', emissive: '#ff9f54', emissiveIntensity: .4, roughness: .6 });
  function turn(name: string, y: number, top: number, bottom: number, height: number, material: MeshStandardMaterial, sides = 16) {
    const mesh = boatPart(lamp, name, new CylinderGeometry(top, bottom, height, sides), material);
    mesh.position.y = y;
    return mesh;
  }
  const glass = turn('Amber lantern glass', -.002, .059, .064, .168, glassMaterial, 7);
  const flame = boatPart(lamp, 'Lantern wick', boatForm([
    [0, -.047, 0, .012, .011], [.004, -.029, 0, .016, .014], [.006, .001, -.003, .009, .008],
    [.009, .034, -.008, .0015, .0015],
  ], 12, 10, [1, 0, 0]), fireMaterial);
  flame.castShadow = glass.castShadow = false;
  turn('Lantern iron foot', -.105, .080, .075, .043, iron);
  turn('Lantern lower collar', -.080, .070, .071, .012, brass);
  turn('Lantern upper collar', .083, .078, .075, .017, brass);
  turn('Lantern cap', .104, .038, .078, .039, iron);
  turn('Lantern vent', .129, .028, .035, .022, iron);
  for (let i = 0; i < 7; i++) {
    const a = i * 2 * Math.PI / 7, b = a + 2 * Math.PI / 7;
    boatCurve(lamp, 'Cage post', [[.069 * Math.cos(a), -.084, .069 * Math.sin(a)],
      [.064 * Math.cos(a), .084, .064 * Math.sin(a)]], .0058, iron, 2);
    boatCurve(lamp, 'Cage diagonal', [[.069 * Math.cos(a), -.082, .069 * Math.sin(a)],
      [.063 * Math.cos((a + b) / 2), .002, .063 * Math.sin((a + b) / 2)],
      [.064 * Math.cos(b), .084, .064 * Math.sin(b)]], .0038, iron, 5);
  }
  boatCurve(root, 'Lantern hanger', [[-.438, .544, -1.411], [-.440, .663, -1.397], [-.395, .756, -1.408],
    [-.250, .785, -1.451], [-.117, .696, -1.489]], .011, iron, 26);
  batchBoatParts(lamp);
  return { position: lamp.position.clone(), flame: fireMaterial, glass: glassMaterial };
}

function stowGear(root: Group, ash: MeshStandardMaterial, oak: MeshStandardMaterial, bronze: MeshStandardMaterial) {
  const cord = new MeshStandardMaterial({ color: '#be9463', roughness: .93 });
  const cordShadow = new MeshStandardMaterial({ color: '#947553', roughness: .93 });
  const coil = Array.from({ length: 77 }, (_, i) => {
    const t = i / 76, a = t * Math.PI * 8.4, r = .020 + .107 * t;
    return [.414 + Math.cos(a) * r, .426 - .027 * t, -.169 + Math.sin(a) * r] as const;
  });
  boatCurve(root, 'Hemp coil', [...coil, [.599, .447, -.262], [.680, .531, -.309], [.756, .554, -.378]], .013, cord, 104);
  for (const z of [-.388, -.422, -.456]) {
    const t = Math.PI * .5;
    boatCurve(root, 'Hemp around gunwale', Array.from({ length: 13 }, (_, i) => {
      const a = i / 12 * Math.PI * 2 + t;
      return [.737 + .056 * Math.cos(a), .533 + .045 * Math.sin(a), z + i * .0014] as const;
    }), .012, z === -.422 ? cordShadow : cord, 15);
  }
  boatBlock(root, 'Bow bitt', [-.085, .573, -1.490], [.072, .263, .075], .011, oak).rotation.z = -.14;
  boatCurve(root, 'Painter tied to the bitt', [[-.200, .615, -1.483], [-.185, .640, -1.562], [-.122, .626, -1.546],
    [-.098, .623, -1.474], [-.166, .615, -1.460], [-.199, .592, -1.518], [-.130, .579, -1.555],
    [-.081, .589, -1.504], [-.076, .510, -1.501]].map(([x, y, z]) => [x + .054, y, z + .021]), .012, cord, 40);

  const paper = new MeshStandardMaterial({ color: '#e0bf91', roughness: .98 });
  const cover = new MeshStandardMaterial({ color: '#965742', roughness: .83 });
  const second = new MeshStandardMaterial({ color: '#5e7466', roughness: .83 });
  const books = new Group();
  books.position.set(.237, .238, 1.240);
  books.rotation.y = -.17;
  root.add(books);
  for (const layer of [0, 1]) {
    const y = layer * .041, mat = layer ? cover : second;
    boatBlock(books, 'Book pages', [0, y, 0], [.190, .029, .231], .005, paper);
    for (const side of [-1, 1]) boatBlock(books, 'Book cover', [-.006, y + side * .019, 0], [.207, .009, .246], .004, mat);
    boatBlock(books, 'Leather spine', [-.105, y, 0], [.014, .044, .241], .006, mat);
  }
  boatBlock(books, 'Ribbon bookmark', [.044, .038, .125], [.023, .0035, .064], .001, cover).rotation.x = .24;
  batchBoatParts(books);

  const box = new Group();
  box.position.set(-.167, .676, 1.562);
  root.add(box);
  boatBlock(box, 'Cedar planter', [0, .042, 0], [.140, .079, .103], .008, ash);
  boatBlock(box, 'Planter lip', [0, .082, 0], [.148, .016, .110], .003, oak);
  const earth = new MeshStandardMaterial({ color: '#533c31', roughness: 1 });
  boatBlock(box, 'Planter earth', [0, .088, 0], [.126, .008, .086], .004, earth);
  const sprout = new MeshStandardMaterial({ color: '#8fa061', roughness: .83 });
  const sproutShade = new MeshStandardMaterial({ color: '#657d51', roughness: .79 });
  boatCurve(box, 'Sprout stem', [[0, .092, 0], [-.014, .155, -.011], [.007, .220, -.024], [.019, .245, -.037]], .0037, sproutShade, 12);
  for (const [side, y, z] of [[1, .154, -.014], [-1, .190, -.018], [1, .226, -.032]]) {
    const parts = [[0, y, z, .002, .002], [side * .035, y + .014, z - .016, .020, .005],
      [side * .061, y + .028, z - .029, .012, .004], [side * .082, y + .035, z - .045, .001, .001]] as const;
    boatPart(box, 'Sprout leaf', boatForm(parts, 12, 10, [0, 0, 1]), side > 0 ? sprout : sproutShade);
  }
  boatBlock(root, 'Aft lifting eye', [.069, .699, 1.566], [.065, .024, .042], .011, bronze);
}

export function makeBoatHull() {
  const root = new Group();
  root.name = 'Lapstrake skiff';
  const painted = boatTimber('#ffffff', true, true), plank = boatTimber('#ffffff', false, true);
  const oak = boatTimber('#9d724e'), ash = boatTimber('#b2865c'), deck = boatTimber('#99704e');
  const dark = boatTimber('#644a36'), paintedStem = boatTimber('#496d61', true);
  const bronze = new MeshStandardMaterial({ color: '#695744', roughness: .50, metalness: .46 });
  const brass = new MeshStandardMaterial({ color: '#b08f5c', roughness: .51, metalness: .29 });
  const iron = new MeshStandardMaterial({ color: '#303e3a', roughness: .64, metalness: .38 });

  boatPart(root, 'Painted lapstrake planks', makePlanks(false), painted);
  boatPart(root, 'Interior planks', makePlanks(true), plank);
  boatPart(root, 'Planked transom', makeTransom(), painted);
  for (const end of ['bow', 'stern', 'keel'] as const) {
    if (end !== 'stern') boatPart(root, 'Closed stem', closeHull(end, false), paintedStem);
    boatPart(root, 'Interior end grain', closeHull(end, true), oak);
  }
  for (const side of [-1, 1]) {
    const rail = Array.from({ length: 29 }, (_, i) => {
      const t = i / 28, p = section(t, 1, side);
      return [p.x - side * .010, p.y + .010, p.z, .030, .047] as const;
    });
    boatPart(root, 'Rounded ash gunwale', boatForm(rail, 66, 14, [0, 1, 0]), ash);
    const rubRail = Array.from({ length: 28 }, (_, i) => {
      const p = section(i / 27, .919, side);
      return [p.x + side * .009, p.y + .007, p.z, .007, .013] as const;
    });
    boatPart(root, 'Rub rail', boatForm(rubRail, 56, 10, [0, 1, 0]), oak);
  }
  const stern = section(1, 1, 1);
  boatBlock(root, 'Aft cap rail', [0, stern.y + .01, stern.z - .017], [stern.x * 2 + .040, .055, .088], .018, ash);
  boatBlock(root, 'Bow rail join', [0, .721, -1.653], [.080, .052, .083], .017, oak);
  const stem: Point3[] = [[0, .164, -1.454], [0, .325, -1.556], [0, .526, -1.632], [0, .723, -1.667]];
  boatPart(root, 'Ash stem', boatForm(stem.map(([x, y, z]) => [x, y, z, .036, .026]), 22, 10, [1, 0, 0]), oak);
  fitDeck(root, deck, dark);
  fastenPlanks(root, bronze);
  makeOar(root, ash, bronze);
  stowGear(root, ash, oak, brass);
  const lantern = makeLantern(root, iron, brass);
  batchBoatParts(root);
  return { root, lantern };
}
