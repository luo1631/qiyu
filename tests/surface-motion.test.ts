import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Mesh, TubeGeometry, Vector3 } from 'three';
import { BoatFloat, LilyPadFloat, makeSurfaceSpray, sampleHull, SwimmerFloat } from '../src/scene/PondSurface';
import { HabitatLife } from '../src/scene/habitat-life';
import { makePondHabitat } from '../src/scene/PondHabitat';
import { animalIsland, frogFootHeight, lilyPads } from '../src/scene/habitat-layout';
import { makeIslandTerrainSurface } from '../src/scene/PondTerrain';
import { RippleField } from '../src/scene/pond-life';
import { boatWorldScale } from '../src/scene/world-layout';

test('a water impact raises droplets and an ordinary reused ripple stays on the surface', () => {
  const ripples = new RippleField(), spray = makeSurfaceSpray(true);
  try {
    ripples.emit(1, -2, 3, .7, 'fish', 1, 0, .75);
    spray.update(ripples.events, 3.13);
    assert.ok(spray.mesh.visible && spray.mesh.count > 0 && spray.mesh.count <= 5);
    const transform = new Matrix4(), point = new Vector3();
    for (let i = 0; i < spray.mesh.count; i++) {
      spray.mesh.getMatrixAt(i, transform); point.setFromMatrixPosition(transform);
      assert.ok(point.y > .04 && point.distanceTo(new Vector3(1, 0, -2)) < .30);
    }
    spray.update(ripples.events, 3.52);
    assert.equal(spray.mesh.visible, false);
    for (let i = 0; i < ripples.events.length; i++) ripples.emit(0, 0, 4, .2, 'fish');
    spray.update(ripples.events, 4.12);
    assert.equal(spray.mesh.count, 0);
  } finally { spray.dispose(); }
});

test('a hull samples both ends and both sides with the correct local tilt', () => {
  const surface = (x:number,z:number) => ({height:.02+.015*x-.01*z,dx:.015,dz:-.01});
  for (const angle of [0,.5,1.2,Math.PI,4.7]) {
    const hx=Math.sin(angle),hz=-Math.cos(angle),pose=sampleHull(surface,1,2,hx,hz,0);
    assert.ok(Math.abs(pose.height-surface(1,2).height)<1e-9);
    assert.ok(Math.abs(Math.tan(pose.pitch)-(.015*hx-.01*hz))<1e-9);
    assert.ok(Math.abs(Math.tan(pose.roll)-(-.015*hz-.01*hx))<1e-9);
  }
  const narrow=(x:number,z:number)=>({height:Math.abs(z+.95*boatWorldScale)<.1?.03:0,dx:0,dz:0});
  const bow=sampleHull(narrow,0,0,0,-1,0);
  assert.ok(bow.height>0&&bow.pitch>0,'a crest at the bow lifts it even while the centre is calm');
});

test('swimmers damp wave motion by depth and settle at 30 and 60 FPS', () => {
  const response=(fps:number,depth:number)=>{
    const body=new SwimmerFloat();let peak=0;
    for(let i=0;i<fps*8;i++){
      const height=i<fps*2?.04*Math.sin(i/fps*2):0;
      body.update({height,dx:height*.8,dz:height*.5},depth,.7,1/fps);
      peak=Math.max(peak,Math.abs(body.heave.value));
    }
    assert.ok(Math.abs(body.heave.value)<1e-6&&Math.abs(body.pitch.value)<1e-6);
    return peak;
  };
  const shallow=response(60,.1),deep=response(60,1);
  assert.ok(shallow>deep*4&&shallow<.04);
  assert.ok(Math.abs(response(30,.1)-shallow)<.001);
  const grounded=new SwimmerFloat();
  for(let i=0;i<120;i++)grounded.update({height:1,dx:1,dz:1},0,0,1/60,0);
  assert.equal(grounded.heave.value,0);assert.equal(grounded.pitch.value,0);
});

test('loaded boats reject fast wave chatter but retain slow buoyancy and settle after repeated taps', () => {
  const response=(mass:number,frequency:number,fps:number)=>{
    const boat=new BoatFloat(mass);let peak=0;
    for(let i=0;i<fps*16;i++){
      boat.update({height:.04*Math.sin(i/fps*frequency),pitch:0,roll:0},1/fps);
      if(i>fps*8)peak=Math.max(peak,Math.abs(boat.heave.value));
    }
    return peak;
  };
  const slow=response(180,.5,60),fast=response(180,8,60),light=response(45,8,60);
  assert.ok(slow>.035&&fast<slow*.2,'slow level changes lift the boat, short crests mostly pass beneath');
  assert.ok(fast<light*.5,'a loaded boat responds less than a light one to the same short wave');
  assert.ok(Math.abs(response(180,8,30)-fast)<.0002,'render FPS cannot change effective mass');
  const tapped=new BoatFloat();let peak=0;
  for(let i=0;i<600;i++){
    for(let tap=0;tap<10;tap++)tapped.tap();
    tapped.update({height:0,pitch:0,roll:0},1/60);peak=Math.max(peak,Math.abs(tapped.roll.value));
  }
  assert.ok(peak<.09&&Math.abs(tapped.heave.value)<.03,'sustained tapping cannot pump the boat into large oscillations');
  for(let i=0;i<600;i++)tapped.update({height:0,pitch:0,roll:0},1/60);
  assert.ok(Math.abs(tapped.roll.value)<1e-6&&Math.abs(tapped.heave.value)<1e-6,'water drag removes stored motion');
});

