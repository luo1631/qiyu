import {
  BufferGeometry, Color, Float32BufferAttribute, Group, MathUtils, Mesh, MeshStandardMaterial,
  PlaneGeometry, ShaderMaterial, TorusGeometry, Vector3,
} from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { FloraGeometry } from '../scene/flora-geometry';
import { Sculpture } from '../scene/sculpture';
import { makeFishingGear } from './fishing-gear';
import type { FishingPose } from './fishing-rules';
import { catCircuit, dogCircuit, emptyPose, visitorCircuit } from './habitat-motion';
import type { HabitatPose } from './habitat-motion';
import { fishingHeading, fishingSeat, groundHeight } from './terrain';

type Section = readonly [y: number, breadth: number, depth: number, z: number];
type Point = [number, number, number];

function makeLeg(material: MeshStandardMaterial, at: Point, lengths: [number, number], sizes: [number, number],
  foot: [number, number, number], colors: [string, string, string], bend: number) {
  const hip = new Group(), knee = new Group(), paw = new Group();
  const [upper, lower] = lengths;
  const [thigh, ankle] = sizes;
  const [dark, light, shoe] = colors;
  const [width, height, length] = foot;
  for (const [part, span, wide, narrow] of [[hip, upper, thigh, thigh * .78], [knee, lower, thigh * .79, ankle]] as const) {
    const section = garment([
      [-span - .020, narrow * .72, narrow * .74, 0], [-span + .012, narrow, narrow * .91, 0],
      [-span * .59, wide * .92, wide * .91, .004], [-span * .15, wide, wide * .99, 0],
      [.016, wide * .68, wide * .74, -.002],
    ], dark, light);
    part.add(new Mesh(section, material));
  }
  const volume = new Sculpture();
  volume.oval([0, height * .17, length * .39], [width, height, length], shoe, [0, 0, 0], 14, 9);
  paw.add(volume.mesh('着地脚掌', material));
  hip.position.set(...at);
  knee.position.y = -upper;
  paw.position.y = -lower;
  hip.add(knee);
  knee.add(paw);
  return { hip, knee, paw, lengths, at, bend, sole: height * .83 };
}

type Leg = ReturnType<typeof makeLeg>;

function positionActor(root: Group, pose: HabitatPose) {
  root.position.set(pose.x, groundHeight(pose.x, pose.z) - .006, pose.z);
  root.rotation.y = pose.yaw;
}

