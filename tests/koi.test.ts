import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FishSchool, RippleField, sampleSurface } from '../src/scene/pond-life';
import { clearSegment, safe } from '../src/scene/navigation';
import { boatStart, fishObstacles, koiObstacles, worldBounds } from '../src/scene/world-layout';
import { lifeScale } from '../src/scene/shore-layout';

test('deep koi explore and surface outside the expanded underwater shore',()=>{
  for(const seed of [18,81,763]){
    const school=new FishSchool(7,seed,koiObstacles),ripples=new RippleField();
    const initial=school.poses.map(p=>({...p}));
    for(let frame=1;frame<=5400;frame++){
      const previous=school.poses.map(p=>({x:p.x*100,y:p.z*100}));
      school.update(1/30,frame/30,ripples,boatStart);
      school.poses.forEach((p,i)=>{
        const next={x:p.x*100,y:p.z*100};
        assert.ok(safe(next,koiObstacles,worldBounds),'fish stays beyond submerged bank');
        assert.ok(clearSegment(previous[i],next,koiObstacles,worldBounds),'no cut through a bank while turning');
      });
    }
    assert.ok(school.visits>3,'surface behaviour continues');
    assert.ok(school.poses.every((p,i)=>Math.hypot(p.x-initial[i].x,p.z-initial[i].z)>.5),'expanded shores do not trap fish');
  }
});

const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('a normal surface visit climbs along the nose and levels out before diving',()=>{
  const school=new FishSchool(7,81,koiObstacles),ripples=new RippleField();
  let index=-1;
  const startFrame=294;
  for(let n=1;n<=startFrame;n++)school.update(1/60,n/60,ripples,boatStart);
  const start=school.poses.map(p=>({...p}));
  const uphill=start.map(()=>0);
  let downhill=0, level=false, reach=0, forward=0;
  for(let n=startFrame+1;n<=600;n++){
    school.update(1/60,n/60,ripples,boatStart);
    school.poses.forEach((p,i)=>{uphill[i]=Math.max(uphill[i],p.pitch);});
    if(index<0)index=school.poses.findIndex(p=>p.surfacing);
    if(index<0)continue;
    const p=school.poses[index], begin=start[index];
    if(p.surfacing){
      level ||= Math.abs(p.pitch)<.20;
      reach=Math.max(reach,p.y-begin.y);
      forward=Math.max(forward,-Math.sin(begin.yaw)*(p.x-begin.x)-Math.cos(begin.yaw)*(p.z-begin.z));
    }
    downhill=Math.min(downhill,p.pitch);
  }
  assert.ok(reach>.37&&forward>=reach*.72,`surface approach travels forward while rising: ${forward} m forward, ${reach} m up`);
  assert.ok(uphill[index]>.30&&level&&downhill<-.30,'the nose aims up, relaxes at the surface, then pitches into the dive');
});

test('the koi pair stays close but changes front/back and left/right without snapping at different frame rates', () => {
  for (const [seed, dt] of [[18, 1 / 60], [81, 1 / 30], [763, .08], [92141, 1 / 60]]) {
    const school = new FishSchool(7, seed, fishObstacles), ripples = new RippleField();
    const front = { min: Infinity, max: -Infinity }, side = { min: Infinity, max: -Infinity };
    const surfaced = new Set<number>();
    const stationary = school.poses.map(() => 0);
    let unlikeHeadings = 0;
    for (let time = 0; time < 600; time += dt) {
      const before = school.poses.map(p => ({ ...p }));
      school.update(dt, time, ripples, boatStart);
      assert.equal(school.poses.length, 7);
      for (const [i, p] of school.poses.entries()) {
        const prior = before[i], a = { x: prior.x * 100, y: prior.z * 100 }, b = { x: p.x * 100, y: p.z * 100 };
        assert.ok(safe(b, fishObstacles, worldBounds) && clearSegment(a, b, fishObstacles, worldBounds), 'no bank crossing');
        assert.ok(Math.hypot(p.x - prior.x, p.z - prior.z) <= .5 * dt, 'bounded displacement');
        assert.ok(Math.abs(angleDifference(p.yaw, prior.yaw)) <= 1.201 * dt, 'bounded turn rate');
        const maxVerticalSpeed = p.leapPhase || prior.leapPhase ? 1.90 : 1.5;
        assert.ok(Math.abs(p.y - prior.y) < maxVerticalSpeed * dt, 'vertical motion follows the active stroke');
        stationary[i] = Math.hypot(p.x - prior.x, p.z - prior.z) < .00001 ? stationary[i] + dt : 0;
        assert.ok(stationary[i] < 4, 'yielding fish turns clear instead of remaining jammed against another fish');
        for (let j = i + 1; j < school.poses.length; j++) {
          const other = school.poses[j];
          assert.ok(Math.hypot(p.x - other.x, p.y - other.y, p.z - other.z) >= .2499, 'fish do not pass through one another');
        }
        if (p.surfacing) surfaced.add(i);
      }
      const [a, b] = school.poses, dx = a.x - b.x, dz = a.z - b.z;
      const separation = Math.hypot(dx, dz);
      assert.ok(separation > .27 && separation < 1.65, `pair remains together without overlap: ${seed}, ${time}, ${separation}`);
      const ahead = dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw), sideways = dx * Math.cos(a.yaw) - dz * Math.sin(a.yaw);
      front.min = Math.min(front.min, ahead); front.max = Math.max(front.max, ahead);
      side.min = Math.min(side.min, sideways); side.max = Math.max(side.max, sideways);
      if (Math.abs(angleDifference(a.yaw, b.yaw)) > .2) unlikeHeadings++;
    }
    assert.ok(front.min < -.35 && front.max > .35, 'both fish spend time in front');
    assert.ok(side.min < -.35 && side.max > .35, 'both fish spend time on either side');
    assert.ok(unlikeHeadings * dt > 30, 'headings are independent, not a parallel formation');
    assert.equal(surfaced.size, 7, 'every koi occasionally surfaces over ten minutes');
    assert.ok(school.heartEvents >= 4 && school.heartEvents <= 30, 'quiet, probabilistic heart cadence');
  }
});

