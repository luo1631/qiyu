import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3, BufferGeometry, Matrix4, Mesh, Quaternion, Raycaster, SkinnedMesh, Vector3} from 'three';
import {SwanLife,swanObstacles,dragonflyVisits} from '../src/scene/wildlife-life';
import {makePondWildlife} from '../src/scene/PondWildlife';
import {makeDragonfly} from '../src/scene/PondDragonfly';
import {makePondHabitat} from '../src/scene/PondHabitat';
import {clearSegment,safe} from '../src/scene/navigation';
import {boatCollisionRadius,boatDraft,worldBounds} from '../src/scene/world-layout';
import {lilyPads} from '../src/scene/habitat-layout';
import {PondBodyPhysics,bodyCores} from '../src/scene/body-physics';
import {BoatMotion} from '../src/scene/navigation';
import {RippleField} from '../src/scene/pond-life';
import {lifeScale} from '../src/scene/shore-layout';

test('swan traverses open pond at 30/60 FPS without crossing shores or pad supports',()=>{
  const results=[];
  for(const fps of [30,60]){
    const swan=new SwanLife();let distance=0;
    for(let n=1;n<=fps*240;n++){
      const before={...swan.motion.position};swan.update(1/fps,n/fps);
      assert.ok(clearSegment(before,swan.motion.position,swanObstacles,worldBounds));
      distance+=Math.hypot(before.x-swan.motion.position.x,before.y-swan.motion.position.y);
    }
    assert.ok(distance>1500&&swan.destinations>=4,'quiet gliding must still make progress');
    results.push(swan.motion.position);
  }
  assert.ok(Math.hypot(results[0].x-results[1].x,results[0].y-results[1].y)<8);
});
test('swan uses shared contacts when a boat blocks its initial path',()=>{
  const swan=new SwanLife(),boat=new BoatMotion({x:70,y:-160});
  const physics=new PondBodyPhysics([swan.body,{id:'boat',kind:'boat',motion:boat,pose:{x:.7,y:-.07,z:-1.6,pitch:0},cores:bodyCores('boat')}]);
  for(let n=1;n<7200;n++)swan.update(1/60,n/60);
  assert.ok(physics.contacts>0);assert.ok(safe(swan.motion.position,swanObstacles,worldBounds));
  assert.ok(swan.destinations>1,'boat avoidance must not strand the swan');physics.dispose();
});
test('swan starts making room for a boat before their paths meet beside the right lotus', () => {
  const swan = new SwanLife(false), boat = new BoatMotion({ x: 931, y: -366 });
  const start = { x: 919, y: boat.position.y - boatCollisionRadius * 100 - 4 };
  swan.motion.position = start;
  swan.motion.angle = 2.20;
  swan.motion.setRoute([start, { x: 886, y: -315 }]);
  const physics = new PondBodyPhysics([swan.body,{ id:'boat', kind:'boat', motion:boat,
    pose:{ x:9.31, y:-boatDraft, z:-3.66, pitch:0 }, cores:bodyCores('boat') }]);
  try {
    for (let n = 1; n <= 390; n++) {
      const previous = swan.motion.position;
      swan.update(1 / 60, n / 60, undefined, 0, boat.position);
      assert.ok(clearSegment(previous, swan.motion.position, swanObstacles, worldBounds));
    }
    assert.equal(physics.contacts, 0);
    assert.ok(Math.hypot(swan.motion.position.x - boat.position.x, swan.motion.position.y - boat.position.y) > 180);
  } finally { physics.dispose(); }
});
test('swan clears the approach of a moving hull at the right lotus', () => {
  const swan = new SwanLife(false), boat = new BoatMotion({ x: 655, y: -312 });
  swan.motion.position = { x: 884, y: -331 };
  swan.motion.angle = 2.97;
  swan.motion.setRoute([swan.motion.position, { x: 825, y: -42 }]);
  boat.velocity = { x: 38, y: -12 };
  boat.angle = Math.atan2(boat.velocity.x, -boat.velocity.y);
  const physics = new PondBodyPhysics([swan.body, { id:'boat', kind:'boat', motion:boat,
    pose:{ x:6.55, y:-boatDraft, z:-3.12, pitch:0 }, cores:bodyCores('boat') }]);
  try {
    let gap = Infinity;
    for (let n = 1; n <= 372; n++) {
      boat.position = { x: boat.position.x + boat.velocity.x/60, y: boat.position.y + boat.velocity.y/60 };
      swan.update(1/60, n/60, undefined, 0, boat.position, undefined, boat.velocity);
      gap = Math.min(gap, Math.hypot(swan.motion.position.x-boat.position.x,swan.motion.position.y-boat.position.y));
      assert.ok(safe(swan.motion.position, swanObstacles, worldBounds));
    }
    assert.equal(physics.contacts, 0);
    assert.ok(gap > boatCollisionRadius * 100, 'the swan leaves the enlarged hull envelope clear');
  } finally { physics.dispose(); }
});
test('dragonflies have bounded daytime flights, supported night rests, and four wings',()=>{
  for(let i=0;i<3;i++){
    const pad={...lilyPads[dragonflyVisits[i].pad],height:.04,dx:0,dz:0},insect=makeDragonfly(i);
    assert.equal(insect.wings.length,4);
    const size=new Box3().setFromObject(insect.root).getSize(new Vector3());
    assert.ok(size.x>.50*lifeScale&&size.x<.57*lifeScale,'four-wing silhouette follows the shared visitor scale');
    let flights=0,rests=0;
    for(let t=0;t<76;t+=.1){const p=insect.update(t,0,pad);if(p.flight>.9)flights++;if(p.flight===0)rests++;assert.ok(p.y>=pad.height+.029&&p.y<.8);}
    assert.ok(flights>100&&rests>100);
    const rest = insect.update(0,1,pad);
    for(const t of [0,5,25,45]){
      const p = insect.update(t,1,pad);
      assert.equal(p.flight,0);assert.equal(p.wingPower,0);
      assert.equal(p.y,rest.y);assert.ok(p.y > pad.height + .030 && p.y < pad.height + .080);
    }
  }
});

