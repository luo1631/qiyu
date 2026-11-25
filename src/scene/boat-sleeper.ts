import {
  CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute, Group, MathUtils,
  MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { batchBoatParts, boatBlock, boatCurve, boatForm, boatPart, boatSurface } from './boat-shapes';
import type { Point3 } from './boat-shapes';

const faceProfile = [
  [-.204, .015, .068, .061], [-.180, .093, .122, .102], [-.132, .151, .161, .143],
  [-.068, .184, .175, .173], [.003, .199, .168, .184], [.078, .202, .158, .181],
  [.145, .185, .150, .165], [.203, .134, .116, .122], [.239, .014, .020, .039],
] as const;
const faceCurve = new CatmullRomCurve3(faceProfile.map(([, width, front, back]) => new Vector3(width, front, back)), false, 'catmullrom');

function profileAt(y: number) {
  const next = faceProfile.findIndex(([height]) => height > y);
  if (next < 0) return faceCurve.getPoint(1);
  if (!next) return faceCurve.getPoint(0);
  const point = MathUtils.inverseLerp(faceProfile[next - 1][0], faceProfile[next][0], y);
  return faceCurve.getPoint((next - 1 + point) / (faceProfile.length - 1));
}

function faceAt(x: number, y: number, front = true, profile = profileAt(y)) {
  const curve = Math.sqrt(Math.max(0, 1 - (x / profile.x) ** 2));
  if (!front) return curve * profile.z;
  const noseBridge = .023 * Math.exp(-((x / .036) ** 2) - (((y + .022) / .061) ** 2));
  const noseTip = .031 * Math.exp(-((x / .032) ** 2) - (((y + .066) / .025) ** 2));
  const cheeks = .009 * Math.exp(-(((Math.abs(x) - .096) / .061) ** 2) - (((y + .059) / .056) ** 2));
  const eye = .008 * Math.exp(-(((Math.abs(x) - .104) / .056) ** 2) - ((y / .026) ** 2));
  return -profile.y * curve ** .72 - noseBridge - noseTip - cheeks + eye;
}

function sculptFace(head: Group, material: MeshStandardMaterial) {
  const positions: number[] = [], uv: number[] = [], colors: number[] = [], faces: number[] = [];
  const rows = 50, sides = 64, base = new Color('#e9b798'), blush = new Color('#cf836f'), tint = new Color();
  for (let i = 0; i <= rows; i++) {
    const y = MathUtils.lerp(faceProfile[0][0], faceProfile[faceProfile.length - 1][0], i / rows);
    const ring = profileAt(y);
    for (let j = 0; j < sides; j++) {
      const a = j * 2 * Math.PI / sides, x = ring.x * Math.cos(a), front = Math.sin(a) < 0;
      const z = faceAt(x, y, front, ring);
      positions.push(x, y, z);
      uv.push(i / rows, j / sides);
      const red = front ? .48 * Math.exp(-(((Math.abs(x) - .127) / .055) ** 2) - (((y + .077) / .041) ** 2))
        + .26 * Math.exp(-((x / .038) ** 2) - (((y + .068) / .029) ** 2)) : 0;
      tint.copy(base).lerp(blush, red).multiplyScalar(.96 + .05 * MathUtils.smoothstep(y, -.198, .081));
      colors.push(tint.r, tint.g, tint.b);
      if (i === rows) continue;
      const p = i * sides + j, q = i * sides + (j + 1) % sides;
      faces.push(p, p + sides, q, q, p + sides, q + sides);
    }
  }
  for (let i = 1; i < sides - 1; i++) {
    faces.push(0, i, i + 1, rows * sides, rows * sides + i + 1, rows * sides + i);
  }
  boatPart(head, 'Sculpted face', boatSurface(positions, faces, uv, colors), material);

  const lashes = new MeshStandardMaterial({ color: '#593c34', roughness: .98 });
  const lips = new MeshStandardMaterial({ color: '#a66457', roughness: .82 });
  const ear = new MeshStandardMaterial({ color: '#daa489', roughness: .71 });
  for (const side of [-1, 1]) {
    const pinna = boatPart(head, 'Ear', new SphereGeometry(1, 20, 12), ear);
    pinna.scale.set(.037, .066, .026);
    pinna.position.set(side * .191, -.029, .011);
    const shut = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6, x = side * (.055 + .111 * t), y = -.006 - .014 * Math.sin(t * Math.PI) + .022 * t;
      const width = .0013 + .0034 * Math.sin(Math.PI * t) ** .64;
      return [x, y, faceAt(x, y) - .0019, width, width * .66] as const;
    });
    boatPart(head, 'Closed eyelid', boatForm(shut, 19, 8, [0, 1, 0]), lashes);
    const brow = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6, x = side * (.059 + .101 * t), y = .053 + .015 * Math.sin(t * Math.PI) + .005 * t;
      return [x, y, faceAt(x, y) + .0005, .001 + .0048 * Math.sin(Math.PI * t), .003] as const;
    });
    boatPart(head, 'Eyebrow', boatForm(brow, 15, 8, [0, 1, 0]), lashes);
  }
  const smile = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7, x = (t - .5) * .065, y = -.124 - .0067 * Math.sin(Math.PI * t);
    return [x, y, faceAt(x, y) - .001, .0008 + .0019 * Math.sin(Math.PI * t), .0018] as const;
  });
  boatPart(head, 'Resting smile', boatForm(smile, 16, 8, [0, 1, 0]), lips);
}

