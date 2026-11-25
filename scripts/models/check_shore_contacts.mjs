/** Sample the staged bank meshes, lakebed and deep-koi navigation envelope. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makePondHabitat } from '../../src/scene/PondHabitat.ts';
import { makeIslandTerrainSurface, pondFloorHeightAt } from '../../src/scene/PondTerrain.ts';
import { animalIsland } from '../../src/scene/habitat-layout.ts';
import { boatCollisionRadius, islandScale, islandHeightScale, islandShores, koiObstacles, worldDestinations, worldIslands, worldBounds } from '../../src/scene/world-layout.ts';
import { safe } from '../../src/scene/navigation.ts';
import { makeShoreLandscape, shoreGroveSites } from '../../src/scene/shore-landscape.ts';
import { outerBankHeight, outerShoreDistance, shorePoint } from '../../src/scene/shore-layout.ts';
import { waterLevel } from '../../src/scene/PondOptics.ts';
import { reservedIslandSites } from '../../src/scene/world-layout.ts';
import { loadShorePlantKit } from './load_shore_plants.mjs';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [option,worldPath]=process.argv.slice(2);
if(option==='--world'&&!worldPath)throw new Error('--world requires a GLB path');
const document=await io.read(resolve(option==='--world'?worldPath:'public/models/pond-world.glb'));
for(const node of document.getRoot().listNodes()){
  const island=worldIslands.find(i=>node.getName()==='island-'+i.id);
  if(island)node.setTranslation([island.x,-.04,island.z]).setScale([islandScale,islandHeightScale,islandScale]);
}
const material=new MeshBasicMaterial({side:DoubleSide}),banks=[],landings=new Map();
for(const node of document.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const materialName=primitive.getMaterial()?.getName(),isBank=materialName==='BankPigment';
  const isLanding=materialName==='LandingWood'||materialName==='LandingGlass';
  if(!isBank&&!isLanding)continue;
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
  if(primitive.getIndices())geometry.setIndex(new BufferAttribute(primitive.getIndices().getArray(),1));
  const mesh=new Mesh(geometry,material);mesh.name=node.getName();mesh.matrixAutoUpdate=false;
  mesh.matrix.copy(new Matrix4().fromArray(node.getWorldMatrix()));mesh.updateMatrixWorld(true);
  if(isBank)banks.push(mesh);else landings.set(mesh.name,mesh);
}
if(banks.length!==worldIslands.length)throw new Error('Missing staged bank meshes');
// Geometry, root support and reserved space are objective checks; these do not
// assert that the sampled art direction is aesthetically approved.
const plantKit=await loadShorePlantKit(),sample=makeShoreLandscape(plantKit.group);
try {
  for(const root of sample.group.userData.plantRoots) {
    if(Math.abs(root.y-outerBankHeight(root.x,root.z))>1e-6)throw new Error('Landscape root floats above the bank');
    if(root.zone==='WaterSedges'&&!(root.y<0&&root.y>-.1))throw new Error('Water sedge is not rooted in shallow water');
    if(safe({x:root.x*100,y:root.z*100},koiObstacles,worldBounds))throw new Error('Shore planting occupies a deep-fish channel');
    for(const site of reservedIslandSites)if(Math.hypot((root.x-site.x)/site.rx,(root.z-site.z)/site.rz)<1.4)throw new Error('Landscape occupies a reserved island approach');
  }
  for(const site of shoreGroveSites){const p=shorePoint(site.angle,-site.outward);if(outerShoreDistance(p.x,p.z)<1.4)throw new Error('Grove reaches the wet bank');}
}finally{sample.dispose();plantKit.dispose();}
const habitat=makePondHabitat();habitat.group.updateMatrixWorld();
banks.push(habitat.group.getObjectByName('AnimalIsland'));
const terrain=makeIslandTerrainSurface(banks.map(mesh=>{
  const island=worldIslands.find(i=>mesh.name.startsWith(i.id+'_'))??animalIsland;
  return {mesh,x:island.x,z:island.z};
}));
const ray=new Raycaster(),down=new Vector3(0,-1,0),report=[],landingReport=[];
for(const island of worldIslands){
  const timber=landings.get(`${island.id}_LandingWood`),pane=landings.get(`${island.id}_LandingGlass`);
  if(!timber||!pane)throw new Error('Missing authored landing: '+island.id);
  const box=new Box3().setFromObject(timber),center=new Box3().setFromObject(pane).getCenter(new Vector3());
  const shore=banks.find(bank=>bank.name.startsWith(island.id+'_'));
  const timberPosition=timber.geometry.attributes.position,point=new Vector3(),feet=new Map();
  let bankOverlap=0;
  for(let i=0;i<timberPosition.count;i++){
    point.fromBufferAttribute(timberPosition,i).applyMatrix4(timber.matrixWorld);
    if(point.y<box.min.y+.001){
      const key=`${point.x.toFixed(4)},${point.z.toFixed(4)}`;
      feet.set(key,terrain.heightAt(point.x,point.z)-point.y);
    }
    if(point.y>.065&&point.y<.29){
      ray.set(new Vector3(point.x,1,point.z),down);
      const hit=ray.intersectObject(shore,false)[0];
      if(hit?.point.y>=point.y-.012)bankOverlap++;
    }
  }
  const pileEmbedment=Math.min(...feet.values());
  const {dock}=worldDestinations[island.id],berth=box.clampPoint(new Vector3(dock.x/100,.1,dock.y/100),new Vector3());
  const hullClearance=Math.hypot(berth.x-dock.x/100,berth.z-dock.y/100)-boatCollisionRadius;
  ray.set(new Vector3(center.x,center.y,center.z),down);
  const postGap=center.y-ray.intersectObject(timber,false)[0]?.point.y;
  if(feet.size<24||pileEmbedment<.04||!bankOverlap||!(postGap>.09&&postGap<.16)||hullClearance<.04) {
    throw new Error('Landing contact or berth clearance failed: '+JSON.stringify({island:island.id,feet:feet.size,pileEmbedment,bankOverlap,postGap,hullClearance}));
  }
  landingReport.push({island:island.id,pileEmbedment,hullClearance,bankOverlap});
}
for(const [index,obstacle] of koiObstacles.slice(0,islandShores.length).entries()){
  let maximumSurface=-Infinity,highest,samples=0;
  const otherObstacles=koiObstacles.filter((_,i)=>i!==index);
  for(let i=0;i<128;i++){
    const a=i/128*Math.PI*2;
    // Only the accessible arc can be occupied by a fish; the outer bank or a
    // neighbouring island may already exclude the rest of this ellipse.
    if(!safe({x:obstacle.x+Math.cos(a)*obstacle.rx,y:obstacle.y+Math.sin(a)*obstacle.ry},otherObstacles,worldBounds))continue;
    samples++;
    // Move inward by a full 48 cm tail envelope, not just the fish's centre.
    const x=obstacle.x/100+Math.cos(a)*(obstacle.rx/100-.48);
    const z=obstacle.y/100+Math.sin(a)*(obstacle.ry/100-.48);
    ray.set(new Vector3(x,4,z),down);
    const hit=ray.intersectObjects(banks,false)[0];
    const bed=terrain.heightAt(x,z),surface=Math.max(bed,hit?.point.y??-Infinity);
    if(surface>maximumSurface)highest={x,z,mesh:bed>=(hit?.point.y??-Infinity)?'lakebed':hit.object.name};
    maximumSurface=Math.max(maximumSurface,surface);
  }
  const clearance=-1.05-maximumSurface;
  report.push({island:worldIslands[index]?.id??'animals',samples,maximumSurface,deepFinClearance:clearance,highest});
  if(samples<24)throw new Error('No usable fish passage around island');
  if(clearance<0)throw new Error('Deep koi intersects shore: '+JSON.stringify(report.at(-1)));
}
for(const [index,shore] of islandShores.entries()){
  let uplift=0,maxStep=0,landSamples=0;
  const bank=worldIslands[index] ? banks.find(mesh=>mesh.name===`${worldIslands[index].id}_BankPigment`) : banks.at(-1);
  for(let angle=0;angle<64;angle++){
    const a=angle/64*Math.PI*2;
    const x=shore.x+Math.cos(a)*shore.rx*1.25,z=shore.z+Math.sin(a)*shore.rz*1.25;
    uplift+=terrain.heightAt(x,z)-pondFloorHeightAt(x,z);
    for(let radius=.58;radius<1.10;radius+=.035){
      const px=shore.x+Math.cos(a)*shore.rx*radius,pz=shore.z+Math.sin(a)*shore.rz*radius;
      ray.set(new Vector3(px,4,pz),down);
      const altitude=ray.intersectObject(bank,false)[0]?.point.y??-Infinity;
      if(Math.abs(altitude-waterLevel)<.0001)continue;
      const dry=altitude>waterLevel;
      if(terrain.containsLand(px,pz)!==dry)throw new Error('Wake mask disagrees with the bank: '+bank.name);
      if(dry)landSamples++;
    }
    let previous;
    for(let radius=1;radius<2.8;radius+=.025){
      const height=terrain.heightAt(shore.x+Math.cos(a)*shore.rx*radius,shore.z+Math.sin(a)*shore.rz*radius);
      if(previous!==undefined)maxStep=Math.max(maxStep,Math.abs(height-previous));previous=height;
    }
  }
  report[index].meanBedUplift=uplift/64;report[index].maxRadialStep=maxStep;
  report[index].dryShoreSamples=landSamples;
  if(uplift/64<.15||maxStep>.14)throw new Error('Island does not merge into the bed: '+JSON.stringify(report[index]));
}
terrain.dispose();
for(const bank of banks.slice(0,-1))bank.geometry.dispose();material.dispose();habitat.dispose();
for(const mesh of landings.values())mesh.geometry.dispose();
if(option&&option!=='--world')writeFileSync(resolve(option),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({banks:report,landings:landingReport},null,2));
