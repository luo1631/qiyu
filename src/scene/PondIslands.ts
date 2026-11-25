import {
  Box3, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, MathUtils,
  LatheGeometry, Mesh, MeshStandardMaterial, TorusGeometry, Vector2, Vector3,
} from 'three';
import type { Object3D } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { disposeSculpture, Sculpture } from './PondCreatures';
import { makePondPavilion } from './PondPavilion';
import { makePondStoneLanterns } from './PondStoneLantern';
import { makePondFireflies } from './PondFireflies';
import { waterLevel } from './PondOptics';
import { pondFloorHeightAt } from './PondTerrain';
import { islandGround } from './shore-landscape';
import { placePlantClumps } from './shore-plant-geometry';
import type { PlantClump, PlantKind } from './shore-plant-geometry';
import { stoneGeometry, weatherStone } from './stone-geometry';
import { makeIslandPine, makeIslandWillow, makePeachPetals, makePeachTree } from './island-trees';
import type { SurfaceSampler } from './PondSurface';
import { worldMaterial } from './world-material';
import { islandScale, worldIslands } from './world-layout';
import type { PondCameraTarget } from './PondCamera';

type Site = (typeof worldIslands)[number];
type Ground = (x: number, z: number) => number;
export type IslandPlay = Site['scenery'];
const bankNoise = new ImprovedNoise();
const sightlines: Record<IslandPlay, PondCameraTarget> = {
  blossoms: { lookAt: [-.45,1.58,-.23], offset: [2.95,6.32,6.6] },
  lamps: { lookAt: [-.18,.86,-.06], offset: [1.93,3.45,4.01] },
  chimes: { lookAt: [-.06,1.10,-.07], offset: [-1.65,3.55,4.01] },
};

export function islandView(scenery: IslandPlay): PondCameraTarget {
  const site = worldIslands.find(island => island.scenery === scenery)!;
  const view = sightlines[scenery], [x,y,z] = view.lookAt;
  return { lookAt: [site.x+x,y,site.z+z], offset: view.offset };
}

const bankSection = [
  [.16,.30], [.32,.29], [.46,.26], [.58,.23], [.70,.17], [.79,.105], [.86,.053],
  [.94,waterLevel], [1.03,-.11], [1.16,-.26], [1.28,-.46], [1.42,-.73], [1.58,-1.10], [1.72,-1.65],
];

