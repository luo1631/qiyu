import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PreviewTime } from '../src/scene/preview-time';

const noon = Date.UTC(2026, 10, 2, 4), halfDay = 12 * 3600000;

test('twelve-hour preview is continuous, monotonic and completes in 1.4 seconds', () => {
  const clock = new PreviewTime(noon);
  clock.setTarget(noon + halfDay, 100);
  assert.equal(clock.sample(100), noon);
  let previous = noon;
  for (let at = 100; at <= 1500; at += 20) {
    const current = clock.sample(at);
    assert.ok(current >= previous && current <= noon + halfDay);
    previous = current;
  }
  assert.equal(clock.sample(800), noon + halfDay / 2);
  assert.equal(clock.sample(1500), noon + halfDay);
  assert.equal(clock.active(1500), false);
});

test('ordinary one-second clock synchronization does not restart an in-flight preview', () => {
  const clock = new PreviewTime(noon);
  clock.setTarget(noon + halfDay, 0);
  clock.setTarget(noon + halfDay + 1000, 1000);
  assert.ok(clock.sample(1000) > noon + halfDay / 2);
  assert.equal(clock.sample(1400), noon + halfDay + 1000);
  assert.equal(clock.active(1400), false);
  clock.setTarget(noon + halfDay + 2000, 2000);
  assert.equal(clock.sample(2000), noon + halfDay + 2000);
});

test('rapid repeat clicks continue from the displayed time and retain the full cumulative offset', () => {
  const clock = new PreviewTime(noon);
  clock.setTarget(noon + halfDay, 0);
  const displayed = clock.sample(350);
  clock.setTarget(noon + 2 * halfDay, 350);
  assert.equal(clock.sample(350), displayed);
  assert.equal(clock.sample(1750), noon + 2 * halfDay);
  assert.equal(clock.sample(30000), noon + 2 * halfDay);
});

test('reduced motion snaps immediately, including when enabled halfway through a preview', () => {
  const clock = new PreviewTime(noon);
  clock.setTarget(noon + halfDay, 0);
  clock.setTarget(noon + halfDay, 400, true);
  assert.equal(clock.sample(400), noon + halfDay);
  assert.equal(clock.active(400), false);
  clock.setTarget(noon + 2 * halfDay, 500, true);
  assert.equal(clock.sample(500), noon + 2 * halfDay);
});

test('returning after a long background interval synchronizes real time without a preview animation', () => {
  const clock = new PreviewTime(noon);
  clock.setTarget(noon + 600000, 600000, false, false);
  assert.equal(clock.sample(600000), noon + 600000);
  assert.equal(clock.active(600000), false);
});
