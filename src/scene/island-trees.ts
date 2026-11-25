import {
  BufferGeometry, CatmullRomCurve3, Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute,
  Group, InstancedMesh, MathUtils, MeshStandardMaterial, Object3D, Vector3,
} from 'three';
import { Sculpture } from './PondCreatures';
import { seededRandom } from './pond-life';
import { softenVegetation } from './vegetation-material';
import type { SurfaceSampler } from './PondSurface';
import { waterLevel } from './PondOptics';

type BranchPoint = [number, number, number, number];
const bark = '#6c533c';

function petalGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0,.008,0, -.029,.001,.031, -.047,.013,.069, -.038,.023,.102,
    -.014,.025,.115, .006,.022,.111, .028,.027,.104, .045,.017,.078,
    .034,.004,.029, 0,.010,.067,
  ], 3));
  geometry.setIndex([0,1,9, 1,2,9, 2,3,9, 3,4,9, 4,5,9, 5,6,9, 6,7,9, 7,8,9, 8,0,9]);
  geometry.computeVertexNormals();
  return geometry;
}

function leafShape(length: number, width: number, tint: number) {
  const vertices: number[] = [], indices: number[] = [], colors: number[] = [];
  const light = new Color('#9db77b'), dark = new Color('#4b6e4f'), colour = new Color();
  const rows = 5;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const span = width * Math.max(.008, Math.sin(Math.PI * t ** .88) ** .83);
    for (const side of [-1, 0, 1]) {
      const x = side*span + t*t*width*.42, y = length*(.20*t-.38*t*t*t) + Math.abs(side)*span*.19;
      vertices.push(x,y,length*t);
      colors.push(...colour.copy(dark).lerp(light, (side === 0 ? .61 : .28) + t*.17).multiplyScalar(tint).toArray());
    }
    if (row === rows) continue;
    const a = row * 3;
    indices.push(a,a+3,a+1, a+1,a+3,a+4, a+1,a+4,a+2, a+2,a+4,a+5);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function barkMaterial() {
  return softenVegetation(new MeshStandardMaterial({ vertexColors: true, side: DoubleSide }), true, true);
}

function branch(tree: Sculpture, sections: BranchPoint[], sides = 8, stepsPerSection = 4) {
  const path = new CatmullRomCurve3(sections.map(([x, y, z]) => new Vector3(x, y, z)));
  const steps = (sections.length - 1) * stepsPerSection;
  const frame = path.computeFrenetFrames(steps, false);
  const positions: number[] = [], indices: number[] = [], colors: number[] = [];
  const color = new Color(bark), point = new Vector3();
  for (let row = 0; row <= steps; row++) {
    const at = row / steps, centre = path.getPointAt(at);
    const section = Math.min(Math.floor(at * (sections.length - 1)), sections.length - 2);
    const t = at * (sections.length - 1) - section;
    const radius = sections[section][3] * (1 - t) + sections[section + 1][3] * t;
    for (let i = 0; i < sides; i++) {
      const theta = i / sides * Math.PI * 2;
      const ridge = radius * (1 + .09 * Math.sin(theta * 3 + row * .36));
      point.copy(centre).addScaledVector(frame.normals[row], Math.cos(theta) * ridge)
        .addScaledVector(frame.binormals[row], Math.sin(theta) * ridge);
      positions.push(point.x, point.y, point.z);
      const shade = .83 + .19 * Math.sin(theta * 3 + .6) ** 2 + at * .21;
      colors.push(color.r * shade, color.g * shade, color.b * shade);
      if (row === steps) continue;
      const a = row * sides + i, b = row * sides + (i + 1) % sides;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  tree.add(geometry, bark);
  return path;
}

function colouredShape(positions: number[], colors: number[], faces: number[]) {
  const shape = new BufferGeometry();
  shape.setAttribute('position', new Float32BufferAttribute(positions, 3));
  shape.setAttribute('color', new Float32BufferAttribute(colors, 3));
  shape.setIndex(faces);
  shape.computeVertexNormals();
  return shape;
}

function peachCorolla() {
  const flower = new Sculpture(true);
  const petalBase = new Color('#da8391'), petalLip = new Color('#ffe5d6'), tint = new Color();
  for (let petal = 0; petal < 5; petal++) {
    const positions: number[] = [], colors: number[] = [], faces: number[] = [];
    const length = .067 + .012 * Math.sin(petal * 3.4);
    const profile = [[.0,.004], [.28,.019], [.64,.033], [.88,.028], [1,.004]];
    for (const [row, [t, width]] of profile.entries()) {
      for (const side of [-1, 0, 1]) {
        positions.push(side * width + .004 * Math.sin(t * 3), .005 + .026 * t ** 2 + .011 * side ** 2 * t * (1 - t),
          .007 + length * t - (row >= 4 ? .0045 * (1 - side ** 2) * t : 0));
        tint.copy(petalBase).lerp(petalLip, .13 + .86 * MathUtils.smoothstep(t, .09, .81));
        tint.multiplyScalar(1 - .068 * side ** 2 * Math.sin(t * Math.PI));
        colors.push(tint.r, tint.g, tint.b);
      }
      if (row === profile.length - 1) continue;
      const k = row * 3;
      faces.push(k,k+3,k+1, k+1,k+3,k+4, k+1,k+4,k+2, k+2,k+4,k+5);
    }
    flower.add(colouredShape(positions, colors, faces), '#ffffff', [0, 0, 0], [1,1,1], [-.08 + petal * .032, petal * 1.2566, .04*Math.cos(petal*2)]);
  }
  flower.oval([0,.008,0],[.017,.010,.017],'#ab5a63',undefined,6,2);
  const stamens: number[] = [], faces: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = i*2.39996, r = .008 + (i % 3) * .004;
    const x = Math.cos(a)*r, z = Math.sin(a)*r;
    const y = .021 + (i % 2) * .006, k = i * 4;
    stamens.push(x-.002,y-.008,z, x+.002,y-.008,z, x,y+.0078,z, x,y,z+.0038);
    faces.push(k,k+1,k+3, k+1,k+2,k+3, k+2,k,k+3);
  }
  const gold = new BufferGeometry();
  gold.setAttribute('position',new Float32BufferAttribute(stamens,3));
  gold.setIndex(faces);
  gold.computeVertexNormals();
  flower.add(gold,'#f9cc8e');
  return flower;
}

type SprayPlacement = { point: Vector3; direction: Vector3; scale: number; roll: number; tint: Color };

function plantSprays(name: string, geometry: BufferGeometry, material: MeshStandardMaterial, positions: SprayPlacement[]) {
  const mesh = new InstancedMesh(geometry, material, positions.length);
  const up = new Vector3(0,1,0), dummy = new Object3D();
  positions.forEach(({ point, direction, scale, roll, tint }, index) => {
    dummy.position.copy(point);
    dummy.quaternion.setFromUnitVectors(up,direction);
    dummy.rotateY(roll);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index,dummy.matrix);
    mesh.setColorAt(index,tint);
  });
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function peachBud() {
  const bud = new Sculpture(true);
  bud.oval([0,.009,0],[.014,.020,.014],'#93505a',undefined,5,2);
  bud.oval([0,.028,0],[.024,.036,.022],'#e9979d',[.14,0,.16],10,5);
  return bud;
}

export function makePeachTree() {
  const tree = new Group();
  tree.name = 'PeachTree';
  const wood = new Sculpture(), crownWood = new Sculpture();
  const trunk = branch(wood, [[0,-.14,0,.278],[-.145,.37,.09,.206],[-.27,.91,.11,.167],[-.17,1.47,.13,.142],[.04,2.13,.015,.108],
    [.115,2.80,-.27,.046],[.22,3.24,-.34,.012]], 15);
  const limbs: BranchPoint[][] = [
    [[-.17,1.19,.10,.126],[-.54,1.76,.32,.096],[-1.11,2.23,.55,.052],[-1.56,2.33,.63,.015]],
    [[-.04,1.93,.07,.103],[.57,2.39,.28,.067],[1.15,2.59,.51,.041],[1.75,2.82,.57,.012]],
    [[-.12,1.64,.06,.103],[-.52,2.31,-.37,.069],[-1.05,2.71,-.69,.043],[-1.59,2.79,-.88,.012]],
    [[.07,2.20,-.04,.085],[.59,2.67,-.40,.054],[1.15,2.92,-.74,.036],[1.46,3.06,-.85,.014]],
    [[-.28,1.62,.20,.070],[-.30,2.21,.63,.046],[-.57,2.70,.76,.032],[-.72,2.83,1.10,.012]],
    [[.07,2.30,-.06,.075],[-.22,2.75,-.41,.044],[-.54,3.26,-.54,.029],[-.75,3.48,-.50,.010]],
  ];
  const boughPaths = limbs.map(limb => branch(wood, limb));
  for (const [x, z] of [[-.57,.31],[.48,.19],[-.31,-.56],[.14,.46],[.37,-.37]]) {
    branch(wood, [[x,-.065,z,.012],[x*.51,.012,z*.48,.071],[-.02,.16,.03,.137]]);
  }

  const random = seededRandom(30266);
  const boughs = [
    [0,.79,-1.56,2.39,.60,.42], [0,.95,-1.94,2.46,.69,.38], [0,.63,-1.17,2.62,.48,.31],
    [4,.85,-.82,2.78,1.15,.41], [4,.70,-.51,2.72,.70,.36], [4,.95,-.38,2.98,.95,.29],
    [1,.60,.62,2.51,.74,.36], [1,.82,1.19,2.73,.68,.44], [1,.99,1.83,2.84,.65,.38], [1,.89,1.53,2.66,.99,.31],
    [2,.93,-1.73,2.82,-.86,.43], [2,.62,-1.17,2.86,-.57,.41], [2,.83,-1.29,3.01,-1.04,.31],
    [3,.70,.82,2.98,-.67,.40], [3,.96,1.53,3.06,-1.02,.33], [3,.67,1.19,3.10,-.54,.34],
    [5,.81,-.67,3.39,-.66,.38], [5,.99,-1.02,3.51,-.43,.33], [5,.79,-.48,3.46,-.24,.36],
    [6,.92,.14,3.31,-.37,.43], [6,.78,.37,3.05,.02,.41], [6,.98,.38,3.49,-.17,.30],
  ] as const;
  const flowers: SprayPlacement[] = [], buds: SprayPlacement[] = [], leaflets: SprayPlacement[] = [];
  const rose = new Color('#f3aab7'), cream = new Color('#fff2df'), jade = new Color('#b9b388'), green = new Color('#e2dfab');
  const stems = [...boughPaths,trunk];
  for (const [axis, along, x,y,z, spread] of boughs) {
    const start = stems[axis].getPointAt(along);
    const end = new Vector3(x,y,z);
    const turn = start.clone().lerp(end,.56);
    turn.y += .080 + spread*.18;
    const shoot = branch(crownWood, [[...start.toArray(),.022],[...turn.toArray(),.015],[x,y,z,.004]], 6, 3);
    const spin = random()*6.28318;
    const clusters = 7 + Math.round(spread * 7);
    for (let tuft = 0; tuft < clusters; tuft++) {
      const size = .63 + .55 * random();
      const attach = shoot.getPointAt(.22 + .76 * (tuft+.40) / clusters);
      const angle = spin + tuft * 2.39996, lift = (.23 + random() * .77) * (tuft%4 === 0 ? -.54 : 1);
      const outward = new Vector3(Math.cos(angle),lift,Math.sin(angle));
      const tip = attach.clone().addScaledVector(outward,spread * size * (.56 + random()*.53));
      const arc = attach.clone().lerp(tip,.48);
      arc.y += spread * .20;
      const spray = branch(crownWood, [[...attach.toArray(),.0062],[...arc.toArray(),.0042],[...tip.toArray(),.0011]], 5, 2);
      for (let flower = 0; flower < 8; flower++) {
        const t = .10 + .89 * (flower + random()*.58) / 8;
        const point = spray.getPointAt(t);
        const bearing = angle + 2.39996*flower + random()*.34;
        const direction = new Vector3(Math.cos(bearing), .34 + (random()-.38)*1.28, Math.sin(bearing)).normalize();
        const roll = random()*6.28;
        const scale = (.68 + random()*.73) * (1 - .17*t);
        const isBud = flower === 7 || random() < .12;
        const offset = .014 + .027*random();
        const face = point.clone().addScaledVector(direction,offset);
        if (flower%2 === 0 || isBud) crownWood.line([point.toArray(),face.toArray()],.0018*scale,'#94594f',3);
        (isBud ? buds : flowers).push({ point: face, direction, roll, scale, tint: rose.clone().lerp(cream,.26+.73*random()) });
        if (flower === 2 || (flower === 5 && tuft%3 === 0)) {
          leaflets.push({ point, direction: new Vector3(direction.x*.39,.87,direction.z*.39).normalize(),
            roll: bearing - Math.PI * .5, scale: .74+random()*.60, tint: jade.clone().lerp(green,random()) });
        }
      }
    }
  }
  const petals = softenVegetation(new MeshStandardMaterial({ vertexColors:true, side:DoubleSide }), false, true);
  const foliage = softenVegetation(new MeshStandardMaterial({ vertexColors:true, side:DoubleSide }), false, true);
  const blooms = plantSprays('PeachBlossoms', peachCorolla().mesh('Corolla',petals).geometry, petals, flowers);
  const unopened = plantSprays('PeachBuds', peachBud().mesh('Bud',petals).geometry, petals, buds);
  const leaves = plantSprays('PeachYoungLeaves', leafShape(.126,.026,1.13), foliage, leaflets);
  const twigs = crownWood.mesh('PeachFloweringTwigs',barkMaterial());
  unopened.castShadow = twigs.castShadow = leaves.castShadow = false;
  const flowering = new Group(); flowering.position.y = 2.28;
  for (const layer of [twigs,blooms,unopened,leaves]) layer.position.y = -flowering.position.y;
  flowering.add(twigs,blooms,unopened,leaves);
  tree.add(wood.mesh('PeachBranches',barkMaterial()),flowering);
  return { tree, update(time: number, gust: number) {
    flowering.rotation.x = Math.sin(time*1.5)*.015 + gust*Math.sin(time*6.8)*.042;
    flowering.rotation.z = Math.cos(time*1.3)*.014 + gust*Math.sin(time*5.5)*.048;
  } };
}

function pineNeedleSpray() {
  const positions: number[] = [], colors: number[] = [], faces: number[] = [];
  const low = new Color('#4d6841'), high = new Color('#8ba66c'), tint = new Color();
  for (let i = 0; i < 14; i++) {
    const a = (i - 6.5) * .23 + .12 * Math.sin(i * 5.43);
    const length = .102 + .061 * Math.sin(i*2.73)**2;
    const lean = .38 + .44 * Math.sin(i*1.75)**2;
    const start = positions.length / 3;
    for (const [t,width] of [[0,.0009],[.31,.0052],[.72,.0039],[1,.00028]]) {
      const across = Math.cos(a)*width, back = Math.sin(a)*width;
      const x = Math.sin(a)*length*t + .003*(i-7)*t*t;
      const y = length*t*lean - .086 * t*t;
      const z = Math.cos(a)*length*t;
      positions.push(x-across,y,z+back,x+across,y+.004*(1-t),z-back);
      tint.copy(low).lerp(high, .10 + .54*t + .19*Math.sin(i*3.16)**2);
      colors.push(tint.r*.88,tint.g*.90,tint.b*.88,tint.r,tint.g,tint.b);
    }
    for (let j = 0; j < 3; j++) {
      const k = start + 2*j;
      faces.push(k,k+2,k+1, k+1,k+2,k+3);
    }
  }
  return colouredShape(positions, colors, faces);
}

export function makeIslandPine() {
  const tree = new Group(), wood = new Sculpture();
  tree.name = 'StoneIslandPine';
  const trunk = branch(wood, [[0,-.09,0,.133],[-.09,.29,.026,.106],[-.22,.63,-.07,.078],[-.26,1.03,-.13,.054],
    [-.14,1.47,-.15,.038],[-.22,1.78,-.26,.019],[-.31,1.91,-.31,.004]], 12);
  for (const [x,z] of [[-.35,.23],[.26,.22],[.16,-.24]]) {
    branch(wood,[[x,-.039,z,.006],[x*.49,.014,z*.47,.039],[-.023,.109,.012,.093]],7);
  }
  const boughs = [
    [.42,-.91,.76,.12,.32], [.48,.52,.91,.19,.31], [.54,-.22,1.06,.47,.24],
    [.63,-.81,1.26,-.26,.30], [.66,.52,1.39,-.22,.29], [.78,-.53,1.54,-.49,.25],
    [.85,.27,1.67,-.15,.24], [.95,-.48,1.91,-.37,.25], [1,-.19,1.96,-.26,.19],
  ];
  const random = seededRandom(7791), budGreen = new Color('#b4bc92'), shade = new Color('#7c9270');
  const sprays: SprayPlacement[] = [];
  for (const [i,[along,x,y,z,width]] of boughs.entries()) {
    const start = trunk.getPointAt(along), end = new Vector3(x,y,z), arch = start.clone().lerp(end,.53);
    arch.y -= .035 + random()*.052;
    const bough = branch(wood, [[...start.toArray(),.035],[...arch.toArray(),.019],[x,y,z,.0035]], 8);
    const bearing = Math.atan2(end.x - start.x, end.z - start.z);
    const fingers = 9 - (i > 5 ? 1 : 0);
    for (let j = 0; j < fingers; j++) {
      const t = .28 + .71*(j+.2)/fingers;
      const foot = bough.getPointAt(t);
      const around = bearing + (j%2 ? 1 : -1)*(.55+random()*1.01);
      const reach = width*(.60+.76*random())*(1-.33*t);
      const nose = foot.clone().add(new Vector3(Math.sin(around)*reach,.031 + .152 * random(),Math.cos(around)*reach));
      const middle = foot.clone().lerp(nose,.52); middle.y -= .014;
      const twig = branch(wood, [[...foot.toArray(),.0085],[...middle.toArray(),.0055],[...nose.toArray(),.0017]], 5, 2);
      for (let n = 0; n < 7; n++) {
        const point = twig.getPointAt(.19 + .8*(n+.3)/7);
        point.y += .006;
        const roll = around + (n%2 ? .9 : -.9) * (.48 + random()*.77);
        const direction = new Vector3(Math.sin(around)*.25,.96,Math.cos(around)*.25).normalize();
        sprays.push({ point, direction, roll, scale: .68 + random()*.63, tint: shade.clone().lerp(budGreen,.14+.84*random()) });
      }
    }
  }
  const material = softenVegetation(new MeshStandardMaterial({vertexColors:true,side:DoubleSide}), false, true);
  const needles = plantSprays('PineNeedleFans', pineNeedleSpray(), material, sprays);
  tree.add(wood.mesh('PineBranches', barkMaterial()), needles);
  return tree;
}

export function makeIslandWillow() {
  const tree = new Group(), wood = new Sculpture();
  tree.name = 'ChimeIslandWillow';
  branch(wood, [[0,-.09,0,.134],[.09,.41,.12,.113],[.12,.91,.13,.073],[.08,1.37,.09,.053],
    [-.09,1.87,-.05,.034],[-.27,2.13,-.08,.011]], 10);
  for (const [x,z] of [[-.17,.19],[.21,.16],[.25,-.17]]) {
    branch(wood, [[x,-.034,z,.007],[x*.5,.016,z*.5,.05],[.025,.115,.021,.083]], 7);
  }
  const random = seededRandom(272087), willowGreen = new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.92});
  const cords = new MeshStandardMaterial({vertexColors:true,side:DoubleSide,roughness:.99});
  const fronds = [[-.74,1.77,-.22],[-.47,2.08,-.53],[.70,1.86,.16],[.62,1.99,-.48],[-.27,2.09,.44],
    [.29,2.26,.43],[.14,2.31,-.54],[-.60,1.98,.25],[.48,2.21,-.08],[-.21,2.32,-.17]];
  const tassels = fronds.map(([x,y,z], i) => {
    branch(wood, [[.08,1.14+i%3*.13,.105,.046],[x*.34,y-.24,z*.40,.026],[x*.76,y+.073,z*.81,.017],[x,y,z,.007]], 8);
    const pivot = new Group(), twigs = new Sculpture(), foliage = new Sculpture();
    pivot.position.set(x,y,z);
    for (let n = 0; n < 10; n++) {
      const a = (n+i*.22)*2.399963, length = .39 + random()*.63, dx = Math.cos(a), dz = Math.sin(a);
      const reach = .134 + random()*.209, bend = .06 + random()*.14;
      const path = new CatmullRomCurve3([
        new Vector3(),new Vector3(dx*reach*.56,.045+n*.008,dz*reach*.56),
        new Vector3(dx*reach,-length*.38,dz*reach),new Vector3(dx*(reach+bend),-length,dz*(reach+bend)),
      ]);
      twigs.line(path.getSpacedPoints(6).map(point=>point.toArray()), .0043, '#6f7b55', 7);
      for (let leaf = 0; leaf < 14; leaf++) {
        const t = (leaf + .6) / 14, point = path.getPointAt(t);
        const side = leaf % 2 ? 1 : -1;
        const size = (.107 + random()*.092)*(1-t*.35), width = size*(.115+random()*.042);
        foliage.add(leafShape(size,width,.91+random()*.36), '#aac185', point.toArray(), [1,1,1],
          [t*.72+(random()-.5)*.37,Math.PI/2-a+side*(.67+random()*.61),side*(.18+random()*.46)]);
      }
    }
    const twigsMesh = twigs.mesh('WillowTwigs',cords);
    twigsMesh.castShadow = false;
    pivot.add(twigsMesh,foliage.mesh('WillowLeaves',willowGreen));
    tree.add(pivot);
    return pivot;
  });
  tree.add(wood.mesh('WillowBranches',barkMaterial()));
  return { tree, update(time: number, gust: number) {
    tassels.forEach((tassel, i) => {
      tassel.rotation.set(Math.sin(time*1.21+i*.53)*.047 + gust*Math.cos(time*4.7+i*.62)*.11,0,
        Math.cos(time*1.78+i*.62)*.065 + gust*Math.sin(time*4.3+i*.51)*.14);
    });
  } };
}