function makeBank(site: Site, phase: number) {
  const segments = 128, rx = site.rx * islandScale, rz = site.rz * islandScale;
  const positions = [0, .30, 0], indices: number[] = [];
  const sand = new Color('#bcab8d'), moss = new Color('#849865'), fern = new Color('#5e7b54');
  const grit = new Color('#99896f');
  const color = new Color(), colors = moss.toArray();
  for (const [row, [r, y]] of bankSection.entries()) {
    for (let i = 0; i < segments; i++) {
      const a = i / segments * Math.PI * 2;
      const local = 1 + .057 * Math.sin(a * 3 + phase) + .027 * Math.cos(a * 5 - phase)
        - .108 * Math.max(0, Math.cos(a - phase)) ** 8;
      const relief = .059 * MathUtils.smoothstep(y, .004, .26) * Math.sin(a * 2 + phase) * Math.sin(r * 2.67);
      const x = Math.cos(a)*r*rx*local, z = Math.sin(a)*r*rz*local;
      const toe = MathUtils.smoothstep(r,1.18,1.71);
      const mossHollows = bankNoise.noise(x*1.17,z*1.22,phase*6.8);
      const siltRidges = .035 * bankNoise.noise(x * 2.7, z * 2.3, phase * 4.1)
        * MathUtils.smoothstep(y, .013, .08) * (1 - MathUtils.smoothstep(y, .156, .239));
      const surface = toe ? MathUtils.lerp(y,Math.min(y,pondFloorHeightAt(site.x+x,site.z+z)-.11),toe)
        : y + relief + siltRidges + .045 * mossHollows * MathUtils.smoothstep(y, .045, .22);
      positions.push(x, surface, z);
      const patch = .16 * Math.sin(a * 4 + r * 8 + phase) + .10 * Math.cos(a * 9 - r * 13) + .22*mossHollows;
      const growth = 1 - MathUtils.smoothstep(r + patch, .49, .89);
      const lean = bankNoise.noise(x * 2.8, z * 2.8, phase * 3.6);
      color.copy(sand).lerp(grit,MathUtils.smoothstep(-.08,.50,mossHollows)*.35)
        .lerp(moss, growth).lerp(fern, growth*MathUtils.smoothstep(-.32,.43,lean)*.62);
      colors.push(color.r, color.g, color.b);
      const n = 1 + row * segments + i, next = 1 + row * segments + (i+1) % segments;
      if (row === 0) indices.push(0, next, n);
      else indices.push(n-segments, next-segments, n, next-segments, next, n);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const bank = new Mesh(geometry, new MeshStandardMaterial({ name: 'BankPigment', vertexColors: true, roughness: .97 }));
  bank.name = site.id + '_BankPigment';
  bank.receiveShadow = true;
  return bank;
}

function stones(site: Site, ground: Ground) {
  const batch = new Sculpture(), rx = site.rx * islandScale, rz = site.rz * islandScale;
  const shapes = site.scenery === 'blossoms'
    ? [[2.02,.69,.22,.12],[2.17,.70,.30,.10],[2.37,.69,.25,.095],[2.53,.74,.18,.07],[-1.9,.74,.33,.23],[-2.08,.9,.18,.12],[-1.87,1.22,.21,.15],
      [1.34,1.05,.17,.054],[1.62,1.03,.18,.056],[1.83,.95,.17,.07]]
    : (site.scenery === 'lamps'
      ? [[-.61,-.27,.29,.19],[-.72,-.18,.37,.16],[-.78,-.06,.34,.11],[-.68,.25,.27,.10],[-.17,.63,.18,.075],
        [.07,.57,.18,.08],[.36,.50,.16,.068],[.60,.43,.19,.06],[.76,.36,.17,.052],[.68,-.65,.22,.11],[.52,-.72,.19,.11]]
      : [[-.72,.17,.24,.20],[-.67,.52,.31,.24],[-.48,.62,.23,.13],[-.22,.67,.18,.10],[.54,-.51,.24,.22],[.70,-.48,.19,.13],[.72,.14,.16,.09],[.83,.28,.122,.07]])
      .map(([x,z,width,height]) => [x*rx,z*rz,width,height]);
  shapes.forEach(([x,z,width,height], i) => {
    batch.add(stoneGeometry(i), '#aea78c', [x, ground(site.x+x,site.z+z)-height*.23, z],
      [width,height,width*(.62 + .25*Math.sin(i*2.8)**2)], [0,i*1.59,.07*Math.cos(i*2)]);
  });
  return batch.mesh('ShoreStones', weatherStone(new MeshStandardMaterial({ color: '#beb4a3', vertexColors: true, roughness: .95 })));
}

function gardenStones(site: Site, ground: Ground) {
  const garden = new Sculpture(true);
  const flagstones = site.scenery === 'blossoms'
    ? [[-1.91,1.53,.226,.071,1.72],[-1.48,1.71,.274,.058,.79],[-.97,1.81,.256,.073,2.36],
      [-.44,1.78,.264,.066,.28],[.03,1.64,.258,.069,1.34],[.47,1.43,.238,.074,1.97],
      [-1.83,.35,.411,.23,1.99],[-2.19,.30,.33,.16,.32],[-2.02,-.02,.31,.16,1.7],
      [.96,-1.28,.38,.24,1.09],[1.26,-1.42,.24,.16,2.8]]
    : site.scenery === 'lamps'
      ? [[-.10,.77,.171,.052,.23],[-.30,.66,.184,.050,1.48],[-.44,.47,.178,.047,2.67],
        [-.79,-.10,.30,.19,1.27],[-.58,-.30,.27,.14,2.33]]
      : [[.31,.65,.175,.055,2.4],[.08,.75,.181,.049,.44],[-.19,.72,.188,.049,1.42],
        [-.54,.30,.32,.19,1.11],[-.75,.12,.26,.16,2.47]];
  flagstones.forEach(([x,z,breadth,depth,angle],i) => {
    const y = ground(site.x+x,site.z+z);
    if (y < .061) return;
    garden.add(stoneGeometry(i+1),'#a8ac9a',[x,y+depth*.037,z],[breadth,depth,breadth*(.69 + .15*Math.sin(i*2.3)**2)],
      [.064*Math.sin(i),angle,.074*Math.cos(i*2.7)]);
    if (depth < .09) return;
    for (let j=0;j<3;j++) {
      const a=j*2.39996+i*.81, dx=Math.sin(a)*breadth*.86, dz=Math.cos(a)*breadth*.68;
      const h = ground(site.x+x+dx,site.z+z+dz);
      const size=breadth*(.12+.08*Math.sin(a)**2);
      garden.add(stoneGeometry(i+j+3),'#82967b',[x+dx,h+.01,z+dz],[size,size*.61,size*.72],[.07,a,0]);
    }
  });
  return garden.mesh('GardenFlagstones',weatherStone(new MeshStandardMaterial({vertexColors:true,color:'#d4cbb6',roughness:.96})));
}

function makeWindChimes() {
  const group = new Group(), timber = new Sculpture(), beam = new Sculpture(), footing = new Sculpture();
  group.name = 'WindChimeStand';
  group.userData.pondIslandAction = 'chimes' satisfies IslandPlay;
  for (const x of [-.53,.53]) {
    footing.add(stoneGeometry(1), '#9fa58a', [x,.011,0], [.12,.078,.102], [0,x*1.61,0]);
    footing.add(new RoundedBoxGeometry(.145,.113,.137,2,.016), '#9ea68f', [x,.067,0]);
    timber.add(new CylinderGeometry(.037,.050,1.27,10), '#705743', [x,.68,0]);
    timber.add(new CylinderGeometry(.057,.061,.064,8), '#65584b', [x,.150,0]);
    timber.line([[x,1.015,0],[x*.90,1.17,0],[x*.66,1.269,0]], .023, '#967556', 6);
    timber.add(new RoundedBoxGeometry(.158,.062,.155,2,.009), '#807056', [x,1.304,0]);
    beam.oval([x,1.287,.071],[.023,.023,.010],'#68523d',undefined,7,5);
  }
  beam.add(new RoundedBoxGeometry(1.41,.094,.128,2,.010), '#795b47', [0,1.333,0]);
  beam.line([[-.73,1.450,0],[-.47,1.400,0],[0,1.384,0],[.47,1.400,0],[.73,1.450,0]], .035, '#9c7959', 18);
  beam.line([[-.59,1.320,.064],[-.27,1.319,.066],[.23,1.319,.066],[.59,1.320,.064]], .006, '#a17d56', 10);
  const wood = (name: string) => worldMaterial(new MeshStandardMaterial({ name,vertexColors:true,roughness:.84 })) as MeshStandardMaterial;
  group.add(timber.mesh('CedarChimeStand',wood('PavilionTimber')),beam.mesh('ChimeCrossbeam',wood('Wood')),
    footing.mesh('ChimeFootings',weatherStone(new MeshStandardMaterial({vertexColors:true,roughness:.96}))));
  const brass = new MeshStandardMaterial({ vertexColors: true, color: '#e9ce9f', metalness: .28, roughness: .39, side: DoubleSide });
  const cord = new MeshStandardMaterial({vertexColors:true,roughness:.91});
  const pendulums: Group[] = [], tubes = [.22,.33,.44,.29,.20], tones = [698.46,880,1046.50,1318.51,1396.91];
  for (const [i, length] of tubes.entries()) {
    const pivot = new Group(), rope = new Sculpture(), tube = new Sculpture();
    pivot.position.set((i-2)*.164,1.277,Math.cos(i*1.85)*.025);
    const drop = .11 + (i%2)*.043;
    rope.line([[0,0,0],[0,-drop,0]], .006, '#5f533d', 2);
    const profile = [[.020,0],[.027,0],[.030,.014],[.026,.030],[.023,length-.040],[.027,length-.016],
      [.024,length],[.020,length],[.017,length-.036],[.018,.017],[.020,0]];
    const surface = new LatheGeometry(profile.map(([r,y])=>new Vector2(r,y)),14);
    tube.add(surface, i%2 ? '#b59255' : '#ba9d65', [0,-drop-length,0]);
    for (const y of [-drop-.013,-drop-length+.009,-drop-length+.023]) {
      tube.add(new TorusGeometry(.0245,.0024,5,14), '#e1bb7d',[0,y,0],[1,1,1],[Math.PI/2,0,0]);
    }
    pivot.add(rope.mesh('ChimeCord',cord),tube.mesh('BrassChime',brass));
    pendulums.push(pivot);
    group.add(pivot);
  }
  const sail = new Group(), line = new Sculpture();
  sail.name = 'ChimeWindCatcher';
  sail.position.set(.025,1.28,.065);
  line.line([[0,0,0],[0,-.71,0]],.0044,'#574d3d',7);
  line.oval([0,-.462,0],[.040,.016,.040],'#8d6a43',undefined,9,5);
  line.add(new RoundedBoxGeometry(.086,.183,.023,2,.009),'#8caaa1',[0,-.78,0],[1,1,1],[.13,0,.04]);
  line.line([[0,-.710,.016],[.018,-.765,.018],[-.01,-.847,.009]],.004,'#86c0b1',7);
  sail.add(line.mesh('JadeWindCatcher',cord));
  group.add(sail);
  let struck = -Infinity, lastSound = -Infinity, audio: AudioContext | undefined;
  const ring = (time: number) => {
    struck = time;
    const now = performance.now();
    if (now - lastSound < 300 || typeof AudioContext === 'undefined') return;
    const pattern = [2,4,1].map((step, i) => tones[(step + Math.floor(now / 300) % 3 + i) % tones.length]);
    lastSound = now;
    try {
      const context = audio ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => {});
      pattern.forEach((frequency, i) => {
        const start = context.currentTime + .025 + i*.065;
        const bell = context.createOscillator(), envelope = context.createGain();
        bell.type = 'sine';
        bell.frequency.value = frequency;
        envelope.gain.setValueAtTime(.001, start);
        envelope.gain.exponentialRampToValueAtTime(.053 - i*.009, start+.012);
        envelope.gain.exponentialRampToValueAtTime(.0001, start+.58+i*.08);
        bell.connect(envelope).connect(context.destination);
        bell.start(start);
        bell.stop(start+.63+i*.08);
      });
    } catch { /* Animation works on devices without a usable audio output. */ }
  };
  return { group, ring, update(time: number, moving: boolean) {
    const age = time - struck;
    const strength = moving && age < 5 ? Math.exp(-age*.93) : 0;
    pendulums.forEach((pivot, i) => {
      pivot.rotation.set(Math.sin(time*1.30+i)*.027 + (strength ? Math.sin(age*11+i*.57)*strength*.44 : 0),
        0, Math.cos(time*1.56+i)*.036 + (strength ? Math.sin(age*9.8+i*.34)*strength*.29 : 0));
    });
    sail.rotation.set(Math.sin(time*1.60)*.045 + (strength ? Math.sin(age*8.3)*strength*.37 : 0),
      Math.sin(time*1.13)*.27 + (strength ? Math.sin(age*5.1)*strength*.71 : 0),Math.cos(time*1.54)*.051);
  }, dispose() { if (audio) void audio.close().catch(() => {}); } };
}

function addIslandPlants(site: Site, ground: Ground, kit: Object3D, compact: boolean) {
  const patches: [PlantKind, number, number, number][] = site.scenery === 'blossoms'
    ? [['flowers',-1.71,.67,.49],['cover',-1.40,.57,.53],['open',-2.09,-.44,.40],
      ['spreading',-1.67,-1.11,.40],['flowers',-.69,-1.52,.47],['cover',.27,-1.13,.43],
      ['medium',1.58,-.85,.48],['small',1.95,-.38,.35],['cover',-.98,1.48,.46],
      ['flowers',-.54,1.43,.40],['small',.32,1.18,.48],['compact',2.21,.38,.36],
      ['cover',-2.24,.58,.59],['medium',-2.19,.86,.44],['flowers',-1.61,1.16,.44],['cover',-1.63,1.06,.50],
      ['spreading',-.78,-1.16,.53],['cover',-.70,-1.32,.47],['flowers',-.32,-1.21,.35],['medium',.90,-1.55,.57],
      ['cover',1.31,-1.29,.54],['flowers',1.56,-1.21,.39],['small',1.85,.57,.40],['cover',1.96,.72,.54],
      ['flowers',1.40,1.27,.39],['cover',.68,1.68,.41],['medium',-.28,2.04,.42],['flowers',-1.24,2.05,.44]]
    : [['cover',-.53,.1,.28],['flowers',-.39,.44,.29],['small',-.51,-.32,.32],['medium',.53,-.42,.36],
      ['small',.59,.24,.29],['flowers',.18,.54,.28],['cover',-.58,.54,.40],['medium',-.56,-.09,.36],
      ['cover',.42,.50,.33],['flowers',-.48,-.34,.39],['small',.24,-.51,.31],['spreading',-.27,-.59,.31]];
  const placements = patches.map(([kind,x,z,scale], i): PlantClump => ({
    kind, x: site.x+x, z: site.z+z, scale, angle: .7 + i*1.65, zone: site.id, rootDepth: .015,
  }));
  return placePlantClumps(kit, placements, ground, compact);
}

export function makePondIslands(plantKit: Object3D, compact = false) {
  const group = new Group(), effects = new Group();
  group.name = 'PondIslands';
  effects.name = 'IslandEffects';
  const fireflies = makePondFireflies();
  effects.add(fireflies.points);
  const plots = worldIslands.map((site, i) => {
    const island = new Group();
    island.name = 'island-' + site.scenery;
    island.userData.pondViewingSite = site.scenery;
    if (site.scenery !== 'blossoms') island.userData.pondIslandAction = site.scenery;
    island.position.set(site.x, 0, site.z);
    const bank = makeBank(site, [2.25,.44,4.65][i]);
    group.add(island);
    island.add(bank);
    const ground = islandGround(bank);
    const cover = addIslandPlants(site, ground, plantKit, compact);
    // The clump batches already use pond coordinates.
    effects.add(cover.group);
    island.add(stones(site, ground),gardenStones(site,ground));
    return { site, island, bank, ground, cover };
  });
  const plotFor = (scenery: IslandPlay) => plots.find(plot => plot.site.scenery === scenery)!;
  const place = (scenery: IslandPlay, object: Object3D, x: number, z: number, y = 0) => {
    const { island, site, ground } = plotFor(scenery);
    island.add(object);
    object.position.set(x, ground(site.x+x,site.z+z)+y, z);
  };

  const pavilion = makePondPavilion();
  pavilion.group.rotation.y = -.22;
  place('blossoms', pavilion.group, .91, .08, -.055);
  const peach = makePeachTree();
  peach.tree.userData.pondIslandAction = 'blossoms' satisfies IslandPlay;
  place('blossoms', peach.tree, -1.20, -.34);
  const petals = makePeachPetals(peach.tree.getWorldPosition(new Vector3()),plotFor('blossoms').ground);
  effects.add(petals.mesh);

  const pine = makeIslandPine();
  place('lamps', pine, -.40, -.25);
  const stonePlot = plotFor('lamps');
  const stoneLamps = makePondStoneLanterns((x,z) => stonePlot.ground(stonePlot.site.x+.12+x,stonePlot.site.z+.26+z));
  place('lamps', stoneLamps.group, .12, .26);

  const willow = makeIslandWillow();
  place('chimes', willow.tree, .32, -.27);
  const chimes = makeWindChimes();
  chimes.group.rotation.y = .34;
  place('chimes', chimes.group, -.19, .33);

  group.updateMatrixWorld(true);
  for (const { island } of plots) {
    const box = new Box3().setFromObject(island);
    island.raycast = raycaster => raycaster.ray.intersectsBox(box) ? undefined : false;
  }
  const counts = { blossoms: 0, lamps: 0, chimes: 0 };
  let lit: boolean | null = null, lampPower = 0, peachTap = -Infinity, chimeTap = -Infinity;
  const sway = (time: number, start: number) => Math.exp(-Math.max(0,time-start)*.92);
  return {
    group, effects, counts, fireflies: fireflies.points,
    banks: plots.map(({ bank, site }) => ({ mesh: bank, x: site.x, z: site.z })),
    play(action: IslandPlay, time: number, moving: boolean, night: boolean) {
      counts[action]++;
      if (action === 'blossoms' && moving) { peachTap = time; petals.scatter(time); }
      if (action === 'lamps') lit = !(lit ?? night);
      if (action === 'chimes') { chimeTap = moving ? time : -Infinity; chimes.ring(chimeTap); }
    },
    update(time: number, delta: number, power: number, night: number, pixelRatio: number, moving: boolean, sample: SurfaceSampler) {
      const dusk = Math.min(1, power / 3.5);
      const target = lit === null ? dusk : Number(lit);
      lampPower = moving && delta > 0 ? MathUtils.damp(lampPower,target,7,delta) : target;
      stoneLamps.update(lampPower,time);
      pavilion.update(time,power,moving ? sway(time,peachTap) : 0);
      peach.update(time,moving ? sway(time,peachTap) : 0);
      willow.update(time,moving ? sway(time,chimeTap)*.55 : 0);
      chimes.update(time, moving);
      fireflies.update(time,night,pixelRatio,moving ? sway(time,chimeTap) : 0);
      petals.update(time,sample);
      for (const { cover } of plots) cover.update(time);
    },
    dispose() {
      chimes.dispose();
      fireflies.dispose();
      plots.forEach(({ cover }) => cover.dispose());
      disposeSculpture(group);
      disposeSculpture(effects);
    },
  };
}
