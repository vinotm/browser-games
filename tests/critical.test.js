import test from 'node:test';
import assert from 'node:assert/strict';
import { createCritStats, collectCritBuff, rollFoodPoints } from '../snake-game/js/critical.js';
import { spawnIntervals } from '../snake-game/js/config.js';

test('initial crit chance is exactly 5% and gives double food points', () => {
  const stats = createCritStats();
  assert.deepEqual(rollFoodPoints(1, stats, () => 0.049999), { critical: true, points: 2 });
  assert.deepEqual(rollFoodPoints(1, stats, () => 0.05), { critical: false, points: 1 });
  assert.equal(rollFoodPoints(2, stats, () => 0).points, 4);
  assert.equal(rollFoodPoints(5, stats, () => 0).points, 10);
});

test('upgrades add percentage points and respect independent caps', () => {
  const stats = createCritStats();
  collectCritBuff(stats, 'critRate');
  collectCritBuff(stats, 'critMultiplier');
  assert.deepEqual(stats, { chancePercent: 10, bonusPercent: 200 });
  assert.equal(rollFoodPoints(5, stats, () => 0).points, 15);
  for (let i = 0; i < 100; i++) {
    collectCritBuff(stats, 'critRate');
    collectCritBuff(stats, 'critMultiplier');
  }
  assert.deepEqual(stats, { chancePercent: 50, bonusPercent: 900 });
  assert.equal(collectCritBuff(stats, 'critRate'), false);
  assert.equal(collectCritBuff(stats, 'critMultiplier'), false);
  assert.deepEqual(rollFoodPoints(5, stats, () => 0.499999), { critical: true, points: 50 });
  assert.deepEqual(rollFoodPoints(5, stats, () => 0.5), { critical: false, points: 5 });
  assert.deepEqual(createCritStats(), { chancePercent: 5, bonusPercent: 100 });
});

test('crit pickups have longer spawn intervals than existing specials', () => {
  for (const type of ['large', 'shortener', 'extender']) {
    assert.ok(spawnIntervals.critRate[0] > spawnIntervals[type][1]);
  }
  assert.ok(spawnIntervals.critMultiplier[0] > spawnIntervals.critRate[0]);
  assert.ok(spawnIntervals.critMultiplier[1] > spawnIntervals.critRate[1]);
});
