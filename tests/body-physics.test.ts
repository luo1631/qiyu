import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyCores, bodiesCanCollide, PondBodyPhysics } from '../src/scene/body-physics';
import type { BodyKind, PondBody } from '../src/scene/body-physics';
import { BoatMotion, boatHelm, distance, safe } from '../src/scene/navigation';
import { BoatWander, FishSchool, RippleField } from '../src/scene/pond-life';
import { HabitatLife } from '../src/scene/habitat-life';
import { boatContactMaterial } from '../src/scene/collision';
import { boatStart, fishObstacles, worldBounds, worldObstacles } from '../src/scene/world-layout';

const bounds = { left: -500, top: -500, right: 500, bottom: 500 };
function body(kind: BodyKind, x: number, y: number, z: number, id: string = kind): PondBody {
  return { id, kind, pose: { x, y, z, pitch: 0, mode: 'swim' }, motion: new BoatMotion({ x: x * 100, y: z * 100 }), cores: bodyCores(kind) };
}
test('shallow fish detour around the hull while submerged fish can pass underneath', () => {
  for (const depth of [-.10, -.50]) {
    const boat = body('boat', 0, -.07, 0), fish = body('koi', -2, depth, 0);
    boat.motion.angle = 0; fish.motion.angle = Math.PI / 2;
    const physics = new PondBodyPhysics([boat, fish]);
    fish.motion.setRoute([fish.motion.position, { x: 200, y: 0 }]);
    let arrived = false;
    for (let n = 0; n < 2400 && !arrived; n++) arrived = fish.motion.update(1 / 60, 40, [], bounds, 2.2, 3, 1.2);
    assert.ok(arrived, `fish completes detour at depth ${depth}`);
    assert.ok(depth < -.3 ? physics.contacts === 0 : physics.contacts > 0, 'vertical volume determines collision, not planar overlap');
    physics.dispose();
  }
});
test('surface bodies contact, separate and continue without position jumps', () => {
  const moving = body('frog', -1, -.1, 0), resting = body('frog', 0, -.1, 0, 'resting-frog');
  resting.pose.mode = 'rest'; moving.motion.angle = Math.PI / 2;
  const physics = new PondBodyPhysics([moving, resting]);
  moving.motion.setRoute([moving.motion.position, { x: 150, y: 0 }]);
  let arrived = false;
  for (let n = 0; n < 1800 && !arrived; n++) {
    const before = { ...moving.motion.position };
    arrived = moving.motion.update(1 / 30, 40, [], bounds, 3.8, 2.8, 1.65);
    assert.ok(distance(before, moving.motion.position) <= 40 / 30 + .001, 'contact cannot teleport a body');
    assert.ok(distance(moving.motion.position, resting.motion.position) >= 30, 'solid torso cannot pass through the resting frog');
  }
  assert.ok(arrived && physics.contacts > 0);
});
test('support filtering is specific to the boarding pair, and existing overlap can escape', () => {
  const adult = body('turtle', 0, .2, 0), young = body('youngTurtle', 0, .2, .6), frog = body('frog', 0, -.1, 0);
  adult.pose.mode = 'bask'; young.pose.mode = 'climb';
  assert.equal(bodiesCanCollide(adult, young), false);
  assert.equal(bodiesCanCollide(young, frog), true);
  young.pose.mode = 'swim'; assert.equal(bodiesCanCollide(adult, young), true);
  const a = body('tadpole', -.01, -.25, 0, 'a'), b = body('tadpole', .01, -.25, 0, 'b');
  const physics = new PondBodyPhysics([a, b]);
  a.motion.angle = -Math.PI / 2; b.motion.angle = Math.PI / 2;
  a.motion.setRoute([a.motion.position, { x: -80, y: 0 }]); b.motion.setRoute([b.motion.position, { x: 80, y: 0 }]);
  for (let n = 0; n < 120; n++) for (const item of [a, b]) item.motion.update(1 / 60, 40, [], bounds, 2, 3, 1.2);
  assert.ok(distance(a.motion.position, b.motion.position) > 30, 'initial overlap separates rather than deadlocking');
  const before = { ...a.motion.position }, count = physics.contacts;
  a.motion.update(0, 40, [], bounds); assert.deepEqual(a.motion.position, before); assert.equal(physics.contacts, count);
});
test('scripted jumps reject an occupied landing while support pairs remain allowed', () => {
  const frog = body('frog', -1, -.1, 0), boat = body('boat', 0, -.07, 0);
  const physics = new PondBodyPhysics([frog, boat]);
  assert.equal(physics.canFollowArc(frog, { x: 0, y: -.1, z: 0 }, .48), false, 'takeoff cannot commit a landing inside the hull');
  assert.equal(physics.canFollowArc(frog, { x: -2, y: -.1, z: 0 }, .48), true, 'a clear jump is not disabled');
  physics.dispose();
});
test('overlapping turtle cores retain an escape direction long enough to turn and separate', () => {
  const adult = body('turtle', 5.290108282852167, -.1419061671438276, -3.4809822329832927);
  const young = body('youngTurtle', 5.64141038739671, -.10704297837196046, -2.982789729988757);
  adult.pose.mode = 'shore'; young.pose.mode = 'follow';
  adult.motion.angle = 2.5401221333565545; young.motion.angle = -.7369161925694231;
  adult.motion.setRoute([adult.motion.position, { x: 671.9330401044496, y: -358.03037641927364 }]);
  young.motion.setRoute([young.motion.position, { x: 560.3550952033235, y: -309.27904758342856 }]);
  const starts = [adult, young].map(b => ({ ...b.motion.position }));
  const physics = new PondBodyPhysics([adult, young]), shores = fishObstacles.map(o => ({ ...o, rx: o.rx + 22, ry: o.ry + 22 }));
  for (let n = 0; n < 600; n++) for (const [i, b] of [adult, young].entries()) b.motion.update(1 / 60, i ? 28 : 22, shores, worldBounds, 1.7, 2.8, 1.1);
  assert.ok(distance(starts[0], adult.motion.position) > 10 && distance(starts[1], young.motion.position) > 5, 'contact must not reset the detour every frame');
  physics.dispose();
});
test('combined animal physics preserves exploration, frog landings and turtle rides across frame rates', () => {
  for (const [seed, dt] of [[7, 1 / 30], [392, .08], [9127, 1 / 60]]) {
    const school = new FishSchool(7, seed + 71, fishObstacles), life = new HabitatLife(seed), ripples = new RippleField();
    const boat = body('boat', boatStart.x / 100, -.07, boatStart.y / 100), wander = new BoatWander(seed);
    boat.motion.collisionMaterial = boatContactMaterial; boat.motion.helm=boatHelm;
    const physics = new PondBodyPhysics([boat, ...school.collisionBodies, ...life.collisionBodies]);
    let longestStill = 0, still = 0;
    for (let n = 1; n <= 360 / dt; n++) {
      const time = n * dt, previous = { ...life.frog };
      for (let s = 0, steps = Math.ceil(dt * 60); s < steps; s++) wander.update(boat.motion, dt / steps, time, worldObstacles, worldBounds);
      school.update(dt, time, ripples, boat.motion.position); life.update(dt, time, ripples, boat.motion.position);
      assert.ok(safe(boat.motion.position, worldObstacles, worldBounds));
      assert.ok([...school.poses, ...life.turtles, life.frog, ...life.tadpoles].every(p => [p.x, p.y, p.z].every(Number.isFinite)));
      for (const item of [...school.collisionBodies, ...life.collisionBodies]) {
        if (['jump', 'rest', 'climbBack', 'ride', 'dismount'].includes(item.pose.mode ?? '')) continue;
        assert.ok(Math.hypot(item.pose.x * 100 - item.motion.position.x, item.pose.z * 100 - item.motion.position.y) < 1e-6, 'accepted physics position is committed to animation');
      }
      still = ['swim', 'approach'].includes(life.frog.mode) && Math.hypot(previous.x - life.frog.x, previous.z - life.frog.z) < .00005 ? still + dt : 0;
      longestStill = Math.max(longestStill, still);
    }
    assert.ok(life.events.rides > 0, `boarding still completes: ${seed}`);
    assert.ok(life.events.frogJumps >= 6, `frog still reaches leaves: ${seed}`);
    assert.ok(longestStill < 10, `contacts cannot permanently trap frog: ${seed}, ${longestStill}`);
    assert.ok(wander.destinations > 4); physics.dispose();
  }
});
