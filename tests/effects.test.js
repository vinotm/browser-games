import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedEffects, collectTimedEffect, effectActive, movementInterval,
  controlDirection, pickupDistance, reverseStatusOpacity } from '../snake-game/js/effects.js';

test('speed pickups refresh without stacking and opposing speeds cancel immediately', () => {
  for (const [type, other, step] of [['speedUp', 'slowDown', 60], ['slowDown', 'speedUp', 110]]) {
    const effects = createTimedEffects();
    assert.equal(movementInterval(effects, 0), 80);
    collectTimedEffect(effects, type, 100);
    assert.equal(effects[type], 3100);
    assert.equal(movementInterval(effects, 200), step);
    collectTimedEffect(effects, type, 2000);
    assert.equal(effects[type], 5000);
    assert.equal(movementInterval(effects, 4999), step);
    assert.equal(movementInterval(effects, 5000), 80);
    assert.equal(collectTimedEffect(effects, other, 4000), 'cancelled');
    assert.equal(effects.speedUp, 0);
    assert.equal(effects.slowDown, 0);
    assert.equal(movementInterval(effects, 4000), 80);
    collectTimedEffect(effects, type, 5000);
    // An expired opposite speed does not cancel the new pickup.
    assert.equal(collectTimedEffect(effects, other, 8000), 'activated');
    assert.equal(movementInterval(effects, 8000), other === 'speedUp' ? 60 : 110);
  }
});

test('Reverse flips all directions for ten seconds and refreshes on collection', () => {
  const effects = createTimedEffects();
  collectTimedEffect(effects, 'reverse', 100);
  for (const [from, to] of [['left', 'right'], ['right', 'left'], ['up', 'down'], ['down', 'up']]) {
    assert.equal(controlDirection(from, effects, 10099), to);
    assert.equal(controlDirection(from, effects, 10100), from);
  }
  collectTimedEffect(effects, 'reverse', 5000);
  assert.equal(effects.reverse, 15000);
  collectTimedEffect(effects, 'magnet', 5000);
  assert.ok(effectActive(effects, 'magnet', 14999));
  assert.equal(effectActive(effects, 'magnet', 15000), false);
  assert.deepEqual(createTimedEffects(), { speedUp: 0, slowDown: 0, reverse: 0, magnet: 0 });
});

test('pickup distance measures the full pickup center for magnet capture', () => {
  const head = { x: 10, y: 10 };
  assert.equal(pickupDistance(head, { x: 16, y: 10 }), 6);
  assert.ok(pickupDistance(head, { x: 16, y: 10 }, 2) > 6);
  assert.ok(pickupDistance(head, { x: 15, y: 10 }, 2) < 6);
});


test('Reverse status pulses near expiry, faster in the final second, without changing pickups', () => {
  const effects = { reverse: 10000 };
  assert.equal(reverseStatusOpacity(effects, 0), 0.95);
  assert.equal(reverseStatusOpacity(effects, 7500, true), 0.95);
  assert.ok(reverseStatusOpacity(effects, 7400) < reverseStatusOpacity(effects, 7600));
  assert.ok(Math.abs(reverseStatusOpacity(effects, 9200) - reverseStatusOpacity(effects, 9600)) < 1e-10);
  assert.equal(reverseStatusOpacity(effects, 10000), 0);
});
