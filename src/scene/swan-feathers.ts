import {
  Bone, BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, MathUtils, Mesh,
  MeshStandardMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3,
} from 'three';

type Point = [number, number, number];
type Side = -1 | 1;
type Feather = { root: Point; tip: Point; width: number; camber: number; tone: number };
type TuckedFeather = { start: [number, number]; end: [number, number]; width: number; reach?: number };
const ivory = new Color('#f8f5ec');
const shadedIvory = new Color('#c9cdd0');

export function swanSurface(positions: number[], colors: number[], indices: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Overlapping feather vanes share each wing's skin and tucked shape. */
class Plumage {
  positions: number[] = [];
  tucked: number[] = [];
  colors: number[] = [];
  indices: number[] = [];
  private color = new Color();

  vertex(x: number, y: number, z: number, tone: number, resting?: Vector3) {
    this.positions.push(x, y, z);
    if (resting) this.tucked.push(resting.x, resting.y, resting.z);
    this.color.copy(shadedIvory).lerp(ivory, tone);
    this.colors.push(this.color.r, this.color.g, this.color.b);
  }

  feather({ root, tip, width, camber, tone }: Feather, rows: number, tuck?: TuckedFeather) {
    const dx = tip[0] - root[0], dz = tip[2] - root[2];
    const span = Math.hypot(dx, dz), acrossX = dz / span, acrossZ = -dx / span;
    const offset = this.positions.length / 3;
    const parked = new Vector3(), normal = new Vector3(), cross = new Vector3(), forward = new Vector3(), near = new Vector3();
    const front = new Vector3(), top = new Vector3(), back = new Vector3(), under = new Vector3();
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const x = root[0] + dx * t, z = root[2] + dz * t;
      const arch = Math.sin(Math.PI * t);
      const y = MathUtils.lerp(root[1], tip[1], t) + arch * camber;
      const vane = Math.max(.022, Math.sin(Math.PI * (t * .93 + .065)) ** .54) * (.86 + .14 * t);
      const edge = width * vane;
      const tint = tone * (.76 + .24 * t);
      if (tuck) {
        const at = MathUtils.lerp(tuck.start[0], tuck.end[0], t);
        const angle = MathUtils.lerp(tuck.start[1], tuck.end[1], t);
        normal.set(-Math.cos(angle), Math.sin(angle), .07).normalize();
        restSurface(at, angle, parked);
        restSurface(at - .012, angle, near);
        restSurface(at + .012, angle, forward).sub(near).normalize();
        cross.crossVectors(normal, forward).normalize();
        parked.addScaledVector(normal, .004 + arch * .014);
        parked.z += (tuck.reach ?? 0) * t * t;
        const half = tuck.width * vane;
        front.copy(parked).addScaledVector(cross, half).addScaledVector(normal, -half * .12);
        top.copy(parked).addScaledVector(normal, half * .17);
        back.copy(parked).addScaledVector(cross, -half * .86).addScaledVector(normal, -half * .14);
        under.copy(parked).addScaledVector(normal, -half * .21);
      }
      this.vertex(x + acrossX * edge, y - edge * .16, z + acrossZ * edge, tint * .94, tuck ? front : undefined);
      this.vertex(x, y + edge * .13, z, Math.min(1, tint + .19), tuck ? top : undefined);
      this.vertex(x - acrossX * edge * .86, y - edge * .19, z - acrossZ * edge * .86, tint, tuck ? back : undefined);
      this.vertex(x, y - edge * .25, z, tint * .82, tuck ? under : undefined);
      if (row === rows) continue;
      for (let col = 0; col < 4; col++) {
        const a = offset + row * 4 + col, b = offset + row * 4 + (col + 1) % 4;
        this.indices.push(a, b, a + 4, b, b + 4, a + 4);
      }
    }
  }
}

const wingProfile = [
  [0, .020, -.077, .424, .089],
  [.16, .057, -.097, .495, .115],
  [.35, .098, -.054, .489, .093],
  [.57, .115, .015, .503, .065],
  [.76, .121, .096, .455, .052],
  [1.00, .107, .169, .386, .036],
  [1.18, .082, .240, .329, .013],
  [1.244, .070, .280, .286, .004],
] as const;
const midWing = new CatmullRomCurve3(wingProfile.map(([x, y, lead, trail]) => new Vector3(x, y, (lead + trail) * .5)), false, 'catmullrom');
const crossWing = new CatmullRomCurve3(wingProfile.map(([x, , lead, trail, thickness]) => new Vector3(x, (trail - lead) * .5, thickness)), false, 'catmullrom');

