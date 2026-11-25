import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three';
import { outerBankHeight, outerShoreDistance, shorePlantingBeds, shorePoint } from './shore-layout';
import { seededRandom } from './pond-life';
import { stoneGeometry, weatherStone } from './stone-geometry';
import { disposeSculpture } from './PondCreatures';
import { placePlantClumps } from './shore-plant-geometry';
import type { PlantClump, PlantKind } from './shore-plant-geometry';
import { habitatPoint } from './habitat-layout';

export function islandGround(shore: Mesh) {
  const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  shore.updateWorldMatrix(true, false);
  return (x: number, z: number) => {
    ray.ray.origin.set(x, 3, z);
    return ray.intersectObject(shore, false)[0]?.point.y ?? -.20;
  };
}

export function makeSanctuaryGroundcover(kit: Object3D, shore: Mesh, low = false) {
  const patches = [
    {kind:'medium', x:-.67, z:-.56, scale:.42, heightScale:.74, spread:[.70,.74], angle:.90, zone:'Shoulder'},
    {kind:'small', x:-.36, z:-.61, scale:.37, heightScale:.84, spread:[.78,.72], angle:2.20, zone:'Shoulder'},
    {kind:'small', x:-.83, z:-.44, scale:.33, heightScale:.65, angle:4.90, zone:'Shoulder'},
    {kind:'small', x:-.78, z:-.28, scale:.34, heightScale:.61, spread:[.72,.77], angle:1.88, zone:'Shoulder'},
    {kind:'small', x:-.96, z:-.18, scale:.36, heightScale:.68, angle:3.70, zone:'StoneEdges'},
    {kind:'small', x:-1.03, z:.18, scale:.28, heightScale:.59, angle:3.05, zone:'StoneEdges'},
    {kind:'medium', x:.88, z:-.251, scale:.29, heightScale:.82, spread:[.58,.54], angle:3.88, zone:'StoneEdges'},
    {kind:'small', x:.41, z:-.63, scale:.32, heightScale:.72, angle:1.47, zone:'StoneEdges'},
    {kind:'small', x:1.015, z:-.071, scale:.30, heightScale:.69, spread:[.74,.77], angle:3.70, zone:'StoneEdges'},
    {kind:'small', x:1.01, z:.20, scale:.32, heightScale:.56, angle:5.30, zone:'StoneEdges'},
    {kind:'cover',x:-.37,z:-.42,scale:.29,angle:2.9,zone:'Shoulder'},
    {kind:'flowers',x:.42,z:-.37,scale:.36,angle:.52,zone:'Shoulder'},
    {kind:'cover',x:.37,z:-.57,scale:.41,angle:4.13,zone:'Shoulder'},
    {kind:'medium',x:.56,z:-.39,scale:.40,heightScale:.72,angle:1.54,zone:'Shoulder'},
    {kind:'cover',x:.60,z:.17,scale:.38,angle:4.67,zone:'StoneEdges'},
    {kind:'flowers',x:.64,z:.16,scale:.27,angle:2.04,zone:'StoneEdges'},
  ] satisfies PlantClump[];
  const compactRoots = { small:3,medium:6,cover:2,flowers:1 };
  const placements = patches.map(patch => {
    const kind = low && patch.kind === 'flowers' && patch.zone === 'StoneEdges' ? 'small' : patch.kind;
    return { ...patch, kind, ...habitatPoint(patch.x, patch.z), maxRoots: low ? compactRoots[kind] : undefined, rootDepth: .018 };
  });
  const cover = placePlantClumps(kit, placements, islandGround(shore), low);
  cover.group.name = 'SanctuaryGroundcover';
  for (const mesh of cover.grassyCasters) mesh.castShadow = !low;
  return {group: cover.group, update: cover.update, dispose() { cover.dispose(); disposeSculpture(cover.group); }};
}

