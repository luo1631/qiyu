import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatDrift, sampleHull } from '../src/scene/PondSurface';
import { BoatMotion, boatHelm, boatCruiseSpeed, clearSegment, distance, planWaterRoute, safe } from '../src/scene/navigation';
import { BoatWander } from '../src/scene/pond-life';
import { boatContactMaterial } from '../src/scene/collision';
import { boatStart, worldBounds, worldDestinations, worldObstacles } from '../src/scene/world-layout';

const flat={dx:0,dz:0},calm={x:0,z:0};
const open={left:-1000,right:1000,top:-1000,bottom:1000};
function boat(position={x:0,y:0}) {
  const motion=new BoatMotion(position);motion.helm=boatHelm;motion.collisionMaterial=boatContactMaterial;return motion;
}

test('wind drift builds with loaded mass, persists after a gust and stays bounded at any frame rate',()=>{
  const run=(mass:number,fps:number)=>{
    const body=new BoatDrift(mass);
    for(let n=0;n<fps*2;n++)body.update(flat,{x:1,z:0},1/fps);
    const gust=body.velocity.x;body.update(flat,calm,1/fps);
    assert.ok(body.velocity.x>gust*.98,'a stopped gust does not instantly remove momentum');
    for(let n=0;n<fps*60;n++)body.update(flat,calm,1/fps);
    assert.ok(Math.hypot(body.velocity.x,body.velocity.z)<1e-7,'water drag eventually dissipates drift');
    return gust;
  };
  assert.ok(run(180,60)<run(45,60)*.5,'the loaded hull accelerates less than a light hull');
  assert.ok(Math.abs(run(180,30)-run(180,60))<1e-10);
  const extreme=new BoatDrift();
  for(let n=0;n<3600;n++){
    extreme.update({dx:-100,dz:70},{x:20,z:15},1/60);
    assert.ok(Math.hypot(extreme.velocity.x,extreme.velocity.z)<=.0700001,'overlapping waves cannot accumulate unbounded drift');
  }
});

test('wave pressure moves the actual idle hull and opposing footprint slopes cancel',()=>{
  const drift=new BoatDrift(),motion=boat();
  for(let n=0;n<600;n++){
    drift.update({dx:-.04,dz:.02},calm,1/60);
    motion.setDriftVelocity({x:drift.velocity.x*100,y:drift.velocity.z*100});
    motion.update(1/60,boatCruiseSpeed,[],open);
  }
  assert.ok(motion.position.x>15&&motion.position.y<-7,'drift changes navigation coordinates, not only the displayed model');
  assert.ok(motion.position.x<40&&motion.position.y>-20,'a gentle wave cannot fling the boat across the pond');
  const symmetric=sampleHull((x,z)=>({height:.05,dx:x*.1,dz:z*.1}),0,0,0,-1,0),still=new BoatDrift();
  still.update(symmetric,calm,10);assert.deepEqual(still.velocity,calm);
});

test('click navigation takes over drift without a jump and reaches every dock with no residual drift',()=>{
  for(const dt of [1/30,1/60])for(const goal of Object.values(worldDestinations).map(d=>d.dock)){
    const motion=boat(boatStart);motion.angle=-.3;motion.velocity={x:-6,y:-22};motion.setDriftVelocity({x:2.6,y:.9});
    const before={position:{...motion.position},velocity:{...motion.velocity},angle:motion.angle,rate:motion.yawRate};
    motion.releaseDrift();const route=planWaterRoute(motion.position,goal,worldObstacles,worldBounds);motion.setRoute(route);
    assert.deepEqual({position:motion.position,velocity:motion.velocity,angle:motion.angle,rate:motion.yawRate},before);
    let arrived=false;
    for(let n=0;n<180/dt&&!arrived;n++){
      const p={...motion.position};arrived=motion.update(dt,boatCruiseSpeed,worldObstacles,worldBounds);
      assert.ok(clearSegment(p,motion.position,worldObstacles,worldBounds));
    }
    assert.ok(arrived,JSON.stringify({dt,goal,position:motion.position}));assert.ok(distance(motion.position,route.at(-1)!)<2.2);
    assert.deepEqual(motion.velocity,{x:0,y:0});assert.deepEqual(motion.driftVelocity,{x:0,y:0});
    const dock={...motion.position};for(let n=0;n<120;n++)motion.update(dt,boatCruiseSpeed,worldObstacles,worldBounds);
    assert.deepEqual(motion.position,dock,'opened panels cannot leave the boat sliding away');
  }
});

test('shore contact removes inward drift while preserving tangential sliding',()=>{
  const motion=boat({x:9.95,y:0}),bounds={...open,right:10};motion.setDriftVelocity({x:4,y:2});
  motion.update(1/60,boatCruiseSpeed,[],bounds);
  assert.ok(motion.collisions>0&&motion.position.x<=10);
  assert.ok(Math.abs(motion.driftVelocity.x)<1e-9&&motion.driftVelocity.y===2);
  for(let n=0;n<120;n++)motion.update(1/60,boatCruiseSpeed,[],bounds);
  assert.ok(motion.position.y>2&&motion.position.x<=10);
});

test('releasing thrust preserves inertia and water damps sideslip quicker than forward motion', () => {
  const run = (fps: number) => {
    const motion = boat(); motion.angle = 0; motion.velocity = { x: 18, y: -34 };
    let previous = Math.hypot(motion.velocity.x, motion.velocity.y);
    for (let n = 1; n <= 5 * fps; n++) {
      motion.update(1 / fps, boatCruiseSpeed, [], open);
      const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
      assert.ok(speed < previous);
      previous = speed;
    }
    assert.ok(motion.position.y < -100 && motion.position.x > 2 && motion.position.x < 8);
    assert.ok(motion.velocity.y < -10 && Math.abs(motion.velocity.x) < .01);
    return motion.position;
  };
  assert.ok(distance(run(30), run(60)) < 1e-7);
});

test('environmental drift preserves wandering safety at both frame rates',()=>{
  const run=(fps:number)=>{
    const motion=boat(boatStart),wander=new BoatWander(21),drift=new BoatDrift();
    for(let n=0;n<fps*120;n++)for(let sub=0;sub<60/fps;sub++){
      const t=n/fps+sub/60,before={...motion.position};
      drift.update({dx:.02*Math.sin(t*.6),dz:.01*Math.cos(t*.4)},{x:.94,z:.342},1/60);
      motion.setDriftVelocity({x:drift.velocity.x*100,y:drift.velocity.z*100});
      wander.update(motion,1/60,t,worldObstacles,worldBounds);
      drift.velocity.x=motion.driftVelocity.x/100;drift.velocity.z=motion.driftVelocity.y/100;
      assert.ok(safe(motion.position,worldObstacles,worldBounds)&&clearSegment(before,motion.position,worldObstacles,worldBounds));
    }
    assert.ok(wander.destinations>=2&&distance(motion.position,boatStart)>100);
    return motion.position;
  };
  assert.ok(distance(run(30),run(60))<.001,'drift and helm share the fixed navigation step');
});