test('an open-water koi leap rises, clears the surface and pitches down into its own landing ripple', () => {
  const school = new FishSchool(7, 802, koiObstacles), ripples = new RippleField();
  const phases = new Set<string>();
  const airborne: { height: number; yaw: number }[] = [];
  let highest = -Infinity, launchPitch = -Infinity, landingPitch = Infinity, index = -1;
  for (let frame = 1; frame < 60 * 110; frame++) {
    school.update(1 / 60, frame / 60, ripples, boatStart);
    const active = school.poses.findIndex(p => p.leapPhase);
    if (active < 0) {
      if (phases.has('dive') && school.leaps) break;
      phases.clear(); airborne.length = 0; index = -1;
      continue;
    }
    const p = school.poses[active];
    index = index === -1 ? active : index;
    assert.equal(active, index, 'the same fish completes the action');
    phases.add(p.leapPhase!);
    if (p.leapPhase === 'air') {
      airborne.push({ height: p.y, yaw: p.yaw });
      highest = Math.max(highest, p.y - sampleSurface(p.x, p.z, frame / 60).height);
      launchPitch = Math.max(launchPitch, p.pitch); landingPitch = Math.min(landingPitch, p.pitch);
    }
  }
  assert.deepEqual([...phases], ['rise', 'air', 'dive']);
  assert.ok(highest > .17 && launchPitch > .75 && landingPitch < -.75);
  assert.ok(airborne.length > 20);
  for (let i = 2; i < airborne.length - 1; i++) {
    const acceleration = (airborne[i + 1].height - 2 * airborne[i].height + airborne[i - 1].height) * 60 ** 2;
    assert.ok(Math.abs(acceleration + 9.81 * lifeScale) < .001, 'airborne rise and fall advance under gravity');
    assert.equal(airborne[i].yaw, airborne[i - 1].yaw, 'the koi keeps its heading in the air');
  }
  assert.equal(school.leaps, 1);
  const takeoff = ripples.events.find(ripple => ripple.strength === .55)!;
  const landing = ripples.events.find(ripple => ripple.strength === .74)!;
  assert.ok(landing.born - takeoff.born > .3 && landing.born - takeoff.born < .8);
});

test('heart events stay in world space, expire, and zero delta freezes all animal state', () => {
  const school = new FishSchool(7, 81, fishObstacles), ripples = new RippleField();
  let time = 0;
  while (!school.hearts.length && time < 100) { time += 1 / 30; school.update(1 / 30, time, ripples, boatStart); }
  assert.equal(school.hearts.length, 1);
  const event = { ...school.hearts[0] };
  for (let n = 0; n < 30; n++) { time += 1 / 30; school.update(1 / 30, time, ripples, boatStart); }
  assert.deepEqual(school.hearts[0], event, 'fish movement does not drag the emitted heart');
  const poses = structuredClone(school.poses), hearts = structuredClone(school.hearts);
  school.update(0, time, ripples, boatStart);
  assert.deepEqual(school.poses, poses); assert.deepEqual(school.hearts, hearts);
  for (let n = 0; n < 100; n++) { time += 1 / 30; school.update(1 / 30, time, ripples, boatStart); }
  assert.equal(school.hearts.length, 0);
});
