import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoatMotion, boatHelm, boatCruiseSpeed, clearSegment, distance, planWaterRoute, safe } from '../src/scene/navigation';
import { boatContactMaterial } from '../src/scene/collision';
import { boatStart, worldBounds, worldDestinations, worldObstacles } from '../src/scene/world-layout';
import { isOpenPondWater } from '../src/scene/paper-wake';

const openBounds={left:-3000,right:3000,top:-3000,bottom:3000};
const wanderSpeed = 14.5;

function rearwardTurn(dt:number,maxSpeed:number,initialSpeed:number){
  const motion=new BoatMotion({x:0,y:0});motion.helm=boatHelm;motion.angle=0;motion.velocity={x:0,y:-initialSpeed};
  const goal={x:0,y:400};motion.setRoute([motion.position,goal]);
  const wander=maxSpeed===wanderSpeed, samples:{position:{x:number;y:number};angle:number;speed:number}[]=[];
  let arrived=false,travel=0,quarterTravel=0,quarterDisplacement=0,earlyTravel=0,totalTurn=0;
  for(let n=1;n<=100/dt&&!arrived;n++){
    const position={...motion.position},angle=motion.angle,rate=motion.yawRate;
    arrived=motion.update(dt,maxSpeed,[],openBounds,wander ? .85 : 2.5,1.1,wander ? .55 : 0);
    const step=distance(position,motion.position),speed=Math.hypot(motion.velocity.x,motion.velocity.y);
    travel+=step;totalTurn+=Math.abs(motion.angle-angle);
    assert.ok(Math.abs(motion.yawRate-rate)<=boatHelm.angularAcceleration*dt+1e-9);
    assert.ok(Math.abs(motion.angle-angle)<=boatHelm.turnRate*dt+1e-9);
    assert.ok(step<=(Math.max(initialSpeed,maxSpeed)+.01)*dt,'the arc comes from velocity, without position jumps');
    if(n*dt>=2 && !earlyTravel)earlyTravel=travel;
    if(!quarterTravel && motion.angle>=Math.PI/2){quarterTravel=travel;quarterDisplacement=distance({x:0,y:0},motion.position);}
    if(n*dt>=2 && motion.angle<Math.PI/2){
      assert.ok(speed>maxSpeed*.45,'the first quarter-turn retains visible forward speed');
      const forward=motion.velocity.x*Math.sin(motion.angle)-motion.velocity.y*Math.cos(motion.angle);
      assert.ok(forward>speed*.99,'headway follows the bow instead of sliding the hull sideways');
    }
    if(n%Math.round(1/dt)===0)samples.push({position:{...motion.position},angle:motion.angle,speed});
  }
  assert.ok(arrived);assert.equal(motion.yawRate,0);assert.ok(distance(motion.position,goal)<2.2);
  // A 280 cm hull rotating 90 degrees inside a 95 cm displacement still looks
  // like a pivot. Require a moving arc spanning most of a hull length.
  assert.ok(quarterTravel>200,'90 degrees of steering covers at least 2 m of water');
  assert.ok(quarterDisplacement>180,'the hull leaves its starting footprint during the turn');
  assert.ok(earlyTravel>maxSpeed*.4,'starting from rest makes measurable headway within two seconds');
  assert.ok(totalTurn<Math.PI*2,'arrival does not add another full orbit');
  return samples;
}

test('water targets preserve reachable points and resolve shores, bounds and disconnected corners',()=>{
  for(const goal of [{x:0,y:-235},{x:-100,y:-250},{x:300,y:0}]){
    const route=planWaterRoute(boatStart,goal,worldObstacles,worldBounds);
    assert.deepEqual(route.at(-1),goal);
  }
  const requests=[{x:0,y:0},{x:-840,y:660},{x:800,y:660},{x:-757.99,y:628.19},{x:-737.5,y:660},
    {x:1500,y:-1500},{x:-1500,y:1500},...worldObstacles.flatMap(o=>Array.from({length:12},(_,i)=>({x:o.x+o.rx*.9*Math.cos(i*Math.PI/6),y:o.y+o.ry*.9*Math.sin(i*Math.PI/6)})))];
  for(const requested of requests){
    const route=planWaterRoute(boatStart,requested,worldObstacles,worldBounds);
    assert.ok(route.length>1,'a shore or isolated corner resolves to navigable water');
    assert.ok(safe(route.at(-1)!,worldObstacles,worldBounds,7.99));
    for(let i=1;i<route.length;i++)assert.ok(clearSegment(route[i-1],route[i],worldObstacles,worldBounds));
  }
  assert.deepEqual(planWaterRoute(boatStart,{x:NaN,y:0},worldObstacles,worldBounds),[]);
  assert.equal(isOpenPondWater(.6,0,0,0),false,'paper waves still exclude the hull');
  assert.equal(isOpenPondWater(.6,0,0,0,0),true,'actual free water beside the hull can be selected');
});

test('a click route cruises at 37.5 centimetres per second in open water', () => {
  const motion = new BoatMotion({ x: 0, y: 0 });
  motion.helm = boatHelm; motion.angle = 0;
  motion.setRoute([motion.position, { x: 0, y: -800 }]);
  for (let n = 0; n < 600; n++) motion.update(1 / 60, boatCruiseSpeed, [], openBounds);
  const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
  assert.ok(speed > 37.4 && speed <= 37.5);
});