test('frog landing and floating leaf share wave height while lotus roots remain fixed', () => {
  const sample=(_x:number,_z:number,t:number)=>({height:.045*Math.sin(t*1.3),dx:.05,dz:-.04});
  const habitat=makePondHabitat(true),life=new HabitatLife(21,sample,habitat.padSupport),ripples=new RippleField();
  const pad=lilyPads[0];Object.assign(life.frog,{x:pad.x,z:pad.z,mode:'rest',padIndex:0});
  const lotus=habitat.group.getObjectByName('Lotus-0')!,rootY=lotus.position.y;
  const bank=habitat.group.getObjectByName('AnimalIsland') as Mesh;
  const bed=makeIslandTerrainSurface([{mesh:bank,x:animalIsland.x,z:animalIsland.z}]);
  const stems=lilyPads.map((_,i)=>{
    const stem=habitat.group.getObjectByName('LilyStem-'+i) as Mesh;
    const position=stem.geometry.attributes.position;
    return {stem,position,baseY:stem.position.y,baseVertex:new Vector3().fromBufferAttribute(position,0)};
  });
  try{
    stems.forEach(({stem,baseVertex})=>{
      const root=baseVertex.clone().add(stem.position);
      assert.ok(root.y<bed.heightAt(root.x,root.z)-.025,'every floating stem starts under the modeled bed');
    });
    for(let i=0;i<3;i++) {
      const root=habitat.group.getObjectByName('Lotus-'+i)!.position;
      assert.ok(root.y<bed.heightAt(root.x,root.z)-.025,'flower pivots around a root in the bed');
    }
    for(let i=1;i<=120;i++){
      const time=i/60;habitat.updateSurface(time,0,sample);life.update(1/60,time,ripples,{x:-800,y:600});habitat.update(time,0,sample);
      const leaf=habitat.group.getObjectByName('LilyPad-0')!;
      assert.ok(Math.abs(life.frog.y+frogFootHeight-(leaf.position.y+.015))<1e-9,'no hovering or foot penetration');
      assert.equal(life.frog.x,leaf.position.x);assert.equal(life.frog.z,leaf.position.z);
      assert.ok(leaf.position.y<.038&&leaf.position.y>.004,'leaf remains near the surface');
      assert.equal(lotus.position.y,rootY);
    }
    stems.forEach(({stem,position,baseY,baseVertex},i)=>{
      const support=habitat.padSupport(i);
      assert.equal(stem.position.y,baseY);
      assert.ok(new Vector3().fromBufferAttribute(position,0).distanceTo(baseVertex)<.002,'the stem bend anchors its base');
      assert.ok(stem.geometry instanceof TubeGeometry);
      const sides=stem.geometry.parameters.radialSegments;
      const crown=new Vector3();
      for(let n=1;n<=sides;n++)crown.add(new Vector3().fromBufferAttribute(position,position.count-n));
      crown.multiplyScalar(1/sides).add(stem.position);
      assert.ok(crown.distanceTo(new Vector3(support.x,support.height,support.z))<.004,'the final tube ring follows the painted leaf centre');
      const normals=stem.geometry.attributes.normal;
      for(let n=0;n<normals.count;n++)assert.ok(Math.abs(new Vector3().fromBufferAttribute(normals,n).length()-1)<1e-5);
    });
    assert.ok(lotus.rotation.x>0&&lotus.rotation.z>0,'flower follows pressure direction around its rooted base');
    assert.ok(Math.hypot(life.frog.x-pad.x,life.frog.z-pad.z)>.002,'frog follows the leaf sideways');
  }finally{bed.dispose();habitat.dispose();}
});

test('tapping a lotus leaf dips the pressed side and returns to its rooted float', () => {
  const leaf = new LilyPadFloat(2,3);
  const water = {height:0,dx:0,dz:0}, wind = {x:0,z:0};
  leaf.tap(2.26,3);
  for (let i=0;i<23;i++) leaf.update(water,wind,1/60);
  assert.ok(leaf.support.dx < -.022 && leaf.support.dx > -.13);
  assert.ok(leaf.support.height < .04);
  assert.equal(leaf.support.dz,0);
  for (let i=0;i<140;i++) leaf.update(water,wind,1/60);
  assert.ok(Math.abs(leaf.support.height-.04)<.001);
  assert.ok(Math.abs(leaf.support.dx)<.001);
});

test('rooted leaves stay low under overlapping waves and bend with reversing wind and wave direction', () => {
  const leaf=new LilyPadFloat(2,3);
  for(let i=0;i<600;i++)leaf.update({height:10,dx:-8,dz:6},{x:1,z:0},1/60);
  assert.ok(leaf.support.height<=.052001&&leaf.support.height>.05,'even an extreme crest cannot launch a leaf');
  assert.ok(Math.hypot(leaf.support.x-2,leaf.support.z-3)<=.045001);
  assert.ok(leaf.support.x>2&&leaf.support.z<3,'pressure slope pushes in the incoming direction');
  for(let i=0;i<600;i++)leaf.update({height:0,dx:0,dz:0},{x:-1,z:0},1/60);
  assert.ok(leaf.support.x<1.99&&Math.abs(leaf.support.z-3)<.0001,'wind can bend a quiet leaf the other way');
  for(let i=0;i<600;i++)leaf.update({height:0,dx:0,dz:0},{x:0,z:0},1/60);
  assert.ok(Math.abs(leaf.support.height-.04)<1e-6&&Math.abs(leaf.support.x-2)<1e-6,'tether returns to rest after forcing ends');
});
