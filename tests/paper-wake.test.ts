import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Vector2, Vector3 } from 'three';
import { isOpenPondWater, PaperSkimGesture, PaperWakeField, paperSkimSettings, paperTailOffset, paperWakeCapacity, paperWakeInterval, paperWakeLifetime } from '../src/scene/paper-wake';
import { pondFraming, worldIslands } from '../src/scene/world-layout';
import { animalIsland } from '../src/scene/habitat-layout';

test('distance starts a skim for both a fast flick and a slow drag', () => {
  const span = paperSkimSettings.startDistance;
  for (const interval of [8, 160]) {
    const gesture = new PaperSkimGesture();
    for (let n = 0; n < 42; n++) assert.equal(gesture.move(span * n / 42, 0, n * interval), false);
    assert.equal(gesture.move(span, 0, 42 * interval), true);
    assert.equal(gesture.distance, span);
  }
  const unsampledFlick = new PaperSkimGesture();
  assert.equal(unsampledFlick.move(0, 0, 0), false);
  assert.equal(unsampledFlick.move(span + 10, 0, 30), true);
  const jitter = new PaperSkimGesture();
  for (let n = 0; n <= 600; n++) assert.equal(jitter.move(n % 2, 0, n * 20), false);
  assert.equal(jitter.distance, 0);
});

test('continuous movement remains active for a minute with no fixed expiry', () => {
  const gesture = new PaperSkimGesture();
  for (let t = 0; t <= 62000; t += 20) {
    gesture.move(t * .3, Math.sin(t / 300) * 20, t);
    if (t >= 1800) assert.equal(gesture.tick(t + 10), true);
  }
});

test('slow motion keeps a skim active, then idle and cancellation reset its distance', () => {
  const gesture = new PaperSkimGesture();
  let x = 0;
  for (let t = 0; t <= 2000; t += 20) { x += 6; gesture.move(x, 0, t); }
  assert.equal(gesture.active, true);
  for (let t = 2020; t <= 3200; t += 20) { x += .4; assert.equal(gesture.move(x, 0, t), true); }
  gesture.move(x, 0, 3300);
  assert.equal(gesture.tick(3421), false, 'stationary mouse expires even if it reports the same point again');
  assert.equal(gesture.move(x + 6, 0, 3440), false);
  assert.equal(gesture.move(x + 12, 0, 3440), false);
  assert.equal(gesture.distance, 6, 'coalesced points can accumulate distance with the same timestamp');
  gesture.reset();
  assert.equal(gesture.move(x + 18, 0, 3460), false, 'blur/pause reset cannot carry activation across');
  assert.equal(gesture.distance, 0);
});

test('tail impulses stay at their contact points, remain bounded, and decay after stopping', () => {
  const field = new PaperWakeField();
  for (let n = 0; n <= 8; n++) field.trace(n * .1, 0, n / 60, 300);
  const first = { ...field.events[0] };
  const beforeTurn = { ...field.events[8] };
  assert.deepEqual([beforeTurn.headingX, beforeTurn.headingZ], [1, 0]);
  for (let n = 9; n <= 18; n++) field.trace(.8, (n - 8) * .1, n / 60, 300);
  assert.deepEqual(field.events[0], first, 'turning does not rotate or drag the previous wave source');
  assert.deepEqual(field.events[8], beforeTurn, 'the old forward/back mask keeps its birth heading');
  assert.ok(field.events.some(event => event.headingZ === 1 && event.headingX === 0), 'new waves follow the new direction');
  assert.ok(field.events.some(event => event.z > 0), 'turning leaves new contacts along the new path');
  for (let n = 19; n < 3600; n++) field.trace(Math.sin(n / 80), Math.cos(n / 80), n / 60, 300);
  assert.equal(field.events.length, paperWakeCapacity);
  assert.ok(field.emitted > 400, 'keeps writing instead of ending after a preset run');
  field.stop();
  assert.equal(field.active(60 + paperWakeLifetime).length, 0);
  field.trace(20, 20, 62, 300);
  const resumed = field.events.find(event => event.born === 62)!;
  assert.deepEqual([resumed.x, resumed.z], [20, 20], 'does not bridge an interrupted gesture');
  assert.notEqual(resumed.stroke, first.stroke, 'the solver can distinguish separate water contacts');
});

test('a one-second circle retains its curve with contacts no more than one frame apart', () => {
  const field = new PaperWakeField();
  // Native/coalesced positions are more frequent than rendering; each must retain its own time.
  for (let n = 0; n <= 240; n++) {
    const angle = n / 240 * Math.PI * 2;
    field.trace(4 * Math.cos(angle), 4 * Math.sin(angle), n / 240, 900);
  }
  const contacts = field.active(1).sort((a, b) => a.born - b.born);
  assert.ok(contacts.length >= 60, 'no 90 ms holes in a fast circular gesture');
  for (let n = 0; n < contacts.length; n++) {
    const contact = contacts[n];
    assert.ok(Math.abs(Math.hypot(contact.x, contact.z) - 4) < .002, 'no straight chords across the circle');
    if (n) assert.ok(contact.born - contacts[n - 1].born <= paperWakeInterval + 1e-8);
  }
  assert.ok(1 - contacts.at(-1)!.born <= paperWakeInterval, 'the newest contact is already available for expansion');
});

test('Three projection places the water contact at the SVG tail across viewports', () => {
  const water = new Mesh(new PlaneGeometry(700, 700), new MeshBasicMaterial());
  water.rotation.x = -Math.PI / 2; water.position.y = .015; water.updateMatrixWorld();
  for (const [width, height] of [[1440, 900], [900, 700], [390, 844]]) {
    const framing = pondFraming(width, height);
    const camera = new PerspectiveCamera(framing.fov, width / height, .1, 1200);
    camera.position.set(...framing.position); camera.lookAt(0, .5, 0); camera.updateMatrixWorld();
    const x = width * .35 + paperTailOffset.x, y = height * .65 + paperTailOffset.y;
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(x / width * 2 - 1, 1 - y / height * 2), camera);
    const hit = ray.intersectObject(water)[0]; assert.ok(hit);
    const projected = new Vector3().copy(hit.point).project(camera);
    assert.ok(Math.abs((projected.x + 1) * width / 2 - x) < 1e-6);
    assert.ok(Math.abs((1 - projected.y) * height / 2 - y) < 1e-6);
  }
  water.geometry.dispose(); water.material.dispose();
});

test('the existing island, animal-shore and hull exclusions also protect the paper wake', () => {
  for (const island of [...worldIslands, animalIsland]) assert.equal(isOpenPondWater(island.x, island.z, 0, 0), false);
  assert.equal(isOpenPondWater(-7, 6, -7, 6), false);
  assert.equal(isOpenPondWater(-12, 12, 0, 0), false,'the complete outer rim is land');
  assert.equal(isOpenPondWater(0, 4, 0, 0), true,'open water inside the rim still accepts a paper wake');
});
