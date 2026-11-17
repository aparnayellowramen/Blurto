import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../data/topics.json', import.meta.url), 'utf8'));

test('topics.json matches the PRD: 3,000 topics in 26 categories', () => {
  assert.equal(data.topics.length, 3000);
  assert.equal(data.count, 3000);
  assert.equal(data.categories.length, 26);
});

test('every topic has a unique ID, a valid category and at most 3 words', () => {
  const ids = new Set();
  const names = new Set();
  for (const [id, ci, name] of data.topics) {
    assert.ok(Number.isInteger(id) && !ids.has(id), `bad or repeated ID ${id}`);
    assert.ok(data.categories[ci], `bad category for ${id}`);
    assert.ok(!names.has(name.toLowerCase()), `duplicate topic "${name}"`);
    assert.ok(name.split(' ').length <= 3, `"${name}" is over 3 words`);
    ids.add(id);
    names.add(name.toLowerCase());
  }
});
