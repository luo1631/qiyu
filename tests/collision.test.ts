import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveWithCollisions, boatContactMaterial } from '../src/scene/collision';
import { BoatMotion, clearSegment, distance, planRoute, safe } from '../src/scene/navigation';
import { boatStart, worldBounds, worldDestinations, worldObstacles } from '../src/scene/world-layout';

const bounds = { left: -200, right: 200, top: -200, bottom: 200 };
test('continuous collision detects a grazing crossing between the old 6 cm samples', () => {
  assert.equal(clearSegment({ x: -10, y: 99.99 }, { x: 10, y: 99.99 }, [{ x: 2.5, y: 0, rx: 100, ry: 100 }], bounds), false);
  assert.equal(clearSegment({ x: -10, y: 100 }, { x: 10, y: 100 }, [{ x: 2.5, y: 0, rx: 100, ry: 100 }], bounds), true);
});
test('a fast body cannot tunnel through an obstacle and loses impact energy', () => {
  const obstacles = [{ x: 0, y: 0, rx: 3, ry: 30 }];
  const result = moveWithCollisions({ x: -50, y: 0 }, { x: 1000, y: 0 }, .1, obstacles, bounds);
  assert.equal(result.contacts.length, 1);
  assert.ok(result.position.x < -3);
  assert.ok(result.velocity.x < 0 && Math.abs(result.velocity.x) < 1000);
  assert.ok(safe(result.position, obstacles, bounds));
});
test('oblique wall impact reflects the normal and preserves a damped sliding component', () => {
  const result = moveWithCollisions({ x: 199, y: 0 }, { x: 10, y: 20 }, .2, [], bounds);
  assert.equal(result.contacts.length, 1);
  assert.ok(Math.abs(result.velocity.x + 1.8) < 1e-9);
  assert.ok(Math.abs(result.velocity.y - 17.6) < 1e-9);
  assert.ok(result.position.x < 200 && result.position.y > 2);
  const stopped = moveWithCollisions(result.position, result.velocity, 0, [], bounds);
  assert.deepEqual(stopped.position, result.position);
  assert.deepEqual(stopped.velocity, result.velocity);
});
test('scene boat with impact response reaches each dock after repeated retargeting', () => {
  const motion = new BoatMotion(boatStart); motion.collisionMaterial = boatContactMaterial;
  for (const destination of Object.values(worldDestinations)) {
    motion.setRoute(planRoute(motion.position, destination.dock, worldObstacles, worldBounds));
    let arrived = false;
    for (let n = 0; n < 6000 && !arrived; n++) {
      arrived = motion.update(1 / 60, 165, worldObstacles, worldBounds);
      assert.ok(safe(motion.position, worldObstacles, worldBounds));
    }
    assert.ok(arrived); assert.ok(distance(motion.position, destination.dock) < 2.5);
  }
});
