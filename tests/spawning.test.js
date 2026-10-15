import test from 'node:test';
import assert from 'node:assert/strict';
import { movingFoodWait, createTemporarySpawner, temporarySpawnSucceeded,
  temporarySpawnDeferred } from '../snake-game/js/spawning.js';
import { spawnIntervals } from '../snake-game/js/config.js';

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('moving-food wait is 20% immediately after unlock and 36% by the next static food', () => {
  let first = 0, second = 0;
  // Evenly sample the probability range to audit the distribution, without flaky RNG.
  for (let i = 0; i < 100000; i++) {
    const wait = movingFoodWait(() => (i + 0.5) / 100000);
    if (wait <= 1) first++;
    if (wait <= 2) second++;
    assert.ok(wait >= 1);
  }
  assert.equal(first, 20000);
  assert.equal(second, 36000);
});

test('temporary pickups vary order, avoid consecutive repeats, and maintain per-bag variety', () => {
  const firstTypes = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const random = seeded(seed);
    const state = createTemporarySpawner(1000, random);
    assert.ok(state.nextAt >= 15000 && state.nextAt < 25000);
    firstTypes.add(state.queue[0]);
    let previous = null;
    for (let batch = 0; batch < 10; batch++) {
      const counts = {};
      for (let i = 0; i < 6; i++) {
        const type = state.queue[0];
        assert.notEqual(type, previous);
        counts[type] = (counts[type] || 0) + 1;
        const now = state.nextAt;
        temporarySpawnSucceeded(state, now, random);
        const gap = state.nextAt - now;
        assert.ok((gap >= 5000 && gap < 10000) || (gap >= 12000 && gap < 18000));
        previous = type;
      }
      assert.deepEqual(counts, { speedUp: 2, slowDown: 2, reverse: 1, magnet: 1 });
    }
  }
  assert.equal(firstTypes.size, 4);
});

test('failed placement retries without losing the chosen item or consuming the bag', () => {
  const state = createTemporarySpawner(0, seeded(1));
  const queue = [...state.queue];
  const now = state.nextAt;
  temporarySpawnDeferred(state, now, () => 0.5);
  assert.equal(state.nextAt, now + 1500);
  assert.deepEqual(state.queue, queue);
  assert.equal(state.previous, null);
  temporarySpawnSucceeded(state, state.nextAt, () => 0);
  assert.equal(state.previous, queue[0]);
});

test('constant RNG still produces valid varied bags without hanging', () => {
  const state = createTemporarySpawner(0, () => 0);
  for (let i = 0; i < 24; i++) {
    const last = state.queue[0];
    temporarySpawnSucceeded(state, state.nextAt, () => 0);
    assert.notEqual(state.queue[0], last);
  }
});

test('shortener and lengthener spawn windows are moderately shorter', () => {
  assert.deepEqual(spawnIntervals.shortener, [8000, 14000]);
  assert.deepEqual(spawnIntervals.extender, [10000, 16000]);
});
