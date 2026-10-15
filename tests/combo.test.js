import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombo, advanceCombo, expireCombo, comboMultiplier, comboFade, scoreWithCombo } from '../snake-game/js/combo.js';

test('food chains refresh three seconds and reach tiers on the threshold food', () => {
  const combo = createCombo();
  for (let i = 1; i <= 10; i++) {
    advanceCombo(combo, i * 1000, `food:${i}`);
    assert.equal(combo.count, i);
    assert.equal(combo.expiresAt, i * 1000 + 3000);
    assert.equal(comboMultiplier(combo, i * 1000), i >= 10 ? 3 : i >= 6 ? 2 : i >= 3 ? 1.5 : 1);
  }
  expireCombo(combo, 12999);
  assert.equal(combo.count, 10);
  expireCombo(combo, 13000);
  assert.deepEqual(combo, createCombo());
  advanceCombo(combo, 13000, 'next');
  assert.equal(combo.count, 1);
});

test('one magnet group advances once without repeated refresh', () => {
  const combo = createCombo();
  advanceCombo(combo, 1000, 'magnet:1');
  advanceCombo(combo, 1010, 'magnet:1');
  assert.equal(combo.count, 1);
  assert.equal(combo.expiresAt, 4000);
  advanceCombo(combo, 1020, 'magnet:2');
  assert.equal(combo.count, 2);
});

test('crit and combo combine into the displayed score with one rounding', () => {
  const combo = createCombo();
  for (let i = 1; i <= 3; i++) advanceCombo(combo, 0, i);
  const stats = { chancePercent: 50, bonusPercent: 100 };
  assert.deepEqual(scoreWithCombo(1, stats, combo, 0, () => 0.9), { points: 2, critical: false });
  assert.deepEqual(scoreWithCombo(1, stats, combo, 0, () => 0), { points: 3, critical: true });
  assert.deepEqual(scoreWithCombo(5, stats, combo, 0, () => 0), { points: 15, critical: true });
  assert.equal(scoreWithCombo(5, stats, combo, 3000, () => 0.9).points, 5);
});

test('combo opacity falls gradually over its final second and resets on food', () => {
  const combo = createCombo();
  advanceCombo(combo, 0, 'first');
  advanceCombo(combo, 0, 'second');
  assert.equal(comboFade(combo, 2000), 1);
  assert.equal(comboFade(combo, 2500), 0.5);
  assert.ok(comboFade(combo, 2750) < comboFade(combo, 2500));
  assert.equal(comboFade(combo, 3000), 0);
  advanceCombo(combo, 2750, 'third');
  assert.equal(comboFade(combo, 2750), 1);
});
