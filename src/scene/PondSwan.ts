import {
  Bone, CatmullRomCurve3, Color, Float32BufferAttribute, Group, MathUtils, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, ShapeUtils, Skeleton, SkinnedMesh, SphereGeometry, Uint16BufferAttribute, Vector2, Vector3,
} from 'three';
import { disposeSculpture } from './PondCreatures';
import { lifeScale } from './shore-layout';
import { makeSwanTail, makeSwanWing, swanSurface } from './swan-feathers';
import { turtlePaddle } from './locomotion';
import type { SwanLife } from './wildlife-life';

type Section = readonly [y: number, z: number, breadth: number, depth: number];
const trunk: readonly Section[] = [
  [.216, .745, .006, .006], [.200, .688, .097, .051], [.182, .576, .196, .103],
  [.160, .421, .274, .170], [.153, .217, .325, .217], [.154, -.011, .323, .226],
  [.170, -.212, .284, .215], [.224, -.370, .206, .170],
  [.305, -.464, .135, .123], [.411, -.497, .094, .096],
  [.550, -.476, .075, .079], [.698, -.419, .062, .067], [.821, -.408, .056, .059],
  [.925, -.448, .059, .061], [.995, -.509, .074, .071], [1.014, -.577, .079, .073],
  [.991, -.643, .071, .057], [.968, -.699, .055, .040], [.964, -.734, .030, .018],
  [.963, -.745, .006, .008],
];
const bill: readonly Section[] = [
  [.965, -.691, .042, .026], [.957, -.733, .059, .034], [.945, -.789, .053, .026],
  [.930, -.845, .043, .019], [.920, -.892, .028, .013], [.920, -.914, .008, .006],
];
const flightHeadShift = new Vector3(0, -.636, -.709);
const flightTrunk: readonly Section[] = [
  ...trunk.slice(0, 7),
  [.213, -.377, .194, .158],
  [.269, -.492, .125, .108],
  [.310, -.610, .088, .081],
  [.334, -.740, .075, .070],
  [.344, -.869, .062, .061],
  [.348, -1.003, .055, .053],
  [.352, -1.112, .056, .055],
  ...trunk.slice(14).map(([y, z, breadth, depth]) =>
    [y + flightHeadShift.y, z + flightHeadShift.z, breadth, depth] as const),
];
const milk = new Color('#f8f5eb'), down = new Color('#d3d6d3');
const orange = new Color('#d88a48'), umber = new Color('#804c30');
const softGrey = new Color('#4e5659'), darkGrey = new Color('#303539');
const sideAxis = new Vector3(1, 0, 0);

