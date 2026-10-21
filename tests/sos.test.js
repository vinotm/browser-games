import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, play, allowedLetters } from '../sos-game/js/rules.js';
import { chooseMove } from '../sos-game/js/opponent.js';

test('SOS scores all four directions and grants another turn', () => {
  let state = createGame(4);
  for (const index of [0, 1, 2, 4, 6, 8, 9, 10]) state.cells[index] = 'S';
  state = play(state, 5, 'O');
  assert.equal(state.lines.length, 4); assert.deepEqual(state.scores, [4, 0]); assert.equal(state.player, 0);
});
test('shared letters score new lines without awarding old lines again', () => {
  let state = createGame(4);
  for (const [i, l] of [[0, 'S'], [1, 'O'], [2, 'S'], [4, 'O'], [8, 'S']]) state = play(state, i, l);
  assert.equal(state.lines.length, 2); assert.equal(state.scores.reduce((a,b) => a+b), 2);
  assert.equal(play(state, 0, 'O'), null); assert.equal(play(state, 16, 'S'), null);
});
test('does not wrap SOS across rows and rejects invalid moves', () => {
  const state = createGame(4); state.cells[3]='S'; state.cells[4]='O';
  assert.equal(play(state, 5, 'S').lines.length, 0);
  for (const [i,l] of [[-1,'S'],[.5,'O'],[0,'X']]) assert.equal(play(state,i,l),null);
  assert.throws(() => createGame(11));
});
test('final move ends game even if it scores', () => {
  const state=createGame(4); state.cells.fill('S'); state.cells[1]='';
  const next=play(state,1,'O'); assert.equal(next.finished,true); assert.ok(next.scores[0]>0);
  assert.equal(play(next,1,'S'),null); assert.equal(chooseMove(next),null);
});
test('computer takes a scoring move and avoids gifting an immediate SOS', () => {
  let state=createGame(4); state.cells[0]='S'; state.cells[1]='O';
  let move=chooseMove(state,{random:()=>0}); assert.equal(move.index,2); assert.equal(move.letter,'S');
  state=createGame(4); state.cells[0]='S';
  move=chooseMove(state,{random:()=>0}); const next=play(state,move.index,move.letter);
  for (let i=0;i<16;i++) for (const l of ['S','O']) {
    const reply=play(next,i,l); if(reply) assert.equal(reply.scores[1],0);
  }
});
test('full computer match remains legal and accounts for every scored line', () => {
  let state=createGame(4), turns=0;
  while(!state.finished) { const move=chooseMove(state,{maxNodes:800,random:()=>.4}); state=play(state,move.index,move.letter); assert.ok(state); turns++; }
  assert.equal(turns,16); assert.equal(state.lines.length,state.scores[0]+state.scores[1]);
  assert.equal(new Set(state.lines.map(line=>line.indices.join(','))).size,state.lines.length);
});


test('all difficulty settings return legal moves for either starting player', async () => {
  const { computerMove } = await import('../sos-game/js/difficulty.js');
  for (const difficulty of ['easy', 'medium', 'hard']) for (const player of [0, 1]) {
    const state = createGame(4); state.player = player;
    const move = computerMove(state, difficulty, () => .2);
    assert.ok(play(state, move.index, move.letter));
  }
});

test('letter limit tracks each player independently and resets only their streak', () => {
  for (const letter of ['S', 'O']) {
    let state = createGame(4);
    const other = letter === 'S' ? 'O' : 'S';
    // Separate rows avoid scoring extra turns in this sequence.
    for (const [index, value] of [[0, letter], [4, other], [1, letter], [5, other]]) {
      const before = structuredClone(state);
      const next = play(state, index, value);
      assert.deepEqual(state, before); // Nested histories must remain immutable.
      state = next;
    }
    assert.equal(state.player, 0);
    assert.deepEqual(state.letterStreaks, [{ letter, count: 2 }, { letter: other, count: 2 }]);
    const before = structuredClone(state);
    assert.equal(play(state, 2, letter), null);
    assert.deepEqual(state, before);
    assert.deepEqual(allowedLetters(state), [other]);
    state = play(state, 2, other);
    assert.deepEqual(state.letterStreaks[0], { letter: other, count: 1 });
    assert.deepEqual(state.letterStreaks[1], { letter: other, count: 2 });
    assert.equal(state.player, 1);
    assert.deepEqual(allowedLetters(state), [letter]);
    assert.equal(play(state, 6, other), null);
    state = play(state, 6, letter);
    assert.deepEqual(state.letterStreaks[1], { letter, count: 1 });
  }
  assert.deepEqual(createGame().letterStreaks.map(streak => streak.count), [0, 0]);
});

test('two players may each place the same letter twice before their own restriction', () => {
  let state = createGame(4);
  for (const index of [0, 4, 1, 5]) state = play(state, index, 'S');
  assert.ok(state);
  assert.deepEqual(state.letterStreaks, [{ letter: 'S', count: 2 }, { letter: 'S', count: 2 }]);
  assert.equal(play(state, 2, 'S'), null);
});

test('scoring extra turns retain the scoring player’s letter limit', () => {
  let state = createGame(4);
  for (const [index, letter] of [[0, 'S'], [1, 'O'], [2, 'S']]) state = play(state, index, letter);
  assert.equal(state.scores[0], 1); assert.equal(state.player, 0);
  assert.equal(state.letterStreaks[0].count, 2);
  assert.equal(play(state, 3, 'S'), null);
  assert.ok(play(state, 3, 'O'));
});

test('every computer level respects its own restricted letters in search and random play', async () => {
  const { computerMove } = await import('../sos-game/js/difficulty.js');
  for (const letter of ['S', 'O']) for (const player of [0, 1]) {
    const state = createGame(4);
    state.player = player;
    state.letterStreaks[player] = { letter, count: 2 };
    state.letterStreaks[1 - player] = { letter: letter === 'S' ? 'O' : 'S', count: 2 };
    for (const difficulty of ['easy', 'medium', 'hard']) for (const random of [() => .1, () => .9]) {
      const move = computerMove(state, difficulty, random);
      assert.notEqual(move.letter, letter);
      assert.ok(play(state, move.index, move.letter));
    }
  }
});