type Lock = readonly (readonly [number, number, number, number, number])[];
const frontLocks: readonly Lock[] = [
  [[-.062,.222,.003,.028,.016],[-.114,.219,-.087,.067,.026],[-.171,.173,-.139,.064,.030],[-.200,.101,-.122,.047,.023],[-.179,.046,-.128,.015,.007],[-.163,.029,-.145,.001,.001]],
  [[-.053,.238,.028,.021,.019],[-.066,.223,-.084,.062,.032],[-.111,.154,-.179,.058,.032],[-.144,.088,-.178,.043,.021],[-.163,.012,-.143,.019,.009],[-.140,-.034,-.125,.001,.001]],
  [[.026,.240,.006,.033,.016],[.005,.221,-.082,.069,.033],[-.046,.168,-.184,.067,.035],[-.086,.084,-.192,.057,.025],[-.129,.020,-.167,.020,.012],[-.134,-.014,-.165,.001,.001]],
  [[.063,.239,.018,.032,.014],[.072,.227,-.074,.063,.038],[.041,.164,-.186,.068,.034],[.012,.089,-.197,.063,.021],[-.025,.030,-.194,.028,.011],[-.053,.017,-.184,.001,.001]],
  [[.084,.229,.022,.034,.015],[.124,.212,-.060,.055,.032],[.110,.145,-.171,.063,.029],[.097,.090,-.175,.040,.024],[.070,.052,-.166,.023,.010],[.048,.043,-.166,.001,.001]],
  [[.124,.194,.052,.024,.017],[.175,.179,-.040,.058,.027],[.179,.108,-.141,.052,.028],[.177,.022,-.138,.041,.020],[.152,-.044,-.145,.022,.008],[.128,-.069,-.137,.001,.001]],
  [[.163,.169,.065,.021,.014],[.200,.131,-.006,.046,.026],[.215,.048,-.056,.047,.024],[.212,-.027,-.076,.034,.018],[.184,-.084,-.079,.018,.010],[.168,-.113,-.051,.001,.001]],
];