// In the resting pose the wing lies lengthwise on the flank, with its feathers swept back.
const restingProfile = [
  [.150, .272, -.352, .014, .009],
  [.207, .308, -.244, .080, .065],
  [.233, .337, -.092, .106, .089],
  [.235, .359, .077, .101, .091],
  [.217, .354, .248, .090, .088],
  [.179, .333, .416, .073, .068],
  [.140, .306, .557, .045, .044],
  [.120, .284, .644, .008, .009],
] as const;
const restSpine = new CatmullRomCurve3(restingProfile.map(([x, y, z]) => new Vector3(x, y, z)), false, 'catmullrom');
const restWidth = new CatmullRomCurve3(restingProfile.map(([, , z, width, height]) => new Vector3(width, height, z)), false, 'catmullrom');
function restSurface(t: number, angle: number, point: Vector3) {
  const at = MathUtils.clamp(t, 0, 1), radius = restWidth.getPoint(at);
  restSpine.getPoint(at, point);
  point.x -= Math.cos(angle) * radius.x;
  point.y += Math.sin(angle) * radius.y;
  return point;
}

function wingHeight(x: number, z: number) {
  const index = wingProfile.findIndex(row => row[0] >= x);
  const i = index < 0 ? wingProfile.length - 1 : Math.max(1, index);
  const left = wingProfile[i - 1][0], right = wingProfile[i][0];
  const at = MathUtils.clamp((x - left) / (right - left), 0, 1);
  const t = (i - 1 + at) / (wingProfile.length - 1);
  const centre = midWing.getPoint(t), radius = crossWing.getPoint(t);
  const chord = MathUtils.clamp((z - centre.z) / radius.y, -1, 1);
  return centre.y + Math.sqrt(1 - chord * chord) * radius.z;
}