test('dragonfly legs keep their lengths and plant on the moving leaf after approach', () => {
  const habitat = makePondHabitat(true);
  const wave = (_x: number, _z: number, t: number) => ({height:.031*Math.sin(t*2.4), dx:.14*Math.cos(t), dz:-.18*Math.sin(t*1.9)});
  const ray = new Raycaster(), down = new Vector3(0,-1,0), matrix = new Matrix4();
  const tip = new Vector3(), base = new Vector3(), knee = new Vector3(), origin = new Vector3();
  let maxGap = 0, contactSamples = 0;
  try {
    dragonflyVisits.forEach((visit, i) => {
      const insect = makeDragonfly(i), leaf = habitat.group.getObjectByName('LilyPad-' + visit.pad)!.children[0];
      const initialLengths = Array.from({length: 12}, (_, index) => {
        insect.legs.getMatrixAt(index, matrix);
        return tip.set(0,.5,0).applyMatrix4(matrix).distanceTo(base.set(0,-.5,0).applyMatrix4(matrix));
      });
      const plantarHeights = Array.from({length:6}, (_, leg) => {
        insect.legs.getMatrixAt(leg * 2 + 1, matrix);
        return tip.set(0,.5,0).applyMatrix4(matrix).y;
      });
      let lifted = false, tucked = false, reached = false, settled = false;
      for (let frame = 0; frame <= 30 * 28; frame++) {
        const phase = frame / 30, time = phase + 38 - visit.phase;
        habitat.update(time, -1, wave);
        habitat.group.updateMatrixWorld(true);
        const pose = insect.update(time, 0, habitat.padSupport(visit.pad));
        insect.root.updateMatrixWorld(true);
        lifted ||= phase < .55 && pose.flight > .15;
        tucked ||= phase < 2 && pose.tuck > .9;
        reached ||= phase > 23 && pose.flight > .95 && pose.reach > .95;
        settled ||= pose.flight === 0 && pose.compression > .0045;
        for (let leg = 0; leg < 6; leg++) {
          insect.legs.getMatrixAt(leg * 2, matrix);
          knee.set(0,.5,0).applyMatrix4(matrix);
          const thigh = knee.distanceTo(base.set(0,-.5,0).applyMatrix4(matrix));
          assert.ok(Math.abs(thigh - initialLengths[leg*2]) < .00001,
            `insect ${i}, leg ${leg} thigh at phase ${phase}: ${thigh}`);
          insect.legs.getMatrixAt(leg * 2 + 1, matrix);
          tip.set(0,.5,0).applyMatrix4(matrix);
          assert.ok(base.set(0,-.5,0).applyMatrix4(matrix).distanceTo(knee) < .00001);
          assert.ok(Math.abs(tip.distanceTo(knee) - initialLengths[leg*2+1]) < .00001);
          if (pose.tuck === 1) assert.ok(tip.y - plantarHeights[leg] > .009,
            `insect ${i}, leg ${leg}: folded toe only rises ${tip.y - plantarHeights[leg]}`);
          if (pose.reach > .99) assert.ok(plantarHeights[leg] - tip.y > .004, 'toes extend before touching the leaf');
          if (pose.flight !== 0) continue;
          tip.applyMatrix4(insect.root.matrixWorld);
          ray.set(origin.copy(tip).addScaledVector(down,-.20), down);
          const contact = ray.intersectObject(leaf, false)[0];
          assert.ok(contact, `insect ${i}, leg ${leg} misses the leaf at phase ${phase}`);
          maxGap = Math.max(maxGap, Math.abs(tip.y - contact.point.y));
          contactSamples++;
        }
      }
      assert.ok(lifted && tucked && reached && settled, 'rise, tuck, reach and weight transfer must occur in order');
      const parked = insect.legs.instanceMatrix.version;
      insect.update(36, 1, habitat.padSupport(visit.pad));
      insect.update(37, 1, habitat.padSupport(visit.pad));
      assert.equal(insect.legs.instanceMatrix.version, parked, 'resting legs need no further GPU uploads');
    });
    assert.ok(maxGap < .001 && contactSamples > 1600, `landing error ${maxGap} across ${contactSamples} contacts`);
  } finally { habitat.dispose(); }
});
test('the native swan looks toward the tap, preserves its paused pose and releases its geometry',()=>{
  const wildlife = makePondWildlife(), life = new SwanLife();
  const geometry = new Set<BufferGeometry>(); let faces = 0, disposed = 0;
  wildlife.swan.traverse(object => {
    if (!(object instanceof Mesh)) return;
    geometry.add(object.geometry);
    faces += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  });
  assert.ok(faces > 0);
  geometry.forEach(surface => surface.addEventListener('dispose', () => disposed++));
  const beak = wildlife.swan.getObjectByName('SwanBill');
  assert.ok(beak instanceof Mesh);
  const head = wildlife.swan.getObjectByName('SwanHead')!;
  wildlife.swan.updateMatrixWorld(true);
  assert.ok(new Box3().setFromObject(beak).getCenter(new Vector3()).z < -.7 * lifeScale, 'nose points along the swimmer’s -Z');
  const pad=(i:number)=>({...lilyPads[i],height:.04,dx:0,dz:0});
  const water=()=>({height:.025,dx:.02,dz:0});
  for(let n=1;n<=120;n++){
    life.update(1/60,n/60,undefined,0,undefined,water);
    wildlife.update(life,n/60,1/60,0,water,pad);
  }
  const y=wildlife.swan.position.y;assert.ok(y>.01&&y<.04);
  const eye = wildlife.swan.localToWorld(new Vector3(2, 1.4, -2));
  const desired = eye.clone().sub(wildlife.swan.position).setY(0).normalize();
  const similarity = () => new Vector3(0,0,-1).applyQuaternion(head.getWorldQuaternion(new Quaternion())).setY(0).normalize().dot(desired);
  const initial = similarity();
  wildlife.notice(2, eye);
  wildlife.update(life, 2.6, 0, 0, water, pad);
  assert.ok(similarity() > .90 && similarity() > initial + .16, 'the swan turns toward the viewer');
  const before=wildlife.swan.rotation.toArray();
  const glance = head.quaternion.toArray();
  for(let n=0;n<20;n++)wildlife.update(life,2.6,0,0,()=>({height:-.5,dx:10,dz:10}),pad);
  assert.equal(wildlife.swan.position.y, y);
  assert.deepEqual(wildlife.swan.rotation.toArray(), before);
  assert.deepEqual(head.quaternion.toArray(), glance);
  wildlife.dispose(); assert.equal(disposed, geometry.size);
});
test('resting and frozen swans do not consume ripple slots',()=>{
  const life=new SwanLife(),ripples=new RippleField();
  for(let i=0;i<60;i++)life.update(0,i,ripples);
  assert.equal(ripples.active(0).length,0);
  for(let n=1;n<=600;n++)life.update(1/60,n/60,ripples);
  assert.ok(ripples.fishEvents>0&&ripples.fishEvents<=6,'low-energy wakes are rate limited');
  assert.ok(ripples.active(10).every(r=>r.strength<=.045));
});