function styleHair(head: Group) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: .78 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 strandUV;\n' + shader.vertexShader.replace(
      '#include <uv_vertex>', '#include <uv_vertex>\nstrandUV = uv;',
    );
    shader.fragmentShader = 'varying vec2 strandUV;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float fiber = strandUV.y + sin(strandUV.x * 7. + strandUV.y * 9.) * .008;
      float grain = .56 * sin(248. * fiber) + .28 * sin(419. * fiber) + .16 * sin(116. * fiber);
      diffuseColor.rgb *= 1. + .10 * grain * sin(3.1416 * strandUV.x);
    `);
  };
  material.customProgramCacheKey = () => 'pond-sleeper-hair-grain';
  const shade = new Color('#362922'), copper = new Color('#825842'), color = new Color();
  const rows = 29, sides = 46, positions: number[] = [], uv: number[] = [], faces: number[] = [], colors: number[] = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j < sides; j++) {
    const azimuth = 2 * Math.PI * j / sides, nearBrow = Math.max(0, -Math.sin(azimuth));
    const rim = 2.23 - .90 * nearBrow ** 1.65 + .034 * Math.cos(azimuth * 5);
    const a = MathUtils.lerp(.018, rim, i / rows);
    const fluff = 1 + .035 * Math.sin(6 * azimuth + a * 2) * Math.sin(a);
    positions.push(.218 * Math.cos(azimuth) * Math.sin(a) * fluff, .039 + .224 * Math.cos(a),
      .022 + .204 * Math.sin(azimuth) * Math.sin(a) * fluff);
    color.copy(shade).lerp(copper, .20 + .12 * Math.cos(azimuth - .7) + .09 * Math.sin(a * 2.4));
    colors.push(color.r, color.g, color.b);
    uv.push(i / rows, j / sides);
    if (i === rows) continue;
    const p = i * sides + j, q = i * sides + (j + 1) % sides;
    faces.push(p, q, p + sides, q, q + sides, p + sides);
  }
  boatPart(head, 'Hair beneath fringe', boatSurface(positions, faces, uv, colors), material);
  frontLocks.forEach((lock, i) => {
    boatPart(head, 'Swept fringe', boatForm(lock, 26, 15, [1, 0, 0], (_point, t, a) =>
      color.copy(shade).lerp(copper, (.37 + .089 * Math.sin(i * 3.7)) * Math.sin(t * 2.59 + .21)
        + .13 * Math.max(0, -Math.sin(a - .47)) + .037 * Math.cos(a * 4 + t * 2))), material);
  });

  const looseLocks: readonly Lock[] = [
    [[-.124,.235,-.021,.010,.007],[-.161,.209,-.099,.023,.012],[-.185,.158,-.155,.026,.014],[-.198,.101,-.150,.016,.008],[-.180,.067,-.155,.001,.001]],
    [[.114,.239,-.009,.010,.006],[.155,.207,-.091,.020,.012],[.176,.158,-.156,.018,.012],[.160,.094,-.171,.011,.007],[.143,.073,-.161,.001,.001]],
    [[.063,.256,-.012,.011,.006],[.039,.261,-.053,.023,.008],[.007,.233,-.105,.020,.009],[-.027,.190,-.164,.010,.006],[-.047,.169,-.184,.001,.001]],
  ];
  looseLocks.forEach((lock,i) => {
    boatPart(head,'Loose hair strands',boatForm(lock,22,12,[1,0,0],(_p,t,a) =>
      color.copy(shade).lerp(copper,.28+.34*Math.sin(t*Math.PI)*Math.max(0,-Math.sin(a+.6*i)))),material);
  });

  for (const side of [-1, 1]) for (const layer of [0, 1, 2]) {
    const z = .027 + layer * .059, x = .171 - layer * .026;
    const ends = [[side * x, .139, z - .014, .042, .029], [side * (x + .041), .072, z, .061, .035],
      [side * (x + .050), -.017, z + .012, .046, .026], [side * (x + .033), -.099, z + .008, .030, .019],
      [side * (x + .018), -.144 - .007 * layer, z - .022, .001, .001]] as const;
    boatPart(head, 'Nape locks', boatForm(ends, 22, 14, [0, 0, 1], (_p, t, a) =>
      color.copy(shade).lerp(copper, .25 + .24 * Math.max(0, Math.cos(a + .37)) * Math.sin(Math.PI * t))), material);
  }
  boatPart(head, 'Crown curl', boatForm([[.017,.247,.038,.025,.019],[.027,.275,.017,.024,.018],
    [.012,.308,.006,.016,.012],[-.027,.318,-.006,.009,.008],[-.052,.303,-.011,.001,.001]], 24, 11, [0, 0, 1],
  (_p, t, a) => color.copy(shade).lerp(copper, .30 + .35 * Math.sin(Math.PI * t) * Math.max(0, -Math.sin(a)))), material);
}

function fitHeadphones(head: Group) {
  const enamel = new MeshStandardMaterial({ color: '#e8dbbf', roughness: .53 });
  const cushion = new MeshStandardMaterial({ color: '#566b62', roughness: .91 });
  const bronze = new MeshStandardMaterial({ color: '#b5a37e', roughness: .45, metalness: .32 });
  const points = Array.from({ length: 23 }, (_, i) => {
    const t = Math.PI * i / 22;
    return [.235 * Math.cos(t), -.006 + .284 * Math.sin(t), .046 + .024 * Math.sin(t), .031, .010] as const;
  });
  boatPart(head, 'Headphone headband', boatForm(points, 43, 14, [0, 0, 1]), enamel);
  for (const side of [-1, 1]) {
    const hub = new Group();
    hub.position.set(side * .219, -.017, .012);
    hub.rotation.y = side * .095;
    head.add(hub);
    function cup(name: string, radius: number, width: number, offset: number, material: MeshStandardMaterial) {
      const mesh = boatPart(hub, name, new CylinderGeometry(radius, radius * .98, width, 28), material);
      mesh.rotation.z = -side * Math.PI / 2;
      mesh.position.x = side * offset;
    }
    cup('Leather earpad', .083, .046, -.013, cushion);
    cup('Ivory ear cup', .082, .035, .020, enamel);
    cup('Bronze headphone dial', .055, .010, .042, bronze);
    cup('Enamel inset', .039, .008, .048, enamel);
    const seam = boatPart(hub, 'Cup bevel', new TorusGeometry(.073, .006, 7, 28), enamel);
    seam.rotation.y = Math.PI / 2;
    seam.position.x = side * .035;
    for (const offset of [-1, 0, 1]) {
      const vent = boatBlock(hub, 'Ear cup vent', [side * .053, offset * .013, .014], [.002, .004, .016], .001, cushion);
      vent.rotation.x = -.40;
    }
    batchBoatParts(hub);
  }
}

function bedding(root: Group) {
  const wool = new MeshStandardMaterial({ color: '#7c9995', roughness: 1 });
  const seams = new MeshStandardMaterial({ color: '#acbdb4', roughness: .92 });
  const mat = boatBlock(root, 'Blue linen berth', [0, .452, .395], [.654, .105, 1.185], .063, wool);
  mat.rotation.x = -.018;
  const pillow = boatBlock(root, 'Pillow', [0, .513, .887], [.597, .119, .474], .059,
    new MeshStandardMaterial({ color: '#9aafa3', roughness: 1 }));
  pillow.rotation.y = .067;
  for (const z of [.714, 1.070]) boatCurve(root, 'Pillow piping', [
    [-.258, .553, z], [-.195, .572, z - .023], [0, .578, z - .032], [.199, .574, z - .026], [.262, .544, z - .023],
  ], .006, seams, 25);
  for (const x of [-.303, .303]) boatCurve(root, 'Berth piping', [
    [x * .90, .478, -.181], [x, .481, -.135], [x, .475, .322], [x, .477, .815], [x * .93, .476, .947],
  ], .0044, seams, 34);
}

function makeArms(root: Group, skin: MeshStandardMaterial, shirt: MeshStandardMaterial) {
  for (const side of [-1, 1]) {
    const elbowZ = side < 0 ? .534 : .568;
    boatPart(root, 'Forearm and hand', boatForm([
      [side*.238,.643,.331,.076,.073], [side*.349,.654,.409,.080,.076],
      [side*.455,.685,elbowZ,.066,.070], [side*.464,.713,.641,.061,.064],
      [side*.395,.706,.768,.049,.051], [side*.326,.679,.839,.037,.039],
      [side*.277,.658,.891,.057,.026], [side*.227,.666,.909,.044,.023], [side*.192,.669,.912,.010,.015],
    ], 45, 22, [0, 1, 0]), skin);

    boatPart(root, 'Rolled cotton sleeve', boatForm([
      [side*.164,.645,.353,.102,.116], [side*.248,.634,.370,.113,.122],
      [side*.338,.645,.409,.105,.103], [side*.369,.659,.426,.099,.093], [side*.373,.660,.428,.084,.079],
    ], 23, 24, [0, 1, 0]), shirt);

    const thumb = boatPart(root, 'Resting thumb', new SphereGeometry(1, 14, 10), skin);
    thumb.position.set(side*.274,.682,.864);
    thumb.rotation.y = side * .52;
    thumb.scale.set(.041,.025,.017);
  }
}

function makeLegs(root: Group, skin: MeshStandardMaterial, shorts: MeshStandardMaterial) {
  boatPart(root, 'Shorts waistband', boatForm([
    [0,.560,.012,.217,.112], [0,.558,-.059,.250,.135], [0,.542,-.155,.246,.130], [0,.536,-.205,.208,.073],
  ], 24, 26, [1, 0, 0]), shorts);
  for (const side of [-1, 1]) {
    const bent = side < 0;
    const knee: Point3 = bent ? [side*.193, .780, -.426] : [side*.159, .503, -.644];
    const ankle: Point3 = bent ? [side*.246, .307, -.771] : [side*.182, .477, -1.056];
    const hip = side * .126;
    const end = bent ? [side*.166,.685,-.267] as const : [side*.158,.532,-.300] as const;
    const cuff = new Vector3(...end), shin = new Vector3(...knee).sub(cuff).normalize();
    const belowCuff = (distance: number) => cuff.clone().addScaledVector(shin, distance).toArray();
    const top = bent ? .276 : .477;
    boatPart(root, 'Bare leg and foot', boatForm([
      [...belowCuff(-.043),.082,.079], [...belowCuff(.019),.091,.093],
      [knee[0],knee[1]-.034,knee[2]+.082,.082,.078], [...knee,.072,.068],
      [MathUtils.lerp(knee[0],ankle[0],.32),MathUtils.lerp(knee[1],ankle[1],.32),MathUtils.lerp(knee[2],ankle[2],.32),.078,.079],
      [MathUtils.lerp(knee[0],ankle[0],.66),MathUtils.lerp(knee[1],ankle[1],.66),MathUtils.lerp(knee[2],ankle[2],.66),.061,.064],
      [...ankle,.039,.043],
      [ankle[0]-side*.003,top-.005,ankle[2]-.039,.047,.038],
      [ankle[0]-side*.009,top-.012,ankle[2]-.067,.052,.032],
      [ankle[0]-side*.020,top-.017,ankle[2]-.116,.043,.022], [ankle[0]-side*.026,top-.020,ankle[2]-.132,.023,.012],
    ], 54, 23, [1, 0, 0]), skin);
    boatPart(root, 'Short trouser leg', boatForm([
      [hip,.542,-.065,.133,.123], [side*.146,end[1]-.047,end[2]+.098,.131,.125],
      [...belowCuff(-.033),.123,.117], [...end,.117,.115],
      [...belowCuff(.010),.113,.110], [...belowCuff(.013),.094,.096],
    ], 23, 26, [1, 0, 0]), shorts);

    for (let i = 0; i < 5; i++) {
      const toe = boatPart(root, 'Toe', new SphereGeometry(1, 11, 8), skin);
      toe.position.set(ankle[0] + side * (i * .017 - .059), top - .022 + .0012 * i, ankle[2] - .135 + i * .006);
      toe.scale.set(.0125 - i * .0012, .016 - i * .0014, .029 - i * .0033);
      toe.rotation.y = -side * (.09 - .045 * i);
    }
  }
}

export function makeBoatSleeper() {
  const root = new Group();
  root.name = 'Sleeping traveler';
  const skin = new MeshStandardMaterial({ color: '#e8b396', roughness: .74 });
  const shirt = new MeshStandardMaterial({ color: '#e9e1cc', roughness: .94 });
  const shorts = new MeshStandardMaterial({ color: '#646c62', roughness: .93 });
  const stitching = new MeshStandardMaterial({ color: '#a68c64', roughness: .91 });
  bedding(root);
  makeLegs(root, skin, shorts);

  const tee = boatForm([
    [0,.560,-.106,.226,.121], [0,.563,-.055,.218,.121], [.004,.580,.060,.208,.121],
    [0,.598,.230,.250,.143], [0,.614,.359,.267,.135], [0,.621,.439,.201,.103],
    [0,.634,.480,.113,.089], [0,.636,.487,.088,.073],
  ], 42, 32, [1, 0, 0]);
  const positions = tee.getAttribute('position'), inflate = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i), y = positions.getY(i);
    inflate[i * 3 + 1] = .015 * MathUtils.smoothstep(y, .632, .766) * Math.exp(-(((z - .260) / .145) ** 2));
  }
  tee.morphTargetsRelative = true;
  tee.morphAttributes.position = [new Float32BufferAttribute(inflate, 3)];
  const top = boatPart(root, 'Linen tee', tee, shirt);

  boatPart(root, 'Neck', boatForm([[-.001,.619,.436,.099,.078],[0,.649,.514,.081,.072],
    [-.004,.676,.597,.077,.063],[-.011,.694,.684,.081,.054]], 24, 25, [1, 0, 0]), skin);
  boatCurve(root, 'Collar seam', [[-.099,.651,.471],[-.080,.701,.456], [0,.718,.444],
    [.077,.701,.457],[.103,.650,.469]], .0054, shirt, 24);
  makeArms(root, skin, shirt);

  boatCurve(root, 'Embroidered stem', [[-.034,.741,.191],[-.023,.744,.214],[-.014,.748,.241],[-.002,.749,.268]], .0034, stitching, 13);
  for (const [x, z, side] of [[-.027,.209,-1],[-.018,.233,1],[-.011,.249,-1]]) {
    boatPart(root, 'Embroidered leaf', boatForm([[x,.744,z,.002,.001], [x + side * .016,.748,z + .006,.009,.002],
      [x + side * .030,.746,z + .018,.001,.001]], 9, 10, [0, 0, 1]), stitching);
  }

  const head = new Group();
  head.name = 'Traveler head';
  head.position.set(-.014, .734, .804);
  head.rotation.set(1.249, -.035, -.046, 'YXZ');
  root.add(head);
  sculptFace(head, new MeshStandardMaterial({ vertexColors: true, roughness: .72 }));
  styleHair(head);
  fitHeadphones(head);
  batchBoatParts(head);
  batchBoatParts(root);
  return {
    root, head,
    update(time: number) { top.morphTargetInfluences![0] = .5 + .5 * Math.sin(time * 1.95 - .43); },
  };
}