export function makePeachPetals(origin: Vector3, ground: (x:number,z:number)=>number) {
  const mesh = new InstancedMesh(petalGeometry(), new MeshStandardMaterial({ color: '#ffc7b8', roughness: .7, side: DoubleSide }), 56);
  mesh.name = 'FallingPeachPetals';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const random = seededRandom(72343), dummy = new Object3D();
  const petal = (born: number, gust = false) => {
    const x = origin.x+(random()-.46)*3.4, z = origin.z+(random()-.46)*1.5;
    const fall = 3.4 + random()*2.9, phase = random()*Math.PI*2;
    const dx = (.31+random()*.37)*fall*(gust?1.16:1), dz = (.22+random()*.21)*fall;
    const landing = ground(x+dx,z+dz);
    return { x,z,dx,dz,y:origin.y+2.55+random()*.78,born,fall,phase,size:.59+random()*.63,landing,
      after: landing <= waterLevel ? 3.1+random()*3.9 : 2.2+random()*2.8 };
  };
  const ambient = 12;
  const all = Array.from({ length: 56 }, (_, i) => petal(i < ambient ? -i*.79 : Infinity));
  return {
    mesh,
    scatter(time: number) {
      for (let i = ambient; i < all.length; i++) all[i] = petal(time + (i-ambient)*.021,true);
    },
    update(time: number, sample: SurfaceSampler) {
      let visible = 0;
      for (const [i, leaf] of all.entries()) {
        const life = leaf.fall + leaf.after;
        const age = i < ambient ? (time - leaf.born) % (life + 2.3) : time - leaf.born;
        if (age < 0 || age >= life) continue;
        const t = Math.min(1,age/leaf.fall), afloat = leaf.landing <= waterLevel;
        const wave = leaf.phase + age*2.7, sway = Math.sin(Math.PI*t), settled = Math.max(0,age-leaf.fall);
        const x = leaf.x+leaf.dx*t+Math.cos(wave)*.18*sway+(afloat?settled*.084:0);
        const z = leaf.z+leaf.dz*t+Math.sin(wave)*.24*sway+(afloat?settled*.052:0);
        const surface = afloat && t > .79 ? sample(x,z,time) : null;
        const end = afloat ? .016+(surface?.height ?? 0) : leaf.landing+.014;
        const y = end+(leaf.y-end)*(1-t)**1.19+Math.sin(wave*.63)*.14*sway;
        dummy.position.set(x,y,z);
        dummy.rotation.set((surface?.dz ?? 0)*t+Math.sin(wave*.83)*(1-t)*1.21,
          wave*(.35-.23*t),-(surface?.dx ?? 0)*t+Math.cos(wave)*(1-t)*1.24);
        dummy.scale.setScalar(leaf.size*Math.min(1,age*5,(life-age)*2));
        dummy.updateMatrix();
        mesh.setMatrixAt(visible++, dummy.matrix);
      }
      mesh.count = visible;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