test('a daylight swan unfolds its wing skin for the water run, flies and tucks the same wings after landing', ()=>{
  const wildlife=makePondWildlife(), life=new SwanLife(), ripples=new RippleField();
  const shoulder=wildlife.swan.getObjectByName('SwanShoulder_L')!, wrist=wildlife.swan.getObjectByName('SwanWrist_L')!;
  const wing=wildlife.swan.getObjectByName('SwanWing_L');
  assert.ok(wing instanceof SkinnedMesh && wing.visible && wrist.parent === shoulder);
  const fold = wing.morphTargetDictionary!.Tucked;
  assert.equal(wing.morphTargetInfluences![fold], 1);
  const samples=new Set<string>(); let min=Infinity,max=-Infinity,crest=0,lowestWing=Infinity;
  let launch:{x:number;z:number;time:number}|undefined, touch:{x:number;z:number;time:number}|undefined, glidingFrames=0;
  const feathers: SkinnedMesh[]=[];
  wildlife.wings.forEach(wing=>wing.traverse(node=>{if(node instanceof SkinnedMesh)feathers.push(node);}));
  const at=new Vector3(), zero=()=>({height:0,dx:0,dz:0}), pad=(i:number)=>({...lilyPads[i],height:.04,dx:0,dz:0});
  try {
    for(let n=1;n<=60*45;n++){
      const time=n/60;life.update(1/60,time,ripples);wildlife.update(life,time,1/60,0,zero,pad);
      samples.add(life.pose.mode);crest=Math.max(crest,life.pose.y);
      if(life.pose.mode==='flight'){
        launch??={x:life.pose.x,z:life.pose.z,time};
        if(life.pose.wingOpen>.90&&life.pose.wingPower<.26&&life.pose.y>.85)glidingFrames++;
      }
      if(ripples.events.some(event=>Math.abs(event.born-time)<1e-7&&event.strength===.63))touch={x:life.pose.x,z:life.pose.z,time};
      if(life.pose.mode==='flight'&&life.pose.y>.30){
        assert.equal(wing.visible,true);
        assert.ok(wing.morphTargetInfluences![fold] < .01, 'the same wing skin has fully opened');
        const offset=wrist.getWorldPosition(at).y-shoulder.getWorldPosition(at).y;
        min=Math.min(min,offset);max=Math.max(max,offset);
      }
      if (life.pose.wingOpen > .025 && n % 3 === 0) {
        wildlife.swan.updateMatrixWorld(true);
        for (const feather of feathers) for (let vertex=0;vertex<feather.geometry.attributes.position.count;vertex++) {
          const y=feather.getVertexPosition(vertex,at).applyMatrix4(feather.matrixWorld).y;
          lowestWing=Math.min(lowestWing,y);
        }
      }
    }
    assert.ok(['takeoff','flight','land'].every(mode=>samples.has(mode)));
    assert.ok(crest>.9&&max-min>.32,'the flying and articulated motions reach visible amplitudes');
    assert.ok(launch&&touch&&touch.time-launch.time>5&&Math.hypot(touch.x-launch.x,touch.z-launch.z)>7.7,
      'the bird stays airborne long enough to cross a substantial stretch of open water');
    assert.ok(glidingFrames>25,'full wingbeats alternate with visible gliding before the approach');
    assert.ok(feathers.length===2 && lowestWing>.09, `each wing clears the water during the run and descent: ${lowestWing}`);
    assert.equal(life.flights,1);assert.equal(life.pose.y,0);
    assert.equal(wing.visible, true);
    assert.equal(wing.morphTargetInfluences![fold], 1);
    const dark=new SwanLife();for(let n=1;n<=60*45;n++)dark.update(1/60,n/60,undefined,1);
    assert.equal(dark.flights,0);assert.equal(dark.pose.y,0);
  } finally {wildlife.dispose();}
});

