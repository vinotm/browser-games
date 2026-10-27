import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGame, SHAPES } from '../memory-game/js/engine.js';

// A deterministic RNG makes a complete layout available to the test only.
const ordered = () => createMemoryGame(() => 0.999999);

test('memory hides identities until revealed, rejects invalid and repeated choices', () => {
  const game = ordered();
  assert.equal(game.view().cards.length, 16);
  assert.ok(game.view().cards.every(card => card.shape === null));
  for (const index of [-1, 16, 0.5, NaN, '0']) assert.equal(game.flip(index), false);
  assert.equal(game.flip(0), true);
  assert.equal(game.flip(0), false);
  assert.equal(game.view().moves, 0);
  assert.equal(game.view().cards[0].shape, 'circle');
  assert.equal(game.view().cards.filter(card => card.shape).length, 1);
});

test('a new face-down choice immediately conceals the previous mismatch', () => {
  const game = ordered();
  game.flip(0); game.flip(1);
  assert.equal(game.view().moves, 1);
  assert.equal(game.view().pending, true);
  assert.equal(game.flip(0), false); // Clicking an exposed card changes nothing.
  assert.equal(game.view().pending, true);
  assert.equal(game.flip(2), true);
  assert.equal(game.view().pairs, 0);
  assert.equal(game.view().moves, 1);
  assert.equal(game.view().pending, false);
  assert.deepEqual(game.view().cards.filter(card => card.shape).map(card => card.index), [2]);
  // Returned snapshots cannot mutate the engine's hidden state.
  game.view().cards[2].shape = 'circle';
  assert.equal(game.view().cards[2].shape, 'triangle');
  game.flip(3);
  assert.equal(game.view().moves, 2);
  game.conceal();
  assert.ok(game.view().cards.every(card => card.shape === null));
});

test('memory retains matches and completes only after all eight distinct pairs', () => {
  const game = ordered();
  for (let i = 0; i < 8; i++) {
    assert.equal(game.flip(i), true);
    assert.equal(game.flip(i + 8), true);
    assert.equal(game.view().pairs, i + 1);
    assert.equal(game.view().complete, i === 7);
    assert.equal(game.flip(i), false);
    game.conceal();
    assert.equal(game.view().cards[i].shape, SHAPES[i]);
  }
  assert.equal(game.view().moves, 8);
  assert.ok(game.view().cards.every(card => card.matched));
});

test('shuffled memory decks always contain exactly two of each shape', () => {
  for (let run = 0; run < 40; run++) {
    const game = createMemoryGame();
    const found = [];
    for (let index = 0; index < 16; index += 2) {
      game.flip(index); game.flip(index + 1);
      found.push(game.view().cards[index].shape, game.view().cards[index + 1].shape);
      game.conceal();
    }
    for (const shape of SHAPES.slice(0, 8)) assert.equal(found.filter(value => value === shape).length, 2);
  }
});


test('custom boards have even identity counts, random blocked cells and solvable layouts', () => {
  for (const [rows, columns] of [[3,3], [5,7], [6,6], [4,9], [3,13], [12,12], [13,13], [14,14], [20,20]]) {
    const game = createMemoryGame(Math.random, { rows, columns });
    const groups = new Map();
    let blocked = 0;
    for (let i = 0; i < rows * columns; i++) {
      if (game.view().cards[i].blocked) { blocked++; assert.equal(game.flip(i), false); continue; }
      game.conceal(); game.flip(i);
      const shape = game.view().cards[i].shape;
      const entries = groups.get(shape) ?? []; entries.push(i); groups.set(shape, entries);
    }
    assert.equal(blocked, rows * columns % 2);
    assert.ok([...groups.values()].every(indices => indices.length % 2 === 0));
    const keys = [...groups.keys()];
    assert.equal(keys.some(key => key.includes(':')), rows * columns > 36);
    assert.equal(keys.some(key => key.endsWith(':small')), rows * columns > 192);
    if (rows * columns > 192) assert.ok(keys.some(key => key.endsWith(':large')));
    game.conceal();
    for (const indices of groups.values()) for (let i = 0; i < indices.length; i += 2) {
      game.flip(indices[i]); game.flip(indices[i + 1]);
    }
    assert.equal(game.view().complete, true);
  }
  for (const rows of [0, 2, 21, 3.5, NaN]) assert.throws(() => createMemoryGame(Math.random, { rows }), RangeError);
});


test('boards above 36 cells require matching color as well as shape', () => {
  const game = createMemoryGame(() => .999999, { rows: 4, columns: 10 });
  const identities = [];
  for (let index = 0; index < 20; index++) {
    game.conceal(); game.flip(index); identities.push(game.view().cards[index].shape);
  }
  assert.equal(new Set(identities.map(key => key.split(':')[1])).size, 4);
  const a = identities.findIndex(key => key === 'circle:0:normal');
  const b = identities.findIndex(key => key === 'circle:1:normal');
  game.conceal(); game.flip(a); game.flip(b);
  assert.equal(game.view().pairs, 0);
  assert.equal(game.view().pending, true);
});
