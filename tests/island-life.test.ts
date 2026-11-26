import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Box3, Vector2, Vector3 } from 'three';
import { makeFishSchool } from '../src/floating-island/fish';
import { catCircuit, dogCircuit, emptyPose, swanCircuit, visitorCircuit } from '../src/floating-island/habitat-motion';
import { makeShoreLife } from '../src/floating-island/shore-life';
import { makeSkiff } from '../src/floating-island/skiff';
import { bedHeight, groundHeight, inLake, lakeLevel, onIsland, shoreDistance } from '../src/floating-island/terrain';

test('shore activities stay on dry ground, keep breathing room, and reach their distinct stops', () => {
  const person = emptyPose(), dog = emptyPose(), cat = emptyPose();
  const personActions = new Set<string>(), dogActions = new Set<string>(), catActions = new Set<string>();
  for (let time = 0; time < catCircuit.period * 2; time += .10) {
    visitorCircuit.sample(time, person);
    dogCircuit.sample(time, dog);
    catCircuit.sample(time, cat);
    personActions.add(person.activity);
    dogActions.add(dog.activity);
    catActions.add(cat.activity);
    for (const pose of [person, dog, cat]) {
      assert.ok(onIsland(pose.x, pose.z));
      assert.ok(!inLake(pose.x, pose.z) && shoreDistance(pose.x, pose.z) > .40);
    }
    assert.ok(Math.hypot(person.x - dog.x, person.z - dog.z) > .74);
  }
  assert.deepEqual([...personActions].sort(), ['rest', 'walk', 'watch']);
  assert.ok(dogActions.has('sniff') && dogActions.has('walk'));
  assert.deepEqual([...catActions].sort(), ['rest', 'walk', 'watch']);
});

test('the walking models keep a foot or paw near the local terrain', () => {
  const life = makeShoreLife();
  const foot = new Box3(), center = new Vector3();
  for (let time = 0; time < catCircuit.period + 1; time += .24) {
    life.update(time);
    life.root.updateMatrixWorld(true);
    for (const actor of life.root.children) {
      let clearance = Infinity;
      actor.traverse(part => {
        if (part.name !== '着地脚掌') return;
        foot.setFromObject(part);
        foot.getCenter(center);
        clearance = Math.min(clearance, foot.min.y - groundHeight(center.x, center.z));
      });
      assert.ok(clearance > -.060 && clearance < .046, actor.name + ' loses terrain contact');
      assert.ok(life.occupied(actor.position.x, actor.position.z));
    }
  }
});

test('swimming and resting avoid the moored hull, and fish stay in the water column', () => {
  const swan = emptyPose(), bird = new Vector2(), bounds = new Box3();
  const skiff = makeSkiff(new Vector3(-2.95, .14, 2.00));
  const school = makeFishSchool();
  let rests = 0, moves = 0;
  for (let time = 0; time < 66; time += .13) {
    swanCircuit.sample(time, swan);
    bird.set(swan.x, swan.z);
    skiff.update(time);
    assert.ok(inLake(bird.x, bird.y) && shoreDistance(bird.x, bird.y) > 1.0);
    const offset = bird.clone().sub(skiff.contact);
    const sine = Math.sin(skiff.heading), cosine = Math.cos(skiff.heading);
    const cross = offset.x * cosine - offset.y * sine, along = offset.x * sine + offset.y * cosine;
    const hullGap = Math.hypot(Math.max(0, Math.abs(cross) - .48), Math.max(0, Math.abs(along) - 1.24));
    assert.ok(hullGap > .82);
    if (swan.activity === 'rest') rests++;
    if (swan.activity === 'swim') moves++;
    school.update(time, bird, skiff.contact);
    school.root.updateMatrixWorld(true);
    for (const fish of school.root.children) {
      const p = fish.position;
      bounds.setFromObject(fish);
      assert.ok(inLake(p.x, p.z) && shoreDistance(p.x, p.z) > .62);
      assert.ok(bounds.max.y < lakeLevel + .004, 'the dorsal fin breaks the surface');
      assert.ok(bounds.min.y > bedHeight(p.x, p.z) - .012, 'the fish crosses the bed');
    }
  }
  assert.equal(school.root.children.length, 4);
  assert.ok(rests > 0 && moves > 0);
});