export function makeShoreLandscape(plantKit: Object3D, low = false) {
  const group=new Group();group.name='RearShoreLandscape';
  const random=seededRandom(93117),object=new Object3D();
  const placements:PlantClump[]=[];
  type Planting = readonly [kind: PlantKind, bearing: number, outward: number, scale: number, width?: number, heightScale?: number];
  const lay = (zone: string, tint: Color, plants: readonly Planting[]) => {
    for (const [kind, bearing, outward, scale, width, heightScale] of plants) {
      const p = shorePoint(bearing, -outward);
      const next = shorePoint(bearing + .005, -outward);
      const yaw = width ? -Math.atan2(next.z - p.z, next.x - p.x) + (random() - .5) * .44 : random() * Math.PI * 2;
      placements.push({ ...p, kind, scale, angle: yaw, zone, tint, heightScale,
        spread: width ? [width, .77] : undefined });
    }
  };
  const meadow = new Color(.94, 1.00, .86), shade = new Color(.85, .94, .89);
  const dryGrass = new Color(1.02, 1.00, .85), reeds = new Color(.76, .90, .83);
  // Two interlocking groups follow the tree roots. Keep the low meadow open
  // where the shore bends away between the trunks and the stones.
  lay('FarBankMeadow', shade, [
    ['large', 3.61, 2.68, 1.00], ['large', 3.74, 2.12, .89, 1.28],
    ['large', 3.95, 3.10, .93, 1.34], ['medium', 4.05, 2.45, .73],
    ['medium', 3.85, 4.10, .76], ['medium', 4.23, 3.43, .53, 1.28],
  ]);
  lay('ShoreShrubs', shade, [
    ['open', 3.64, 2.76, .78], ['spreading', 3.69, 1.43, .94], ['compact', 3.90, 2.59, .90],
    ['spreading', 4.03, 1.80, .78], ['open', 4.20, 3.67, .63],
  ]);
  lay('NearBankGrass', meadow, [
    ['medium', 3.53, .94, .79, 1.28], ['small', 3.58, .33, .62, 1.43],
    ['medium', 3.71, .89, .77, 1.29], ['small', 3.74, .33, .53, 1.42],
    ['medium', 3.93, 1.23, .74], ['small', 4.01, .63, .49, 1.35],
    ['small', 4.02, .20, .44], ['small', 4.26, 1.51, .53, 1.34],
  ]);
  // On the east side, lower grass runs down between the stones. A deeper bed
  // behind the spreading tree leaves the centre of the distant bank open.
  lay('FarBankMeadow', meadow, [
    ['small', 5.25, 2.20, .63, 1.25], ['medium', 5.35, 1.47, .74, 1.33],
    ['large', 5.53, 2.63, .93], ['medium', 5.63, 2.78, .76, 1.24],
    ['small', 5.78, 2.13, .59, 1.28],
  ]);
  lay('ShoreShrubs', meadow, [
    ['spreading', 5.41, 1.69, .83], ['compact', 5.60, 2.35, .85], ['open', 5.75, 2.05, .61],
  ]);
  lay('NearBankGrass', dryGrass, [
    ['small', 5.27, .92, .57, 1.24], ['medium', 5.37, .59, .73, 1.48],
    ['small', 5.46, .32, .47, 1.29], ['medium', 5.65, .87, .76],
    ['small', 5.69, .32, .51, 1.48], ['small', 5.74, .58, .47, 1.15],
    ['small', 5.97, 1.43, .56, 1.35],
  ]);
  lay('WaterSedges', reeds, [
    ['small', 3.54, -.35, .43, 1.60], ['small', 3.82, -.36, .46, 1.50],
    ['small', 4.07, -.32, .39, 1.65], ['small', 5.39, -.34, .50, 1.70],
    ['small', 5.66, -.34, .44, 1.72],
  ]);
  // Low mats carry the bankside colour into selected breaks in the sand.
  const groundcover = new Color(.85, .94, .86), wildflowers = new Color(1.02, .99, .94);
  lay('BankGroundcover', groundcover, [
    ['cover', 3.57, 1.50, .96, 1], ['cover', 3.73, .79, .91, 1], ['cover', 3.97, 1.53, .98, 1],
    ['cover', 4.28, .88, 1.08, 1], ['cover', 4.35, 1.09, .78, 1], ['cover', 4.96, 1.01, 1.15, 1],
    ['cover', 5.01, 1.02, .92, 1], ['cover', 5.43, .85, .92, 1], ['cover', 5.58, 1.14, 1.05, 1],
    ['cover', 6.19, .79, .82, 1], ['cover', 6.26, .91, 1.14, 1],
    ['cover', .31, .76, 1.25, 1], ['cover', .39, .87, 1.05, 1], ['cover', .58, 1.23, 1.03, 1],
    ['cover', .80, .87, 1.05, 1], ['cover', 1.14, 1.54, .94, 1], ['cover', 1.88, 1.43, 1.16, 1],
    ['cover', 1.96, .84, 1.02, 1], ['cover', 2.34, .98, .84, 1], ['cover', 2.83, 1.18, 1.23, 1],
    ['cover', 2.90, .94, .85, 1],
  ]);
  lay('NearBankFlowers', wildflowers, [
    ['flowers', .55, 1.71, .93, 1], ['flowers', 1.38, 1.97, .78, 1], ['flowers', 2.48, 1.32, .91, 1],
    ['flowers', 3.54, 1.52, .72, 1], ['flowers', 4.19, 1.48, .91, 1], ['flowers', 5.30, 1.57, .84, 1],
  ]);
  // The front clusters are low and angled along the curve. Between them the
  // approach to the boat is open water and a broad patch of wet sand.
  lay('ForegroundGrass', dryGrass, [
    ['medium', .87, .87, .79, 1.55], ['small', .94, .41, .52, 1.37],
    ['medium', 1.13, 1.32, .69, 1.59], ['small', 1.28, .64, .53, 1.61],
    ['medium', 2.10, 1.26, .75, 1.50], ['small', 2.23, .42, .55, 1.50],
    ['medium', 2.35, .84, .83, 1.39], ['small', 2.53, .68, .49, 1.34],
  ]);
  lay('ForegroundShrubs', shade, [['spreading', .93, 1.00, .72], ['open', 2.29, 1.41, .68]]);
  lay('NearBankGrass', meadow, [
    ['medium', 3.12, 1.19, .66, 1.30, .82], ['small', 3.20, .79, .52, 1.29],
    ['medium', 3.46, 1.15, .67, 1.38], ['small', 3.50, .68, .43],
    ['medium', 4.39, .96, .68, 1.57, .78], ['small', 4.47, .63, .47, 1.31],
    ['medium', 4.88, 1.11, .65, 1.40], ['small', 4.96, .52, .45, 1.23],
    ['medium', 5.92, .92, .69, 1.39], ['small', 6.04, .74, .54, 1.24],
    ['medium', .23, 1.12, .70, 1.35, .82], ['small', .32, .64, .48, 1.35],
  ]);
  lay('FarBankMeadow', shade, [
    ['large', 3.19, 2.14, .83, 1.22], ['medium', 3.23, 2.73, .64],
    ['large', 4.41, 2.31, .84, 1.33], ['medium', 4.58, 2.48, .73],
    ['large', 4.92, 2.56, .79, 1.35], ['large', 5.96, 2.21, .81, 1.29],
  ]);
  lay('ShoreShrubs', shade, [
    ['spreading', 3.22, 1.72, .86], ['compact', 3.45, 2.78, .88],
    ['open', 4.46, 2.90, .83], ['spreading', 4.75, 2.14, .73, undefined, .70],
    ['spreading', 5.96, 1.83, 1.00], ['compact', .25, 2.11, .71],
  ]);
  lay('ForegroundGrass', dryGrass, [
    ['medium', .70, 1.24, .72, 1.39, .83], ['small', .78, .59, .51, 1.53],
    ['medium', 1.43, 1.48, .63, 1.31, .83], ['small', 1.95, .90, .49, 1.30],
    ['medium', 2.58, 1.37, .76, 1.45], ['small', 2.70, .78, .49, 1.45],
  ]);
  // Cover forms the centre of each bed; the grasses taper into the open land and sand.
  // Alternate the angles and offsets so the beds have unequal arms and gaps.
  shorePlantingBeds.forEach(({ angle, outward, span, depth, flowers }, index) => {
    const side = index % 2 ? -1 : 1;
    const sweep = side * span;
    const tone = flowers ? meadow : shade;
    lay('OuterBankBeds', tone, [
      ['cover', angle - sweep * .31, outward - depth * .26, 1.06 + random() * .34, 1],
      ['cover', angle - sweep * .13, outward - depth * .14, 1.18, 1],
      ['small', angle + sweep * .34, outward + depth * .14, .73, 1.39, .83],
      ['small', angle - sweep * .46, outward + depth * .32, .65, 1.23, .86],
      ['medium', angle + sweep * .12, outward + depth * .43, .66 + random() * .12, 1.40, .81],
    ]);
    lay('OuterBankBeds', flowers ? wildflowers : groundcover, [
      [flowers ? 'flowers' : 'cover', angle + sweep * .26, outward - depth * .25, .82 + random() * .19, 1.24],
    ]);
  });
  const plants=placePlantClumps(plantKit,placements,outerBankHeight,low);group.add(plants.group);
  const roots=plants.group.userData.plantRoots as {x:number;y:number;z:number;zone:string}[];
  // Keep the existing stone variations independent of the number of plants.
  const stoneRandom=seededRandom(2596444063);
  for(let kind=0;kind<3;kind++) {
    const rocks=new InstancedMesh(stoneGeometry(kind),weatherStone(new MeshStandardMaterial({color:'#b9b7ad',vertexColors:true,roughness:.91})),5);rocks.name='ShoreClusterStones-'+kind;
    for(let i=0;i<5;i++) {
      const a=[3.54,3.89,4.27,4.47,4.56][i]+kind*.017,d=-.15+kind*.19,p=shorePoint(a,-d),s=.15+stoneRandom()*.25;
      object.position.set(p.x,outerBankHeight(p.x,p.z)-s*.13,p.z);object.scale.set(s*1.4,s*.70,s);object.rotation.set(.08,stoneRandom()*6.28,.06);object.updateMatrix();rocks.setMatrixAt(i,object.matrix);
    }rocks.castShadow=rocks.receiveShadow=true;group.add(rocks);
  }
  group.userData.plantRoots=roots;
  group.userData.zoneCounts=plants.group.userData.zoneCounts;group.userData.clumps=placements;
  group.userData.minWaterClearance=Math.min(...roots.filter(r=>r.zone==='WaterSedges').map(r=>-outerShoreDistance(r.x,r.z)));
  return {group,update:plants.update, setGrassShadows(enabled:boolean){
    for (const mesh of plants.grassyCasters) mesh.castShadow = enabled;
  }, dispose(){plants.dispose();disposeSculpture(group);}};
}