function wingVanes(plumage: Plumage) {
  const rings = 28, sides = 16;
  const parked = new Vector3();
  for (let row = 0; row <= rings; row++) {
    const centre = midWing.getPoint(row / rings), shape = crossWing.getPoint(row / rings);
    for (let col = 0; col < sides; col++) {
      const angle = col / sides * Math.PI * 2, face = Math.sin(angle), chord = Math.cos(angle);
      const arch = face >= 0 ? face : face * .58;
      restSurface(row / rings, angle, parked);
      plumage.vertex(centre.x, centre.y + arch * shape.z, centre.z + chord * shape.y, .77 + .21 * face - chord * .027, parked);
      if (row === rings) continue;
      const a = row * sides + col, b = row * sides + (col + 1) % sides;
      plumage.indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }

  // Secondaries overlap along the inner wing; the primaries open into a fan beyond the wrist.
  for (let j = 0; j < 12; j++) {
    const t = j / 11, row = j % 2, distance = Math.floor(j / 2) / 5;
    plumage.feather({
      root: [.031 + t * .57, .104 + t * .047, .265 + t * .020],
      tip: [.083 + t * .70, .053 + t * .049, .600 + Math.sin(t * 2.25) * .152],
      width: .050 + t * .020, camber: .046, tone: .87 + t * .07,
    }, 8, {
      start: [.098 + distance * .51, 2.21 + .53 * row + .12 * distance],
      end: [.357 + distance * .53, 2.49 + .49 * row + .095 * distance],
      width: .047 - .010 * distance,
    });
  }
  for (let j = 0; j < 10; j++) {
    const t = j / 9;
    plumage.feather({
      root: [.585 + t * .585, .106 + .047 * Math.sin(Math.PI * t), .252 + .037 * t],
      tip: [.800 + t * .60, .077 - .036 * t, .776 - .432 * t ** 1.35],
      width: .069 - .021 * t, camber: .042 - .015 * t, tone: .88 + .092 * t,
    }, 9, {
      start: [.444 + .138 * t, 1.01 + t * 1.88],
      end: [.946 + .039 * Math.sin(Math.PI * t), 1.22 + t * 1.64],
      width: .047 - .007 * t, reach: .047 + .042 * (1 - t),
    });
  }
  const coverts = 30;
  for (let j = 0; j < coverts; j++) {
    const row = j % 2, t = Math.floor(j / 2) / (Math.ceil(coverts / 2) - 1);
    const x = .045 + t * 1.12 + .015 * row;
    const near = .087 + t * t * .144 + .112 * row, far = .321 + t * t * .063 + .119 * row;
    const end = x + .042 + t * .042;
    const column = j % 5, band = Math.floor(j / 5) / 5;
    plumage.feather({
      root: [x, wingHeight(x, near) - .009, near],
      tip: [end, wingHeight(end, far) + .011, far],
      width: (.048 - .022 * t) * (row ? 1.12 : .89), camber: .011, tone: .95 - row * .073,
    }, 6, {
      start: [.061 + band * .601 + .024 * (column % 2), .705 + .457 * column + band * .12],
      end: [.256 + band * .629 + .014 * (column % 2), .884 + .469 * column + band * .14],
      width: .036 - .007 * band + .006 * Math.sin(column * .88),
    });
  }
}

export function makeSwanWing(side: Side, material: MeshStandardMaterial) {
  const plumage = new Plumage();
  wingVanes(plumage);
  const source = plumage.positions;
  const geometry = swanSurface(source, plumage.colors, plumage.indices);
  if (side === -1) {
    geometry.scale(-1, 1, 1);
    const faces = geometry.index!;
    for (let i = 0; i < faces.count; i += 3) {
      const b = faces.getX(i + 1);
      faces.setX(i + 1, faces.getX(i + 2));
      faces.setX(i + 2, b);
    }
    geometry.computeVertexNormals();
  }
  const folded = new BufferGeometry();
  const rest = new Float32BufferAttribute(plumage.tucked, 3);
  if (side === -1) {
    for (let i = 0; i < rest.count; i++) rest.setX(i, -rest.getX(i));
  }
  folded.setAttribute('position', rest);
  folded.setIndex(geometry.index);
  folded.computeVertexNormals();
  const foldedPositions = folded.getAttribute('position'), foldedNormals = folded.getAttribute('normal');
  foldedPositions.name = 'Tucked';
  geometry.morphAttributes.position = [foldedPositions];
  geometry.morphAttributes.normal = [foldedNormals];
  folded.dispose();
  geometry.translate(.163 * side, .257, -.270);
  // Geometry transforms do not affect morph attributes in Three.
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const skin = new Uint16Array(source.length / 3 * 4), weights = new Float32Array(skin.length);
  for (let i = 0; i * 3 < source.length; i++) {
    const wristWeight = MathUtils.smoothstep(source[i * 3], .452, .697);
    skin[i * 4 + 1] = 1;
    weights[i * 4] = 1 - wristWeight;
    weights[i * 4 + 1] = wristWeight;
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skin, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  const label = side === -1 ? 'L' : 'R';
  const mesh = new SkinnedMesh(geometry, material);
  mesh.name = 'SwanWing_' + label;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  const shoulder = new Bone(), wrist = new Bone();
  shoulder.name = 'SwanShoulder_' + label;
  shoulder.position.set(.163 * side, .257, -.270);
  wrist.name = 'SwanWrist_' + label;
  wrist.position.set(.574 * side, .105, .028);
  shoulder.add(wrist);
  mesh.add(shoulder);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([shoulder, wrist]));
  mesh.morphTargetInfluences![0] = 1;
  return { mesh, shoulder, wrist, side };
}

export function makeSwanTail(material: MeshStandardMaterial) {
  const plume = new Plumage();
  for (let i = -4; i <= 4; i++) {
    const outside = Math.abs(i) / 4;
    plume.feather({
      root: [i * .032, .270 - outside * .035, .451 - outside * .055],
      tip: [i * .057, .314 - outside * .052, .755 - outside * .128],
      width: .050, camber: .029, tone: .94 - outside * .10,
    }, 6);
  }
  const mesh = new Mesh(swanSurface(plume.positions, plume.colors, plume.indices), material);
  mesh.name = 'SwanTail';
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
