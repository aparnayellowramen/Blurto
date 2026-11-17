import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileQueue, takeNext, shuffle } from '../src/queue.js';

const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('first visit shuffles every ID exactly once', () => {
  const q = reconcileQueue(null, ids(3000));
  assert.equal(q.queue.length, 3000);
  assert.equal(new Set(q.queue).size, 3000);
  assert.deepEqual(q.used, []);
  assert.notDeepEqual(q.queue, ids(3000), 'should not be in sheet order');
});

test('drawing every topic never repeats, then ends with null (FR-3, FR-12)', () => {
  const q = reconcileQueue(null, ids(3000));
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const id = takeNext(q);
    assert.ok(!seen.has(id), `repeat of ${id}`);
    seen.add(id);
  }
  assert.equal(takeNext(q), null);
  assert.equal(q.used.length, 3000);
});

test('history survives a reload and JSON round trip', () => {
  const q = reconcileQueue(null, ids(50));
  const drawn = [takeNext(q), takeNext(q), takeNext(q)];
  const restored = reconcileQueue(JSON.parse(JSON.stringify(q)), ids(50));
  assert.deepEqual(restored.queue, q.queue, 'order of the remaining queue is kept');
  for (const id of drawn) assert.ok(!restored.queue.includes(id));
});

test('new topics added to the sheet join the queue; used ones stay used', () => {
  const q = reconcileQueue(null, ids(10));
  const used = [takeNext(q), takeNext(q)];
  const grown = reconcileQueue(q, ids(15));
  assert.equal(grown.queue.length, 13);
  for (const id of [11, 12, 13, 14, 15]) assert.ok(grown.queue.includes(id));
  for (const id of used) assert.ok(!grown.queue.includes(id));
});

test('topics removed from the sheet drop out of the queue', () => {
  const q = reconcileQueue(null, ids(10));
  const shrunk = reconcileQueue(q, ids(8));
  assert.ok(shrunk.queue.every((id) => id <= 8));
  assert.equal(shrunk.queue.length, 8);
});

test('corrupt saved state is repaired, not trusted', () => {
  const q = reconcileQueue({ queue: [1, 1, 'x', 99, 2], used: [2, null, 'y'] }, ids(5));
  assert.deepEqual(q.used, [2]);
  assert.equal(new Set(q.queue).size, q.queue.length);
  assert.deepEqual([...q.queue].sort(), [1, 3, 4, 5]);
  assert.equal(reconcileQueue('garbage', ids(3)).queue.length, 3);
});

test('shuffle is a permutation', () => {
  const a = shuffle(ids(100));
  assert.deepEqual([...a].sort((x, y) => x - y), ids(100));
});
