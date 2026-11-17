import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../src/timer.js';

const MIN = 60_000;

test('remaining time comes from the clock, so a locked phone stays accurate (FR-11)', () => {
  const t = T.start(20 * MIN, 1_000);
  assert.equal(T.remaining(t, 1_000), 20 * MIN);
  // 7 minutes pass with no ticks at all (phone locked)
  assert.equal(T.remaining(t, 1_000 + 7 * MIN), 13 * MIN);
  assert.ok(!T.isDone(t, 1_000 + 7 * MIN));
  assert.ok(T.isDone(t, 1_000 + 25 * MIN));
  assert.equal(T.remaining(t, 1_000 + 25 * MIN), 0);
});

test('pause freezes time and resume continues from the same point (FR-6)', () => {
  let t = T.start(2 * MIN, 0);
  t = T.pause(t, 30_000);
  assert.equal(T.remaining(t, 30_000), 90_000);
  assert.equal(T.remaining(t, 10 * MIN), 90_000, 'no time passes while paused');
  assert.ok(!T.isDone(t, 10 * MIN));
  t = T.resume(t, 10 * MIN);
  assert.equal(T.remaining(t, 10 * MIN + 60_000), 30_000);
});

test('pause and resume are idempotent', () => {
  const t = T.start(MIN, 0);
  const p = T.pause(t, 10_000);
  assert.equal(T.pause(p, 20_000), p);
  assert.equal(T.resume(t, 5_000), t);
});

test('timers survive a JSON round trip', () => {
  const t = T.pause(T.start(MIN, 0), 15_000);
  const back = JSON.parse(JSON.stringify(t));
  assert.equal(T.remaining(back, 99_999), 45_000);
});

test('format rounds up so 0:00 means time is up', () => {
  assert.equal(T.format(20 * MIN), '20:00');
  assert.equal(T.format(119_200), '2:00');
  assert.equal(T.format(30_000), '0:30');
  assert.equal(T.format(400), '0:01');
  assert.equal(T.format(0), '0:00');
  assert.equal(T.format(-50), '0:00');
});
