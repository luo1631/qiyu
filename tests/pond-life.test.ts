import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { BoatMotion, boatCruiseSpeed, boatHelm, clearSegment, distance, planRoute, safe } from '../src/scene/navigation';
import { boatContactMaterial } from '../src/scene/collision';
import { boatCollisionRadius, boatStart, fishObstacles, pondFraming, worldBounds, worldDestinations, worldObstacles } from '../src/scene/world-layout';
import { BoatWander, FishSchool, FloatSpring, RippleField, rippleCapacity, sampleSurface } from '../src/scene/pond-life';

const edgeDistance = (x: number, y: number) => Math.min(x - worldBounds.left, worldBounds.right - x, y - worldBounds.top, worldBounds.bottom - y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('idle boats explore safely and a click can take over without teleporting', () => {
  for (const seed of [18, 763, 92141]) {
    const boat = new BoatMotion(boatStart), wander = new BoatWander(seed);
    boat.collisionMaterial = boatContactMaterial; boat.helm=boatHelm;
    boat.angle = -1.2;
    let minX = boat.position.x, maxX = minX, minY = boat.position.y, maxY = minY;
    let leftTurns = 0, rightTurns = 0, stillFor = 0, lastContact = -Infinity;
    for (let frame = 0; frame < 60 * 600; frame++) {
      const previous = { ...boat.position };
      const previousAngle = boat.angle;
      const previousCollisions = boat.collisions;
      wander.update(boat, 1 / 60, frame / 60, worldObstacles, worldBounds);
      if(boat.collisions>previousCollisions)lastContact=frame/60;
      assert.ok(safe(boat.position, worldObstacles, worldBounds), 'wandering stays outside expanded banks');
      assert.ok(clearSegment(previous, boat.position, worldObstacles, worldBounds));
      assert.ok(distance(previous, boat.position) < .35, 'wandering stays below 21 cm/s during pace changes');
      stillFor = distance(previous, boat.position) < .001 ? stillFor + 1 / 60 : 0;
      if (frame > 600) assert.ok(stillFor < 2, 'does not get stuck turning against a bank');
      assert.ok(edgeDistance(boat.position.x, boat.position.y) >= 39.99, 'turns before the edge, including its original spawn');
      const turn = angleDelta(boat.angle, previousAngle);
      assert.ok(Math.abs(turn) <= .56 / 60, 'bounded turn rate');
      leftTurns += Math.max(0, turn); rightTurns += Math.max(0, -turn);
      if (distance(previous, boat.position) > .01 && boat.collisions === previousCollisions) {
        const lateral = boat.velocity.x*Math.cos(boat.angle)+boat.velocity.y*Math.sin(boat.angle);
        assert.ok(Math.abs(lateral) < (frame/60-lastContact<2?12:3), 'contact recoil decays back to the small free-drift lateral speed');
      }
      minX = Math.min(minX, boat.position.x); maxX = Math.max(maxX, boat.position.x);
      minY = Math.min(minY, boat.position.y); maxY = Math.max(maxY, boat.position.y);
    }
    assert.ok(wander.destinations >= 5, 'chooses successive destinations');
    assert.ok(Math.hypot(maxX - minX, maxY - minY) > 700, 'explores the pond instead of circling the starting point');
    assert.ok(leftTurns > Math.PI && rightTurns > Math.PI, 'can meander in both directions');
    const previous = { ...boat.position }, velocity = { ...boat.velocity };
    const target = worldDestinations.about.dock;
    boat.setRoute(planRoute(boat.position, target, worldObstacles, worldBounds));
    assert.deepEqual(boat.position, previous); assert.deepEqual(boat.velocity, velocity);
    let arrived = false;
    for (let n = 0; n < 6000 && !arrived; n++) arrived = boat.update(1 / 60, boatCruiseSpeed, worldObstacles, worldBounds);
    assert.ok(arrived && distance(boat.position, target) < 2.5, 'click reaches its destination after wandering');
  }
});

test('fish surface infrequently, stay away from banks, and emit bounded water events', () => {
  const ripples = new RippleField(), school = new FishSchool(7, 92141, fishObstacles);
  let maximumSurfacing = 0, sawHead = false,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  const turns = school.poses.map(() => ({ left: 0, right: 0 }));
  for (let n = 0; n < 60 * 180; n++) {
    const previous=school.poses.map(p=>({...p}));
    school.update(1 / 60, n / 60, ripples, boatStart);
    maximumSurfacing = Math.max(maximumSurfacing, school.poses.filter(p => p.surfacing).length);
    for (const [i,p] of school.poses.entries()) {
      assert.ok([p.x, p.y, p.z, p.yaw, p.pitch].every(Number.isFinite));
      assert.ok(safe({ x: p.x * 100, y: p.z * 100 }, fishObstacles, worldBounds, -0.001));
      assert.ok(Math.hypot(p.x-previous[i].x,p.z-previous[i].z)<.85/60,'fish do not accelerate abruptly at the shore');
      assert.ok(edgeDistance(p.x * 100, p.z * 100) >= 69.99, 'fish turn inside the shore buffer');
      const turn = angleDelta(p.yaw, previous[i].yaw);
      assert.ok(Math.abs(turn) <= 1.21 / 60, 'fish turn smoothly');
      turns[i].left += Math.max(0, turn); turns[i].right += Math.max(0, -turn);
      if (Math.hypot(p.x - previous[i].x, p.z - previous[i].z) > .0001) {
        const heading = Math.atan2(previous[i].x - p.x, previous[i].z - p.z);
        assert.ok(Math.abs(angleDelta(heading, p.yaw)) < .32, 'fish advance nose first with limited sideslip during the stroke');
      }
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
      if (p.surfacing) { sawHead = true; assert.ok(p.y > sampleSurface(p.x,p.z,n/60).height-.22); }
    }
  }
  assert.equal(maximumSurfacing, 1); assert.ok(sawHead);
  assert.ok(turns.every(t => t.left > Math.PI/2 && t.right > Math.PI/2), 'each fish makes substantial turns in both directions instead of sharing one orbit');
  assert.ok(maxX-minX>12 && maxZ-minZ>8,'the seven koi explore separated outer waters around the redistributed islands');
  assert.ok(school.visits >= 8 && school.visits <= 14, 'quiet spacing over three minutes');
  assert.ok(ripples.fishEvents >= (school.visits - 2) * 2 && ripples.fishEvents <= school.visits * 2,
    'normal visits disturb the surface twice; a blocked or unfinished visit may have fewer events');
  assert.equal(ripples.events.length, rippleCapacity);
  assert.equal(ripples.active(200).length, 0, 'ripples die out instead of accumulating');
});

test('free movement stays safe at slower frame rates and resumes after click cancellation', () => {
  for (const dt of [1 / 30, .08]) {
    const boat = new BoatMotion(boatStart), wander = new BoatWander(763);
    boat.collisionMaterial = boatContactMaterial; boat.helm=boatHelm;
    const school = new FishSchool(6, 81, fishObstacles), ripples = new RippleField();
    for (let n = 0; n < 360 / dt; n++) {
      const time = n * dt;
      if (n === 40) boat.setRoute(planRoute(boat.position, worldDestinations.email.dock, worldObstacles, worldBounds));
      if (n === 80) boat.setRoute([]); // App cancellation clears the click route.
      const before = { ...boat.position }, steps = Math.ceil(dt * 60);
      for (let s = 0; s < steps; s++) {
        if (n >= 40 && n < 80) boat.update(dt / steps, boatCruiseSpeed, worldObstacles, worldBounds);
        else wander.update(boat, dt / steps, time, worldObstacles, worldBounds);
      }
      assert.ok(safe(boat.position, worldObstacles, worldBounds));
      assert.ok(distance(before, boat.position) <= (boatCruiseSpeed + .01) * dt, 'cancellation preserves the actual position');
      const previous = school.poses.map(p => ({ ...p }));
      school.visibleCount = n >= 100 && n < 500 ? 4 : 6;
      school.update(dt, time, ripples, boat.position);
      school.poses.forEach((p, i) => {
        assert.ok(safe({ x: p.x * 100, y: p.z * 100 }, fishObstacles, worldBounds));
        assert.ok(edgeDistance(p.x * 100, p.z * 100) >= 69.99);
        assert.ok(Math.hypot(p.x - previous[i].x, p.z - previous[i].z) < .5 * dt, 'LOD does not reset a fish');
      });
    }
    assert.ok(wander.destinations > 5);
  }
});

test('a surfacing fish dives smoothly when a boat passes over it', () => {
  const school = new FishSchool(6, 81, fishObstacles), ripples = new RippleField();
  let visitor = -1, time = 0;
  for (; time < 20 && visitor < 0; time += 1 / 60) {
    school.update(1 / 60, time, ripples, boatStart);
    visitor = school.poses.findIndex(p => p.surfacing);
  }
  assert.ok(visitor >= 0);
  let previousY = school.poses[visitor].y;
  for (let n = 0; n < 60; n++, time += 1 / 60) {
    const p = school.poses[visitor];
    school.update(1 / 60, time, ripples, { x: p.x * 100, y: p.z * 100 });
    assert.ok(p.y <= previousY + .00001 && p.y >= previousY - .025, 'continuous descent, no depth reset');
    previousY = p.y;
  }
  assert.ok(!school.poses[visitor].surfacing && school.poses[visitor].y <= -.46);
  assert.ok(ripples.fishEvents <= 2, 'an interrupted visit does not emit repeated ripples');
});

test('wakes remain in world space, and a resting boat produces no new trail', () => {
  const field = new RippleField();
  field.trail(0, 0, 1, 0, .3, 0);
  const original = { ...field.events[0] };
  field.trail(1, 1, 0, 1, .3, 1);
  assert.deepEqual(field.events[0], original, 'turning does not drag the old ripple around');
  for (let t = 2; t < 8; t += .1) field.trail(1, 1, 0, 1, 0, t);
  assert.equal(field.boatEvents, 2);
  assert.equal(field.active(9).length, 0);
});

test('buoyancy stays bounded and a damped body settles when the surface stops', () => {
  const body = new FloatSpring();
  for (let n = 0; n < 3600; n++) {
    const surface = sampleSurface(n / 600, 2, n / 60);
    body.update(surface.height, 1 / 60);
    assert.ok(Math.abs(body.value) < .03 && Math.abs(surface.dx) < .06 && Math.abs(surface.dz) < .06);
  }
  for (let n = 0; n < 600; n++) body.update(0, 1 / 60);
  assert.ok(Math.abs(body.value) < 1e-6 && Math.abs(body.velocity) < 1e-6);
});

test('the entire drifting hull remains in frame in desktop and narrow portrait views', () => {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 650], [320, 844], [844, 500]]) {
    const framing = pondFraming(width, height), camera = new PerspectiveCamera(framing.fov, width / height, .1, 1200);
    camera.position.set(...framing.position); camera.lookAt(0, .5, 0); camera.updateMatrixWorld();
    const { left, right, top, bottom } = worldBounds;
    for (let x = left; x <= right; x += 23) for (let z = top; z <= bottom; z += 23) {
      if (!safe({x,y:z}, worldObstacles, worldBounds)) continue;
      for (let i = 0; i < 16; i++) {
        const angle = i / 16 * Math.PI * 2;
        const pixel = new Vector3(x / 100 + Math.cos(angle) * boatCollisionRadius, .3, z / 100 + Math.sin(angle) * boatCollisionRadius).project(camera);
        assert.ok(Math.abs(pixel.x) < .96 && Math.abs(pixel.y) < .96, `${width}×${height}: visible hull at ${x},${z}`);
      }
    }
  }
});
