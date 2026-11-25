import {test} from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import {makePondBanks} from '../src/scene/PondBanks';
import {outerBankHeight,outerShoreDistance,lifeScale,pondRim,rimRadius} from '../src/scene/shore-layout';
import {makeIslandTerrainSurface,makePondFloorGeometry,makeTerrainMap,pondFloorHeightAt,terrainHeightMin,terrainHeightRange,terrainSize} from '../src/scene/PondTerrain';
import {shoreContains} from '../src/scene/PondWakeField';
import {isOpenPondWater} from '../src/scene/paper-wake';
import {boatCollisionRadius,boatScale,worldBounds,worldObstacles,koiObstacles,islandShores,reservedIslandSites,pondFraming} from '../src/scene/world-layout';
import {safe,clearSegment,planWaterRoute} from '../src/scene/navigation';

test('island depth sampling includes faces on a planar top bound', () => {
  const geometry = new BoxGeometry(2, .85, 2, 8, 1, 8);
  const material = new MeshBasicMaterial();
  const island = new Mesh(geometry, material);
  const terrain = makeIslandTerrainSurface([{ mesh: island, x: 0, z: 0 }]);
  try {
    for (const [x, z] of [[0, 0], [.25, -.25], [.83, .43], [-.61, -.72]]) {
      assert.equal(terrain.heightAt(x, z), -.06, 'the dry crown lifts the bed right up to the island');
      assert.equal(terrain.containsLand(x, z), true, 'wake boundary follows the visible bank');
    }
    assert.equal(terrain.heightAt(2, 0), pondFloorHeightAt(2, 0), 'open water retains its original bed');
    assert.equal(terrain.containsLand(1.01, .35), false, 'extended bed does not narrow the wet passage');
  } finally {
    terrain.dispose(); geometry.dispose(); material.dispose();
  }
});

test('one complete outer rim encloses the pond while its central waterway stays clear',()=>{
  for(const [x,z] of [[0,-15],[-16,-7],[16,0],[12,11],[0,14],[-14,10]]) {
    assert.ok(outerBankHeight(x,z)>0);assert.ok(shoreContains(x,z));
    assert.equal(isOpenPondWater(x,z,100,100,0),false,'land cannot launch boats or paper waves');
  }
  for(const [x,z] of [[0,-11],[13,0],[0,10]])assert.ok(outerShoreDistance(x,z)<0,'the previous inner rim is now water');
  for(const [x,z] of [[0,6],[-4,5],[0,0]]){
    assert.ok(outerBankHeight(x,z)<-1);assert.equal(shoreContains(x,z),false);
    assert.ok(isOpenPondWater(x,z,100,100,0));
  }
  assert.ok(clearSegment({x:260,y:-600},{x:260,y:600},worldObstacles,worldBounds),
    'the east side of the middle lotus retains a straight channel for the hull');
});

test('shallow shelves continuously reach the deep bed and retain depths below forty centimetres',()=>{
  for(let i=0;i<48;i++){
    const a=i/48*Math.PI*2,r=rimRadius(a);
    let previous=0;
    for(let inward=0;inward<=4.5;inward+=.05){
      const radius=r-inward/pondRim.rz;
      const x=pondRim.x+Math.cos(a)*pondRim.rx*radius,z=pondRim.z+Math.sin(a)*pondRim.rz*radius;
      const height=pondFloorHeightAt(x,z);
      assert.ok(Math.abs(height-previous)<.07,'no shelf-to-bed step');
      if(inward<2)assert.ok(height<=previous+1e-6,'the shallow approach deepens toward the pond');
      previous=height;
    }
    assert.ok(previous< -1.04,'the shelf reaches fish-safe deep water');
  }
  const middle=pondFloorHeightAt(0,0);
  assert.ok(middle< -1.7,'the extra depth belongs to the central basin');
  for(let i=0;i<48;i++){
    const p={...pondRim},a=i/48*Math.PI*2,r=rimRadius(a)-2/pondRim.rz;
    const shallow=pondFloorHeightAt(p.x+Math.cos(a)*p.rx*r,p.z+Math.sin(a)*p.rz*r);
    assert.ok(shallow>-.80&&shallow>middle+.80,'the shoreline stays substantially shallower than the centre');
  }
  const map=makeTerrainMap();
  try{
    const {width,height,data}=map.image;let shallow=0,deep=0;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const wx=(x/(width-1)-.5)*terrainSize,wz=(y/(height-1)-.5)*terrainSize;
      const actual=pondFloorHeightAt(wx,wz),decoded=terrainHeightMin+data[(y*width+x)*4]/255*terrainHeightRange;
      assert.ok(Math.abs(actual-decoded)<terrainHeightRange/255,'water shading retains the rendered depth');
      if(actual<-.02&&actual>-.35)shallow++;
      if(actual< -1)deep++;
    }
    assert.ok(shallow>100&&deep>1000,'the map includes both the near-shore gradient and deep water');
  }finally{map.dispose();}
});