function loft(
  sections: readonly Section[], rows: number, sides: number,
  pigment: (face: number, t: number) => Color,
) {
  const path = new CatmullRomCurve3(sections.map(([y, z]) => new Vector3(0, y, z)), false, 'centripetal');
  const widths = new CatmullRomCurve3(sections.map(([, , x, y], i) => new Vector3(x, y, i)), false, 'catmullrom');
  const positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const tangent = new Vector3(), normal = new Vector3(), point = new Vector3();
  for (let row = 0; row <= rows; row++) {
    const progress = row / rows, center = path.getPoint(progress), radius = widths.getPoint(progress);
    normal.crossVectors(sideAxis, path.getTangent(progress, tangent)).normalize();
    for (let col = 0; col < sides; col++) {
      const angle = Math.PI * 2 * col / sides, top = Math.sin(angle);
      const depth = radius.y * (top < 0 ? .96 : 1);
      point.copy(center).addScaledVector(sideAxis, Math.max(.002, radius.x) * Math.cos(angle))
        .addScaledVector(normal, Math.max(.002, depth) * top);
      positions.push(point.x, point.y, point.z);
      const shade = pigment(top, progress);
      colors.push(shade.r, shade.g, shade.b);
      if (row === rows) continue;
      const a = row * sides + col, b = row * sides + (col + 1) % sides;
      faces.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  for (let col = 1; col < sides - 1; col++) {
    faces.push(0, col, col + 1);
    faces.push(rows * sides, rows * sides + col + 1, rows * sides + col);
  }
  return swanSurface(positions, colors, faces);
}

function plumageMaterial() {
  const material = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .82 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 birdSkin;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nbirdSkin = position;',
    );
    shader.fragmentShader = 'varying vec3 birdSkin;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float billRoot = .690 + .019 * smoothstep(.970,1.015,birdSkin.y);
      float basal = smoothstep(billRoot - .009,billRoot + .017,-birdSkin.z) * (1. - smoothstep(1.003,1.018,birdSkin.y));
      vec2 cheek = (birdSkin.zy - vec2(-.677, 1.012)) / vec2(.076, .027);
      cheek.y += .34 * cheek.x;
      float eyeLine = (1. - smoothstep(.65,1.05,length(cheek))) * smoothstep(.046,.068,abs(birdSkin.x));
      float ebony = max(basal,eyeLine) * smoothstep(.904,.947,birdSkin.y);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.023,.027,.025),ebony);
    `);
  };
  material.customProgramCacheKey = () => 'native-swan-pigment';
  return material;
}

const neckBase = new Vector3(0, .319, -.453), throat = new Vector3(0, .636, -.445);
const skull = new Vector3(0, .985, -.539);
function makeSwanBody() {
  const rows = 84, sides = 28, tint = new Color();
  const meshShape = loft(trunk, rows, sides,
    (top, t) => tint.copy(down).lerp(milk, .70 + .23 * top + .065 * MathUtils.smoothstep(t, .38, .84)));
  // A flying swan lengthens its neck. The continuous skin can follow that curve through the transition.
  const reached = loft(flightTrunk, rows, sides, () => milk);
  const reachedPositions = reached.getAttribute('position');
  reachedPositions.name = 'FlightReach';
  meshShape.morphAttributes.position = [reachedPositions];
  meshShape.morphAttributes.normal = [reached.getAttribute('normal')];
  reached.dispose();
  const index = new Uint16Array((rows + 1) * sides * 4), weight = new Float32Array(index.length);
  for (let row = 0; row <= rows; row++) {
    // Use the length of the spine to assign weights across a ring, including its underside.
    const t = row / rows;
    const lower = MathUtils.smoothstep(t, .348, .503);
    const upper = MathUtils.smoothstep(t, .493, .671);
    const head = MathUtils.smoothstep(t, .682, .814);
    const arch = lower * upper, headWeight = arch * head;
    for (let col = 0; col < sides; col++) {
      const i = (row * sides + col) * 4;
      index.set([0, 1, 2, 3], i);
      weight.set([1 - lower, lower - arch, arch - headWeight, headWeight], i);
    }
  }
  meshShape.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4));
  meshShape.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4));
  const breast = new Bone(), lower = new Bone(), upper = new Bone(), head = new Bone();
  breast.name = 'SwanBreast';
  lower.name = 'SwanNeckBase';
  upper.name = 'SwanNeckArc';
  head.name = 'SwanHead';
  lower.position.copy(neckBase);
  upper.position.copy(throat).sub(neckBase);
  head.position.copy(skull).sub(throat);
  breast.add(lower);
  lower.add(upper);
  upper.add(head);
  const mesh = new SkinnedMesh(meshShape, plumageMaterial());
  mesh.name = 'SwanContinuousBody';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.add(breast);
  mesh.updateMatrixWorld(true);
  mesh.bind(new Skeleton([breast, lower, upper, head]));
  return { mesh, lower, upper, head };
}

function makeFace(head: Bone) {
  const mount = new Group();
  const face = new Group();
  face.position.copy(skull).negate();
  mount.add(face);
  head.add(mount);
  const tint = new Color(), billShape = loft(bill, 21, 18, (top, t) => {
    const crease = Math.exp(-Math.pow((top + .08) / .14, 2)) * .53;
    return tint.copy(umber).lerp(orange, .81 + .15 * top - crease - .28 * MathUtils.smoothstep(t, .86, 1));
  });
  const billMesh = new Mesh(billShape, new MeshStandardMaterial({ vertexColors: true, roughness: .57 }));
  billMesh.name = 'SwanBill';
  billMesh.castShadow = billMesh.receiveShadow = true;
  face.add(billMesh);

  const onyx = new MeshStandardMaterial({ color: '#1a1b18', roughness: .24 });
  const rim = new MeshStandardMaterial({ color: '#45463a', roughness: .65 });
  const sheen = new MeshBasicMaterial({ color: '#c9d4d2' });
  const sclera = new SphereGeometry(1, 12, 8), pearl = new SphereGeometry(1, 7, 5);
  const eyes: Group[] = [];
  for (const side of [-1, 1]) {
    const eye = new Group();
    eye.position.set(side * .068, 1.017, -.642);
    const edge = new Mesh(sclera, rim);
    edge.scale.set(.0080, .0112, .0138);
    const pupil = new Mesh(sclera, onyx);
    pupil.position.x = .003 * side;
    pupil.scale.set(.0071, .0092, .0101);
    const catchlight = new Mesh(pearl, sheen);
    catchlight.position.set(.0092 * side, .0034, -.004);
    catchlight.scale.set(.0017, .0020, .0020);
    eye.add(edge, pupil, catchlight);
    eyes.push(eye);

    const nostril = new Mesh(pearl, rim);
    nostril.position.set(side * .0375, .965, -.794);
    nostril.scale.set(.0037, .0028, .0087);
    nostril.rotation.z = side * .49;
    face.add(eye, nostril);
  }
  return { mount, eyes };
}

function makeFoot(side: number, material: MeshStandardMaterial) {
  const hip = new Group();
  hip.name = side < 0 ? 'SwanFoot_L' : 'SwanFoot_R';
  hip.position.set(side * .111, -.007, .145);
  const ankle = new Group();
  ankle.position.set(0, -.144, .052);
  const tint = new Color();
  const shank = new Mesh(loft([
    [.017, -.005, .036, .035], [-.022, .002, .030, .031], [-.073, .027, .018, .019],
    [-.121, .049, .013, .014], [-.142, .052, .019, .016], [-.153, .052, .014, .007],
  ], 12, 12, top => tint.copy(darkGrey).lerp(softGrey, .54 + .24 * top)), material);
  // The web begins within the heel so it stays attached when the ankle bends.
  const outline = [
    [-.011, -.012], [-.033, .027], [-.059, .068], [-.058, .086],
    [-.027, .081], [-.005, .116], [.009, .127], [.021, .092],
    [.044, .101], [.056, .093], [.038, .061], [.018, .017], [.011, -.012],
  ] as const;
  const top: number[] = [], colors: number[] = [], indices: number[] = [];
  const points = outline.map(([x, z]) => new Vector2(x, z));
  for (const y of [.007, -.008]) {
    for (const [x, z] of outline) {
      top.push(x, y - .067 * z, z);
      const shade = y > 0 ? softGrey : darkGrey;
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  const size = outline.length;
  for (const [a, b, c] of ShapeUtils.triangulateShape(points, [])) indices.push(c, b, a, a + size, b + size, c + size);
  for (let a = 0; a < size; a++) {
    const b = (a + 1) % size;
    indices.push(a, b, a + size, b, b + size, a + size);
  }
  const web = new Mesh(swanSurface(top, colors, indices), material);
  web.name = 'SwanWeb';
  web.castShadow = web.receiveShadow = shank.castShadow = shank.receiveShadow = true;
  ankle.add(web);
  hip.add(shank, ankle);
  return { hip, ankle, web };
}

export function makePondSwan() {
  const root = new Group();
  root.name = 'swan';
  root.userData.pondBodyId = 'swan';
  root.scale.setScalar(lifeScale);

  const plumage = new MeshStandardMaterial({ vertexColors: true, roughness: .77 });
  const body = makeSwanBody(), face = makeFace(body.head);
  const wings = ([-1, 1] as const).map(side => makeSwanWing(side, plumage));
  const footMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: .73 });
  const feet = [-1, 1].map(side => makeFoot(side, footMaterial));
  const touch = new Mesh(new SphereGeometry(1, 10, 6), new MeshBasicMaterial({ visible: false }));
  touch.name = 'SwanTouchBody';
  touch.scale.set(.36, .33, .70);
  touch.position.set(0, .214, .071);
  root.add(body.mesh, ...wings.map(wing => wing.mesh), makeSwanTail(plumage), ...feet.map(foot => foot.hip), touch);

  return { root, wings: wings.map(wing => wing.mesh),
    pose(pose: SwanLife['pose'], time: number, headTurn: number, attention: number) {
      const reach = pose.reach;
      const swimming = pose.mode === 'glide' || pose.mode === 'rest' || pose.mode === 'turn';
      const turn = pose.swimTurn ?? 0, afloat = MathUtils.clamp(1 - (pose.y - pose.waterHeight) / .19, 0, 1);
      const breath = swimming ? Math.sin(time * 1.16) * .026 : 0;
      body.mesh.morphTargetInfluences![0] = reach;
      face.mount.position.copy(flightHeadShift).multiplyScalar(reach);
      body.lower.rotation.set(-attention * .065 + breath, headTurn * .19, -headTurn * .16, 'YXZ');
      body.upper.rotation.set(-breath * .67, headTurn * .36, -headTurn * .04, 'YXZ');
      body.head.rotation.set(attention * .09 + breath * .35, headTurn * .47, headTurn * .10, 'YXZ');
      const blinking = ((time + 1.2) % 7.1) / .125;
      const blink = blinking > 1 ? 1 : 1 - .87 * Math.sin(blinking * Math.PI);
      face.eyes.forEach(eye => { eye.scale.y = blink; });

      const tuck = MathUtils.smoothstep(pose.feet, .04, .83);
      feet.forEach(({ hip, ankle, web }, i) => {
        const side = i === 0 ? -1 : 1;
        const running = pose.mode === 'takeoff' || pose.mode === 'flight' ? Math.max(0, -pose.feet) : 0;
        const paddle = turtlePaddle(pose.swimPhase ?? time * 3, side, false);
        const sweep = (paddle.sweep - .2 * paddle.recovery) * (1 - side * turn * .68)
          * Math.min(.5, pose.speed * 1.75 + Math.abs(turn) * .26) * afloat * Number(swimming);
        const step = Math.sin(pose.footPhase + i * Math.PI) * .88;
        hip.rotation.x = sweep + step * running - 1.06 * tuck + (pose.mode === 'land' ? pose.feet * .50 : 0);
        ankle.rotation.x = .42 * tuck - .24 * step * running + (pose.mode === 'land' ? pose.brake * .61 : 0);
        web.scale.x = 1 - .37 * tuck;
      });

      const clearance = MathUtils.smoothstep(pose.y - pose.waterHeight, 0, .71);
      const beat = pose.stroke + .15 * Math.sin(pose.stroke), power = pose.wingPower;
      const stroke = Math.sin(beat), delayed = Math.sin(beat - .84);
      const elevation = stroke * (stroke >= 0 ? .66 : .12 + .48 * clearance);
      const tip = delayed * (delayed >= 0 ? .33 : .065 + .225 * clearance);
      for (const { mesh, shoulder, wrist, side } of wings) {
        const open = MathUtils.smoothstep(pose.wingOpen, 0, 1);
        mesh.morphTargetInfluences![0] = 1 - open;
        // The shoulders hold the wings clear of the surface during the water run.
        shoulder.rotation.set(0, side * open * (-.12 * (1 - open) - pose.brake * .14),
          side * open * (.07 + .16 * (1 - clearance) + elevation * power + pose.brake * .57), 'YXZ');
        wrist.rotation.set(0, side * open * (.105 + .16 * Math.cos(beat - .61) * power),
          side * open * (tip * power - .21 * pose.brake), 'YXZ');
      }
    },
    dispose() { disposeSculpture(root); },
  };
}
