import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from 'three';
import { BoatMotion, boatHelm, distance, safe } from '../src/scene/navigation';
import { BoatWander, FishSchool, RippleField } from '../src/scene/pond-life';
import { HabitatLife } from '../src/scene/habitat-life';
import { fishObstacles, worldBounds, boatStart, worldObstacles } from '../src/scene/world-layout';
import { MotionExpression, SwimDrive } from '../src/scene/locomotion';
import { makeAquaticModels } from '../src/scene/PondCreatures';

test('hull retargets preserve momentum, bound angular acceleration and finish with no residual spin',()=>{
  const bounds={left:-2000,right:2000,top:-2000,bottom:2000};
  for(const dt of [1/30,1/60,.08]){
    const motion=new BoatMotion({x:0,y:0});motion.helm=boatHelm;motion.angle=Math.PI/2;motion.velocity={x:165,y:0};
    const target={x:-500,y:0};motion.setRoute([motion.position,target]);
    assert.deepEqual(motion.velocity,{x:165,y:0});
    let arrived=false,maxSide=0;
    for(let n=0;n<80/dt&&!arrived;n++){
      const rate=motion.yawRate,angle=motion.angle;
      arrived=motion.update(dt,165,[],bounds);
      assert.ok(Math.abs(motion.yawRate-rate)<=boatHelm.angularAcceleration*dt+1e-10);
      assert.ok(Math.abs(motion.angle-angle)<=boatHelm.turnRate*dt+1e-10);
      maxSide=Math.max(maxSide,Math.abs(motion.velocity.x*Math.cos(motion.angle)+motion.velocity.y*Math.sin(motion.angle)));
      const frozen=JSON.stringify(motion);motion.update(0,165,[],bounds);assert.equal(JSON.stringify(motion),frozen);
    }
    assert.ok(arrived&&distance(motion.position,target)<2.2);assert.equal(motion.yawRate,0);
    assert.ok(maxSide<10,'turning does not throw the hull sideways');
  }
});

test('cancelled travel resumes drifting immediately even inside the route retry interval',()=>{
  const motion=new BoatMotion(boatStart),wander=new BoatWander(18);motion.helm=boatHelm;motion.angle=-1.2;
  for(let n=0;n<15;n++)wander.update(motion,1/60,n/60,worldObstacles,worldBounds);
  motion.setRoute([motion.position,{x:0,y:0}]);
  for(let n=15;n<30;n++)motion.update(1/60,165,worldObstacles,worldBounds);
  const velocity={...motion.velocity};motion.route=[];wander.resume();assert.deepEqual(motion.velocity,velocity);
  for(let n=30;n<90;n++){
    const prior={...motion.position};wander.update(motion,1/60,n/60,worldObstacles,worldBounds);
    assert.ok(distance(prior,motion.position)>.001,'no artificial waiting after cancellation');
  }
});

test('nearby curiosity is temporary, obstacle-safe and does not teleport or interrupt scripted poses',()=>{
  const fish=new FishSchool(7,81,fishObstacles),life=new HabitatLife(),ripples=new RippleField();
  assert.equal(fish.notice(100,100,0),0);assert.equal(life.notice(100,100,0),0);
  const p=fish.poses[3],before={...p};
  fish.notice(p.x+.5,p.z,0);assert.equal(p.x,before.x);assert.equal(p.z,before.z);assert.equal(p.reaction,1);
  const targets=[life.turtles[0],life.frog];targets[0].mode='bask';targets[1].mode='jump';
  const poses=targets.map(p=>({...p}));
  life.notice(targets[0].x,targets[0].z,0,'turtle-0');life.notice(targets[1].x,targets[1].z,0,'frog');
  targets.forEach((p,i)=>assert.deepEqual({...p,reaction:undefined},{...poses[i],reaction:undefined}));
  const paused=JSON.stringify([fish.poses,life.turtles,life.frog]);fish.update(0,0,ripples,boatStart);life.update(0,0,ripples,boatStart);
  assert.equal(JSON.stringify([fish.poses,life.turtles,life.frog]),paused);
  for(let n=1;n<=600;n++){
    fish.update(1/60,n/60,ripples,boatStart);
    fish.poses.forEach(p=>assert.ok(safe({x:p.x*100,y:p.z*100},fishObstacles,worldBounds)));
  }
  assert.ok(p.reaction!<.001,'acknowledgement fades without repeated clicks');
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)>.2,'normal exploration continues');
});

test('expressions freeze with scene time, wrap yaw and animate both quality levels consistently',()=>{
  const expression=new MotionExpression();expression.sample({yaw:Math.PI-.01,speed:.2},0);
  expression.sample({yaw:-Math.PI+.01,speed:.2,reaction:1},.05);assert.ok(Math.abs(expression.turn)<.5);
  const frozen=JSON.stringify(expression);expression.sample({yaw:1,speed:1,reaction:0},.05);assert.equal(JSON.stringify(expression),frozen);
  const high=makeAquaticModels(false),low=makeAquaticModels(true),life=new HabitatLife();
  try{
    for(let n=0;n<60;n++)for(const models of [high,low]){
      models.turtles[0].update({...life.turtles[0],mode:'climb',y:.1,speed:.12,gait:n*.04,reaction:1},n/60);
      models.frog.update({...life.frog,speed:.3,gait:n*.1},n/60);
      models.tadpoles[0].update({...life.tadpoles[0],speed:.4,yaw:n*.01},n/60);
    }
    for(let i=0;i<4;i++){
      assert.deepEqual(high.turtles[0].limbs[i].rotation.toArray(),low.turtles[0].limbs[i].rotation.toArray());
      assert.deepEqual(high.frog.limbs[i].rotation.toArray(),low.frog.limbs[i].rotation.toArray());
    }
    assert.notEqual(high.turtles[0].limbs[0].position.y,high.turtles[0].limbs[1].position.y,'alternating stance and recovery');
    const fin=high.tadpoles[0].root.getObjectByName('FinTail') as Mesh,points=fin.geometry.attributes.position;
    const prior=Array.from(points.array);high.tadpoles[0].update({...life.tadpoles[0],speed:.4,yaw:.59},59/60);
    assert.deepEqual(Array.from(points.array),prior,'paused tail does not continue oscillating');
    high.tadpoles[0].update({...life.tadpoles[0],speed:.4,yaw:.6},1);
    assert.notDeepEqual(Array.from(points.array),prior,'tail membrane bends between frames');assert.equal(points.getX(0),prior[0],'tail root stays attached');
  }finally{high.dispose();low.dispose();}
});

test('koi and turtles take a forward arc as their first stroke begins a wide turn',()=>{
  const bounds={left:-1000,right:1000,top:-1000,bottom:1000};
  for(const kind of ['koi','turtle'] as const) for(const side of [-1,1]){
    const motion=new BoatMotion({x:0,y:0});
    motion.angle=0;motion.swim=new SwimDrive(kind);
    motion.setRoute([motion.position,{x:250*side,y:250}]);
    for(let n=0;n<48;n++)motion.update(1/60,kind==='koi'?34:24,[],bounds,2.2,3.5,1.2);
    assert.ok(side*motion.angle>.55 && side*motion.angle<.95);
    assert.ok(side*motion.position.x>2 && motion.position.y<-5,'the wide turn moves forward and inward before the swimmer faces its target');
  }
});
