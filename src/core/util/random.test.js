import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, gaussian } from './random.js';

test('makeRng with a seed is deterministic and repeatable', () => {
  const a = makeRng(123);
  const b = makeRng(123);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('makeRng without a seed falls back to Math.random', () => {
  assert.equal(makeRng(undefined), Math.random);
});

test('gaussian output is centered near 0 over many samples', () => {
  const rng = makeRng(7);
  const n = 5000;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gaussian(rng);
  assert.ok(Math.abs(sum / n) < 0.1, `mean too far from 0: ${sum / n}`);
});