test('stationary and cruising U-turns make a hull-sized arc at travel and wander speeds',()=>{
  for(const maxSpeed of [boatCruiseSpeed,wanderSpeed])for(const initialSpeed of [0,maxSpeed]){
    const slow=rearwardTurn(1/30,maxSpeed,initialSpeed),fast=rearwardTurn(1/60,maxSpeed,initialSpeed);
    assert.equal(slow.length,fast.length,'arrival time stays within one frame');
    for(let n=0;n<slow.length;n++){
      assert.ok(distance(slow[n].position,fast[n].position)<.01,'30 and 60 FPS follow the same water trajectory');
      assert.ok(Math.abs(slow[n].angle-fast[n].angle)<1e-6);
      assert.ok(Math.abs(slow[n].speed-fast[n].speed)<1e-6);
    }
  }
  rearwardTurn(.08,boatCruiseSpeed,0);
});

test('small-angle close targets settle directly without circling the endpoint',()=>{
  for(const dt of [1/30,1/60])for(const goal of [{x:2,y:-20},{x:-2,y:-20},{x:0,y:-8}]){
    const motion=new BoatMotion({x:0,y:0});motion.helm=boatHelm;motion.angle=0;motion.setRoute([motion.position,goal]);
    let arrived=false,travel=0,totalTurn=0;
    for(let n=0;n<20/dt&&!arrived;n++){
      const p={...motion.position},angle=motion.angle;arrived=motion.update(dt,boatCruiseSpeed,[],openBounds);
      travel+=distance(p,motion.position);totalTurn+=Math.abs(motion.angle-angle);
      assert.ok(motion.position.y>=goal.y-2.2,'braking does not carry the boat past the arrival area');
    }
    assert.ok(arrived);assert.ok(distance(motion.position,goal)<2.2);
    assert.ok(travel<distance({x:0,y:0},goal)*1.1,'approach does not become a loop');
    assert.ok(totalTurn<.5,'a six-degree correction does not rotate the whole hull around');
    assert.deepEqual(motion.velocity,{x:0,y:0});assert.equal(motion.yawRate,0);
  }
});

test('shore approaches contract the turn safely and finish instead of stalling or orbiting',()=>{
  const cases=[
    {start:boatStart,requested:{x:-800,y:640},angle:-1.2},
    {start:boatStart,requested:{x:0,y:635},angle:-.3},
    {start:worldDestinations.about.dock,requested:{x:0,y:500},angle:-.3,departureTime:42},
  ];
  for(const dt of [1/30,1/60,.08])for(const {start,requested,angle,departureTime} of cases){
    const motion=new BoatMotion(start);motion.helm=boatHelm;motion.collisionMaterial=boatContactMaterial;motion.angle=angle;
    const route=planWaterRoute(start,requested,worldObstacles,worldBounds),goal=route.at(-1)!;motion.setRoute(route);
    let arrived=false,lastApproachTurn=0,slowTurn=0,enteredApproach=false,backing=0;
    const limit=departureTime??100;
    for(let n=0;n<limit/dt&&!arrived;n++){
      const p={...motion.position},angle=motion.angle;
      if(distance(p,goal)<40)enteredApproach=true;
      arrived=motion.update(dt,boatCruiseSpeed,worldObstacles,worldBounds);
      assert.ok(safe(motion.position,worldObstacles,worldBounds));
      assert.ok(clearSegment(p,motion.position,worldObstacles,worldBounds),'the entire travelled segment clears the hull-expanded banks');
      assert.ok(distance(p,motion.position)<=(boatCruiseSpeed+.01)*dt,'contacts do not teleport the hull');
      const fore=motion.velocity.x*Math.sin(motion.angle)-motion.velocity.y*Math.cos(motion.angle);
      if(fore<-5)backing+=distance(p,motion.position);
      if(enteredApproach)lastApproachTurn+=Math.abs(motion.angle-angle);
      if(distance(p,motion.position)<3*dt)slowTurn+=Math.abs(motion.angle-angle);
    }
    assert.ok(arrived,JSON.stringify({start,requested,dt}));assert.ok(distance(motion.position,goal)<2.2);
    assert.ok(lastApproachTurn<Math.PI*2,'a nearby shore target does not require repeated arrival circles');
    assert.ok(slowTurn<.11,'near-stationary hulls do not accumulate a turn against the bank');
    if(distance(start,goal)<25)assert.ok(lastApproachTurn<.15,'a nearby target behind the hull uses a short paddle stroke');
    if(departureTime)assert.ok(backing>70&&motion.collisions===0,'the dock turn backs into clear water before advancing');
    assert.equal(motion.yawRate,0);assert.deepEqual(motion.velocity,{x:0,y:0});
  }
});

test('successive water commands keep velocity and spin, and sail around islands to adjusted endpoints',()=>{
  const motion=new BoatMotion(boatStart);motion.helm=boatHelm;motion.collisionMaterial=boatContactMaterial;motion.angle=-1.2;
  for(const goal of [{x:0,y:-500},{x:-800,y:640},{x:790,y:-700},{x:0,y:400}]){
    const before={position:{...motion.position},velocity:{...motion.velocity},angle:motion.angle,rate:motion.yawRate};
    const route=planWaterRoute(motion.position,goal,worldObstacles,worldBounds);motion.setRoute(route);
    assert.deepEqual({position:motion.position,velocity:motion.velocity,angle:motion.angle,rate:motion.yawRate},before);
    for(let n=0;n<45;n++)motion.update(1/60,boatCruiseSpeed,worldObstacles,worldBounds);
  }
  const goal={x:0,y:-500},route=planWaterRoute(motion.position,goal,worldObstacles,worldBounds);motion.setRoute(route);
  let arrived=false;
  for(let n=0;n<12000&&!arrived;n++){
    const p={...motion.position};arrived=motion.update(1/60,boatCruiseSpeed,worldObstacles,worldBounds);
    assert.ok(clearSegment(p,motion.position,worldObstacles,worldBounds));
  }
  assert.ok(arrived);assert.ok(distance(motion.position,route.at(-1)!)<2.2);assert.equal(motion.yawRate,0);
});