test('swan contacts a raised water surface earlier while the airborne path stays the same', () => {
  const observe = (height: number, raiseFrame?: number) => {
    const life = new SwanLife(), ripples = new RippleField();
    const surface = (_x: number, _z: number, time: number) => ({ height:Math.round(time*60) > (raiseFrame ?? Infinity) ? height : 0, dx:0, dz:0 });
    let beforeContact = 0;
    for (let n = 1; n <= 60 * 55; n++) {
      const time = n/60;
      life.update(1/60,time,ripples,0,undefined,surface);
      if(raiseFrame===undefined&&life.pose.mode==='land'&&life.pose.y<.53&&life.pose.y>.45)raiseFrame=n;
      if (n===raiseFrame) beforeContact = life.pose.y;
      if (ripples.events.some(event => Math.abs(event.born - time) < 1e-7 && event.strength === .63)) {
        return { time, raiseFrame, beforeContact, y:life.pose.y, water:life.pose.waterHeight };
      }
    }
    throw new Error('Swan never touched water');
  };
  const flat = observe(0), crest = observe(.065,flat.raiseFrame);
  assert.ok(flat.raiseFrame&&flat.beforeContact>.45);
  assert.equal(crest.beforeContact, flat.beforeContact);
  assert.ok(crest.time < flat.time && flat.time-crest.time < .4);
  for (const result of [flat, crest]) {
    assert.ok(result.y <= result.water && result.y >= result.water-.03, 'splash occurs where the same body reaches water');
  }
});