function stepLeg(leg: Leg, root: Group, pose: HabitatPose, hipOffset: number,
  phaseOffset: number, step: number, lift: number) {
  const phase = MathUtils.euclideanModulo(pose.stride / step + phaseOffset, 1);
  const planted = phase <= .63;
  const swing = Math.max(0, (phase - .63) / .37);
  const move = planted ? .5 - phase / .63 : -.5 + MathUtils.smoothstep(swing, 0, 1);
  const z = leg.at[2] + move * step * .63 * pose.pace;
  const x = leg.at[0];
  const cosine = Math.cos(pose.yaw), sine = Math.sin(pose.yaw);
  const floor = groundHeight(pose.x + x * cosine + z * sine, pose.z - x * sine + z * cosine);
  const targetY = floor + leg.sole + lift * Math.sin(swing * Math.PI) * pose.pace - root.position.y;
  const down = Math.max(.012, leg.at[1] + hipOffset - targetY), reach = z - leg.at[2];
  const [upper, lower] = leg.lengths;
  const span = MathUtils.clamp(Math.hypot(down, reach), Math.abs(upper - lower) + .002, upper + lower - .002);
  const angle = Math.atan2(reach, down);
  const notch = Math.acos(MathUtils.clamp((upper * upper + span * span - lower * lower) / (2 * upper * span), -1, 1));
  const flex = Math.acos(MathUtils.clamp((span * span - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
  leg.hip.position.y = leg.at[1] + hipOffset;
  leg.hip.rotation.x = -(angle + leg.bend * notch);
  leg.knee.rotation.x = leg.bend * flex;
  leg.paw.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
}

function groundShadow(geometry: PlaneGeometry, material: ShaderMaterial, width: number, length: number) {
  const shadow = new Mesh(geometry, material);
  shadow.name = '脚边的柔和接触影';
  shadow.position.set(0, .023, .01);
  shadow.scale.set(width, 1, length);
  return shadow;
}

function garment(sections: readonly Section[], shade: string, sun: string) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const dark = new Color(shade), light = new Color(sun), tint = new Color();
  const sides = 24;
  for (const [row, [height, width, depth, z]] of sections.entries()) {
    const lift = row / (sections.length - 1);
    for (let side = 0; side < sides; side++) {
      const angle = side * Math.PI * 2 / sides;
      const x = Math.cos(angle), front = Math.sin(angle);
      const fabric = 1 + .024 * Math.sin(angle * 5 + height * 11.);
      positions.push(x * width * fabric, height, z + front * depth * fabric);
      tint.copy(dark).lerp(light, .34 + .33 * lift + .17 * front + .056 * Math.sin(angle * 3 - 2 * height));
      colors.push(tint.r, tint.g, tint.b);
      if (row === sections.length - 1) continue;
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      indices.push(a, a + sides, b + sides, a, b + sides, b);
    }
  }
  const cap = (sections.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) indices.push(0, side, side + 1, cap, cap + side + 1, cap + side);
  const shape = new BufferGeometry();
  shape.setAttribute('position', new Float32BufferAttribute(positions, 3));
  shape.setAttribute('color', new Float32BufferAttribute(colors, 3));
  shape.setIndex(indices);
  shape.computeVertexNormals();
  return shape;
}

function makeVisitor(material: MeshStandardMaterial) {
  const root = new Group();
  root.name = '湖边看天鹅的人';
  const figure = new Sculpture(), joints = new FloraGeometry();
  const jacket = new Color('#4f7388'), hand = '#d6a180';
  figure.add(garment([
    [.72, .151, .100, -.009], [.78, .169, .107, -.013], [.90, .148, .104, -.012],
    [1.05, .173, .116, .004], [1.17, .215, .109, .002], [1.235, .181, .086, .008],
    [1.28, .080, .061, .012],
  ], '#324f67', '#658a99'), '#ffffff');
  figure.add(garment([[.717, .150, .093, -.012], [.737, .160, .103, -.013],
    [.772, .163, .103, -.014]], '#3b526a', '#526d80'), '#ffffff');
  figure.oval([0, 1.297, .013], [.064, .066, .059], hand);
  figure.add(garment([[1.236, .077, .073, .012], [1.267, .073, .064, .011], [1.284, .069, .057, .010]],
    '#d7cdc0', '#ede1cb'), '#ffffff');
  figure.line([[.002, .79, .092], [.000, .96, .103], [.002, 1.139, .108], [.005, 1.248, .080]], .0048, '#87a0a1', 7);

  const legs = [-1, 1].map(side => makeLeg(material, [side * .101, .765, side * .046],
    [.373, .365], [.089, .063], [.079, .049, .112], ['#6d6251', '#9a8768', '#514039'], 1));
  root.add(...legs.map(leg => leg.hip));
  joints.stem([[-.164, 1.179, .003, .064], [-.231, 1.014, -.014, .065], [-.223, .937, .074, .045],
    [-.164, .961, .146, .037]], jacket, 12, 10);
  figure.oval([-.138, .966, .148], [.044, .031, .035], hand, [0, -.44, .10]);
  figure.oval([-.114, .984, .172], [.019, .017, .021], '#e0ac86');
  figure.add(joints.build('有弧度的衣袖'), '#ffffff');
  const torso = new Group();
  torso.add(figure.mesh('看景人的衣着和站姿', material));
  root.add(torso);
  const sleeve = new FloraGeometry(), arm = new Group();
  sleeve.stem([[0, 0, 0, .069], [.061, -.139, .026, .066], [.063, -.264, .053, .050],
    [.041, -.348, .090, .040]], jacket, 12, 10);
  arm.position.set(.163, 1.171, .005);
  arm.add(new Sculpture().add(sleeve.build('外套袖管'), '#ffffff')
    .oval([.037, -.384, .102], [.046, .056, .029], hand, [-.13, -.22, -.12]).mesh('摆动的手臂', material));
  torso.add(arm);

  const portrait = new Sculpture();
  portrait.add(garment([[0, .049, .061, .011], [.042, .085, .084, .014], [.105, .111, .095, .012],
    [.165, .115, .100, .004], [.223, .103, .099, -.007], [.257, .073, .078, -.014], [.274, .018, .023, -.014]],
    '#b67e62', '#e6b28a'), '#ffffff');
  portrait.oval([0, .166, -.051], [.114, .111, .075], '#4b3934', [.18, 0, 0], 18, 12);
  for (const side of [-1, 1]) {
    portrait.oval([side * .102, .102, .004], [.031, .043, .024], '#cf9577', [.12, 0, side * .20]);
    portrait.oval([side * .047, .122, .102], [.014, .008, .007], '#473738', [0, side * .29, 0]);
    portrait.line([[side * .030, .151, .105], [side * .056, .153, .096], [side * .070, .147, .087]], .0046, '#725345', 5);
  }
  portrait.oval([0, .097, .111], [.024, .025, .035], '#d8a07c', [.15, 0, 0]);
  portrait.line([[-.025, .054, .104], [.000, .050, .110], [.021, .056, .104]], .0036, '#9a665a', 5);
  portrait.add(garment([[.195, .132, .124, .005], [.201, .187, .159, .011], [.219, .186, .158, .000],
    [.235, .131, .126, -.007]], '#a18a5d', '#d4b584'), '#ffffff');
  portrait.add(garment([[.226, .130, .115, -.004], [.266, .122, .106, -.010], [.314, .109, .095, -.015],
    [.341, .071, .066, -.017], [.345, .018, .019, -.015]], '#b29566', '#e0c194'), '#ffffff');
  portrait.add(garment([[.233, .131, .116, -.004], [.252, .128, .113, -.006], [.262, .125, .111, -.007]],
    '#796955', '#9a8264'), '#ffffff');

  const head = new Group();
  head.position.set(.012, 1.326, .018);
  head.add(portrait.mesh('毡帽与脸部', material));
  torso.add(head);
  return { root, head, torso, arm, legs };
}

function ear(side: number, inside: boolean) {
  const outline: Point[] = inside
    ? [[.091, .156, .036], [.124, .174, .050], [.136, .251, .025], [.140, .191, .022], [.124, .187, .010]]
    : [[.066, .129, .005], [.107, .150, .054], [.152, .146, -.032], [.140, .282, .008], [.123, .250, -.023], [.161, .177, .022]];
  return new ConvexGeometry(outline.map(([x, y, z]) => new Vector3(x * side, y, z)));
}

function animalLegs(material: MeshStandardMaterial, cat: boolean) {
  const legs: Leg[] = [];
  for (const back of [false, true]) {
    for (const side of [-1, 1]) {
      const leg = cat
        ? makeLeg(material, [side * .071, back ? .215 : .226, back ? -.175 : .140],
          [.115, .108], [back ? .045 : .035, .022], [.036, .022, .056],
          ['#67696b', '#a4a79e', '#e2dccc'], back ? 1 : -1)
        : makeLeg(material, [side * .090, back ? .270 : .286, back ? -.203 : .181],
          [.142, .133], [back ? .066 : .048, .028], [.046, .030, .061],
          ['#a16b46', '#d4a069', '#e7d5b5'], back ? 1 : -1);
      legs.push(leg);
    }
  }
  return legs;
}

function makeDog(material: MeshStandardMaterial) {
  const root = new Group(), torso = new Group();
  root.name = '沿小径活动的小黄狗';
  const body = new Sculpture();
  const cream = '#e9d7b3', golden = '#bb8351', ginger = '#ac7046';
  body.oval([0, .290, -.018], [.133, .150, .298], ginger, [-.045, 0, 0], 20, 14);
  body.oval([0, .314, .134], [.135, .146, .143], golden, [-.22, 0, 0], 18, 12);
  body.oval([0, .282, .177], [.102, .123, .084], cream, [-.16, 0, 0], 16, 10);
  body.oval([0, .366, .160], [.106, .114, .119], golden, [-.34, 0, 0], 18, 12);
  body.add(new TorusGeometry(.097, .012, 7, 24).rotateX(Math.PI / 2), '#59766b', [0, .402, .153], [1.0, 1, .94], [.46, 0, 0]);
  body.oval([.013, .377, .248], [.017, .023, .007], '#d7b478');
  torso.add(body.mesh('小黄狗的背、胸口和项圈', material));

  const face = new Sculpture();
  face.oval([0, .047, -.014], [.110, .094, .095], golden, [-.28, 0, 0], 18, 11);
  face.oval([0, .093, .042], [.132, .118, .123], golden, [-.091, 0, 0], 20, 14);
  face.oval([0, .046, .112], [.096, .073, .102], cream, [-.12, 0, 0], 18, 12);
  face.oval([0, .071, .174], [.074, .049, .075], '#d7aa74', [-.12, 0, 0], 18, 12);
  face.oval([0, .081, .228], [.044, .028, .030], '#3c3530', [.16, 0, 0], 14, 10);
  face.oval([-.011, .094, .247], [.014, .008, .004], '#87796b');
  for (const side of [-1, 1]) {
    face.add(ear(side, false), side < 0 ? '#af7548' : '#bf8954', [0, .032, .036]);
    face.add(ear(side, true), '#c7937b', [0, .032, .036]);
    face.oval([side * .083, .126, .123], [.018, .016, .010], '#423631', [0, side * .41, side * .18]);
    face.oval([side * .087 - .003, .132, .132], [.0045, .0040, .0030], '#eee1c8');
    face.line([[side * .037, .028, .238], [side * .066, .027, .207], [side * .075, .037, .167]], .0038, '#845b43', 5);
  }
  const head = new Group();
  head.position.set(0, .390, .183);
  head.add(face.mesh('小黄狗的口鼻、眼睛和立耳', material));
  const plume = new FloraGeometry();
  plume.stem([[0, 0, 0, .058], [-.076, .036, -.103, .062], [-.145, .104, -.160, .055],
    [-.166, .177, -.187, .044], [-.146, .226, -.162, .026], [-.108, .238, -.123, .004]],
    new Color('#bf8955'), 12, 15);
  const tail = new Group();
  tail.position.set(-.025, .317, -.277);
  tail.add(new Sculpture().add(plume.build('卷尾'), '#ffffff')
    .oval([-.118, .233, -.137], [.022, .028, .035], '#e3c298', [-.42, 0, .28]).mesh('浅色尾尖', material));
  torso.add(head, tail);
  const legs = animalLegs(material, false);
  root.add(torso, ...legs.map(leg => leg.hip));
  return { root, torso, head, tail, legs };
}

function makeCat(material: MeshStandardMaterial) {
  const root = new Group(), torso = new Group();
  root.name = '在屋前和湖岸之间走动的小猫';
  const body = new Sculpture(), silver = '#969c94', soot = '#6b7373', cream = '#e2dccc', stripe = '#777e7b';
  body.oval([0, .236, -.026], [.100, .109, .232], silver, [-.042, 0, 0], 20, 14);
  body.oval([0, .242, .117], [.091, .105, .111], silver, [-.20, 0, 0], 18, 12);
  body.oval([0, .210, .166], [.076, .078, .086], cream, [-.12, 0, 0], 16, 10);
  body.oval([0, .297, .145], [.076, .082, .080], silver, [-.31, 0, 0], 14, 10);
  body.oval([0, .200, -.063], [.086, .064, .157], cream, [0, 0, 0], 16, 11);
  for (const side of [-1, 1]) {
    for (const [z, span] of [[-.152, .93], [-.085, 1], [-.019, .99], [.051, .95]]) {
      body.line([[side * .018, .341 - (1 - span) * .18, z], [side * .068 * span, .317, z - .012],
        [side * .093 * span, .282, z - .028], [side * .100 * span, .248, z - .021]], .0065, stripe, 8);
    }
  }
  torso.add(body.mesh('浅灰背部与奶白腹部', material));

  const portrait = new Sculpture();
  portrait.oval([0, .052, .000], [.093, .084, .088], silver, [-.26, 0, 0], 18, 12);
  portrait.oval([0, .022, .056], [.072, .046, .062], cream, [-.10, 0, 0], 16, 10);
  for (const side of [-1, 1]) {
    portrait.add(ear(side, false), soot, [0, -.016, -.010], [.72, .65, .70]);
    portrait.add(ear(side, true), '#b6978e', [0, -.014, -.008], [.72, .65, .70]);
    portrait.oval([side * .030, .024, .089], [.025, .020, .027], cream);
    portrait.oval([side * .043, .063, .076], [.017, .012, .009], '#9ea66e', [-.14, side * .32, side * .15]);
    portrait.oval([side * .043, .063, .084], [.0040, .009, .003], '#3f4843');
    portrait.line([[side * .026, .119, .048], [side * .042, .103, .058], [side * .049, .086, .069]], .0054, stripe, 6);
    for (const y of [.024, .038]) {
      portrait.line([[side * .047, y, .100], [side * .072, y + .001, .111],
        [side * .092, y - .005, .114]], .0017, '#f5e7d5', 5);
    }
  }
  portrait.oval([0, .042, .113], [.015, .010, .007], '#976f6c');
  const head = new Group();
  head.position.set(0, .303, .180);
  head.add(portrait.mesh('猫的眼睛、三角耳与胡须', material));

  const tail = new Group(), fur = new FloraGeometry();
  fur.stem([[0, 0, 0, .036], [.027, .034, -.107, .036], [.055, .103, -.203, .033],
    [.059, .185, -.271, .028], [.057, .270, -.294, .023], [.040, .325, -.249, .004]],
    new Color('#818880'), 11, 17);
  tail.position.set(.015, .265, -.232);
  tail.add(new Sculpture().add(fur.build('弯尾'), '#ffffff')
    .oval([.048, .313, -.268], [.024, .026, .028], soot, [-.55, 0, -.1]).mesh('深灰尾尖', material));
  torso.add(head, tail);
  const legs = animalLegs(material, true);
  root.add(torso, ...legs.map(leg => leg.hip));
  return { root, torso, head, tail, legs };
}

export function makeShoreLife(seatY = groundHeight(fishingSeat.x, fishingSeat.y) + .38) {
  const root = new Group();
  root.name = '木桥与屋前的人、狗和猫';
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .78 });
  const visitor = makeVisitor(material), dog = makeDog(material), cat = makeCat(material);
  let fishing: ReturnType<typeof makeFishingGear> | undefined;
  const grip = new Vector3();
  const visitorPose = emptyPose(), dogPose = emptyPose(), catPose = emptyPose();
  const shadowShape = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shade = new ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec2 radial;
      void main() {
        radial = uv * 2. - 1.;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 radial;
      void main() {
        float strength = 1. - smoothstep(.07, 1., length(radial));
        gl_FragColor = vec4(.065, .105, .095, .36 * strength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const visitorShadow = groundShadow(shadowShape, shade, .70, .68);
  visitor.root.add(visitorShadow);
  dog.root.add(groundShadow(shadowShape, shade, .49, .79));
  cat.root.add(groundShadow(shadowShape, shade, .40, .64));
  root.add(visitor.root, dog.root, cat.root);
  root.traverse(object => { object.castShadow = false; });

  return {
    root,
    occupied(x: number, z: number) {
      return [visitor, dog, cat].some(({ root }, i) =>
        Math.hypot(x - root.position.x, z - root.position.z) < [ .28, .31, .23 ][i]);
    },
    update(time: number, pose: FishingPose = 'idle', elapsed = 0) {
      visitorCircuit.sample(time, visitorPose);
      dogCircuit.sample(time, dogPose);
      catCircuit.sample(time, catPose);
      positionActor(dog.root, dogPose);
      positionActor(cat.root, catPose);

      visitorShadow.visible = pose === 'idle';
      if (pose === 'idle') {
        positionActor(visitor.root, visitorPose);
        const gait = Math.sin(visitorPose.stride / .54 * Math.PI * 2) * visitorPose.pace;
        const rise = .013 * gait ** 2;
        visitor.torso.position.y = rise;
        visitor.torso.rotation.y = .033 * gait;
        visitor.torso.rotation.x = .042 * visitorPose.pace;
        visitor.arm.rotation.set(-.23 * gait, 0, 0);
        visitor.head.rotation.set(.052 + Math.sin(time * .66) * .022, .25 + Math.sin(time * .48) * .075, -.032);
        visitor.legs.forEach((leg, i) => stepLeg(leg, visitor.root, visitorPose, rise, i * .50, .54, .075));
      } else {
        if (!fishing) {
          fishing = makeFishingGear();
          root.add(fishing.root);
        }
        const lift = pose === 'landed' ? 1 : pose === 'reeling' ? MathUtils.smoothstep(elapsed, 0, .43) : 0;
        visitor.root.position.set(fishingSeat.x, seatY - .020, fishingSeat.y);
        visitor.root.rotation.y = fishingHeading;
        visitor.torso.position.y = -.744 + Math.sin(time * 2.08) * .008;
        visitor.torso.rotation.set(.11 - lift * .22, -.05, -.026);
        visitor.arm.rotation.set(-1.28 - lift * .49, -.17, .085);
        visitor.head.rotation.set(.19 - .31 * lift, -.16 + Math.sin(time * .68) * .08, -.028);
        visitor.legs.forEach((leg, i) => {
          leg.hip.position.y = .019;
          leg.hip.rotation.x = -1.56 + i * .14;
          leg.knee.rotation.x = 1.43 + i * .11;
          leg.paw.rotation.x = .20 - i * .18;
        });
        visitor.arm.localToWorld(grip.set(.037, -.385, .116));
      }
      fishing?.update(pose, grip, seatY, time, elapsed);

      const sniff = Number(dogPose.activity === 'sniff') * dogPose.hold;
      const dogLift = .012 * Math.sin(dogPose.stride * 29) * dogPose.pace - .016 * sniff;
      dog.torso.position.y = dogLift;
      dog.head.position.y = .390 - sniff * .127;
      dog.head.position.z = .183 + sniff * .068;
      dog.head.rotation.set(.045 + sniff * .94 + Math.sin(time * .72) * .040,
        - .19 + Math.sin(time * (sniff > .04 ? 2.6 : .67)) * (.19 + sniff * .18), Math.sin(time * .74) * .039);
      dog.tail.rotation.y = Math.sin(time * 4.7) * (.15 + dogPose.pace * .10) + Math.sin(time * 1.08) * .07;
      dog.tail.rotation.x = -.045 + Math.sin(time * 2.8) * .057;
      dog.legs.forEach((leg, i) => stepLeg(leg, dog.root, dogPose, dogLift, [0, .52, .50, .025][i], .355, .052));

      const resting = Number(catPose.activity === 'rest') * catPose.hold;
      const catLift = -.093 * resting + .007 * catPose.pace * Math.cos(catPose.stride * 27);
      cat.torso.position.y = catLift;
      cat.head.rotation.set(.080 + resting * .18 + Math.sin(time * .55) * .055, Math.sin(time * .77) * .31, -.083 * resting);
      cat.tail.rotation.x = -.32 * resting + Math.sin(time * 1.27) * .13;
      cat.tail.rotation.y = Math.sin(time * 1.12 + .9) * .36 - resting * .72;
      cat.legs.forEach((leg, i) => stepLeg(leg, cat.root, catPose, catLift, [0, .50, .22, .76][i], .245, .040));
    },
  };
}