test('seven island footprints fit with boat-width channels and visible expansion sites',()=>{
  const sites=[...islandShores,...reservedIslandSites];assert.equal(sites.length,7);
  for(let i=0;i<sites.length;i++)for(let j=i+1;j<sites.length;j++){
    const a=sites[i],b=sites[j],gap=Math.hypot(a.x-b.x,a.z-b.z)-Math.max(a.rx,a.rz)-Math.max(b.rx,b.rz);
    assert.ok(gap>boatCollisionRadius*2+.15,'all island pairs leave a hull-width channel plus clearance');
  }
  for(const [w,h] of [[1440,900],[390,844],[844,390]]){
    const f=pondFraming(w,h),camera=new PerspectiveCamera(f.fov,w/h,.1,1200);
    camera.position.set(...f.position);camera.lookAt(0,.5,0);camera.updateMatrixWorld();
    for(const site of reservedIslandSites)for(let i=0;i<64;i++){
      const a=i/64*Math.PI*2,x=site.x+Math.cos(a)*site.rx,z=site.z+Math.sin(a)*site.rz;
      assert.ok(outerShoreDistance(x,z)< -boatCollisionRadius,'future island perimeter stays inside water');
      const p=new Vector3(x,.3,z).project(camera);
      assert.ok(Math.abs(p.x)<.96&&Math.abs(p.y)<.96,'reserved land footprint fits the camera');
    }
  }
});

test('rendered shore, wave mask and navigation agree, including rounded land joins and deep-fish clearance',()=>{
  let land=0,water=0;
  for(let x=-16;x<=16;x+=.16)for(let z=-13;z<=13;z+=.16){
    const d=outerShoreDistance(x,z),y=outerBankHeight(x,z);
    if(d>0){land++;assert.ok(shoreContains(x,z));}
    if(d<0)water++;
    const p={x:x*100,y:z*100};
    if(safe(p,worldObstacles,worldBounds))assert.ok(d < -boatCollisionRadius+.01,'boat envelope never overlaps the bank');
    if(safe(p,koiObstacles,worldBounds))assert.ok(y< -1.04,'deep fish have vertical clearance from the sediment slope');
    assert.ok(Math.abs(y-outerBankHeight(x+.025,z))<.07,'no cliffs at merged bank seams');
  }
  assert.ok(land>1000&&water>1000);
  for(const goal of [{x:0,y:-950},{x:1250,y:0},{x:1000,y:950}]){
    const route=planWaterRoute({x:0,y:500},goal,worldObstacles,worldBounds);
    assert.ok(route.length>1);
    for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i],worldObstacles,worldBounds));
  }
});

test('bank mesh has upward finite faces, a continuous wet slope and matching visitor scale',()=>{
  const banks=makePondBanks();
  try{
    const mesh=banks.group.getObjectByName('ContinuousOuterBank') as Mesh;
    const p=mesh.geometry.attributes.position,normal=mesh.geometry.attributes.normal,index=mesh.geometry.index!;
    const a=new Vector3(),b=new Vector3(),c=new Vector3();
    for(let i=0;i<index.count;i+=3){
      a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));
      assert.ok(b.sub(a).cross(c.sub(a)).y>0,'no inverted or collapsed bank triangles');
    }
    for(const value of normal.array)assert.ok(Number.isFinite(value));
    for(let i=0;i<p.count;i+=29)assert.ok(Math.abs(p.getY(i)-outerBankHeight(p.getX(i),p.getZ(i)))<1e-5);
    const floor=makePondFloorGeometry();
    try{
      const fp=floor.attributes.position,fi=floor.index!;
      for(let i=0;i<fi.count;i+=3){
        a.fromBufferAttribute(fp,fi.getX(i));b.fromBufferAttribute(fp,fi.getX(i+1));c.fromBufferAttribute(fp,fi.getX(i+2));
        assert.ok(b.sub(a).cross(c.sub(a)).y>0,'no inverted or collapsed floor faces');
      }
      for(let i=0;i<256;i++){
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(fp,fp.count-256+i);
        assert.ok(a.distanceTo(b)<1e-6,'bank and floor share every shoreline vertex');
      }
    }finally{floor.dispose();}
    assert.equal(lifeScale,.75);
    assert.ok(Math.abs(boatScale-.585*1.2)<1e-9);
    assert.ok(Math.abs(boatCollisionRadius-1.05*1.2)<1e-9);
  }finally{banks.dispose();}
});
