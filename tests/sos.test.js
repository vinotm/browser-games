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
  assert.throws(() => createGame(21));
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
  for (const difficulty of ['easy', 'casual', 'medium', 'advanced', 'hard']) for (const player of [0, 1]) {
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

test('rectangular boards score all directions without wrapping and enforce dimension bounds', () => {
  for (const [rows, columns] of [[3,8],[8,3],[12,20],[20,12]]) {
    let state = createGame(rows, columns), center = columns + 1;
    for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      state.cells[center-dr*columns-dc]='S'; state.cells[center+dr*columns+dc]='S';
    }
    state = play(state, center, 'O');
    assert.equal(state.lines.length, 4); assert.equal(state.cells.length, rows*columns);
    assert.equal(state.scores[0],4); assert.equal(state.player,0);
    const edge = createGame(rows,columns); edge.cells[columns-1]='S'; edge.cells[columns]='O';
    assert.equal(play(edge,columns+1,'S').lines.length,0);
  }
  for (const dimensions of [[2,10],[10,21],[21,10],[3.5,8],[NaN,6]]) assert.throws(()=>createGame(...dimensions));
  assert.equal(createGame(20,20).cells.length,400);
});
test('large-board computer sees distant scoring clusters and respects letter restrictions', async () => {
  const {computerMove} = await import('../sos-game/js/difficulty.js');
  for(const [rows,columns] of [[12,20],[20,12],[20,20]]) {
    const state=createGame(rows,columns), end=rows*columns-1;
    state.cells[end-2]='S';state.cells[end-1]='O';
    const move=computerMove(state,'hard',()=>0);
    assert.equal(move.index,end);assert.equal(move.letter,'S');
    state.letterStreaks[0]={letter:'S',count:2};
    const restricted=computerMove(state,'hard',()=>0);
    assert.equal(restricted.letter,'O');assert.ok(play(state,restricted.index,restricted.letter));
  }
});

test('999-point threshold ends play immediately, including a multi-line overshoot', () => {
  for (const player of [0, 1]) for (const before of [995, 998]) {
    const state = createGame(4); state.player = player; state.scores[player] = before;
    for (const index of [0, 1, 2, 4, 6, 8, 9, 10]) state.cells[index] = 'S';
    const next = play(state, 5, 'O');
    assert.equal(next.scores[player], before + 4);
    assert.ok(next.cells.includes(''));
    assert.equal(next.finished, true);
    assert.deepEqual(allowedLetters(next), []);
    assert.equal(play(next, 3, 'S'), null);
    assert.equal(chooseMove(next), null);
  }
  const state = createGame(4); state.scores[0] = 997;
  state.cells[0] = 'S'; state.cells[1] = 'O';
  assert.equal(play(state, 2, 'S').finished, false);
});

test('five levels preserve legacy anchors and normalize saved settings', async () => {
  const { computerMove, normalizeDifficulty, difficultyLevel } = await import('../sos-game/js/difficulty.js');
  for (const [level, key] of ['easy', 'casual', 'medium', 'advanced', 'hard'].entries()) {
    assert.equal(normalizeDifficulty(String(level + 1)), key);
    assert.equal(difficultyLevel(key), level + 1);
  }
  for (const value of [undefined, null, 'invalid', 0, 6, 2.5]) assert.equal(normalizeDifficulty(value), 'medium');
  const state = createGame(4);
  for (const [level, key, depth, maxNodes] of [[1, 'easy', 1, 500], [3, 'medium', 2, 3000], [5, 'hard', 4, 18000]]) {
    assert.deepEqual(computerMove(state, level, () => .9), chooseMove(state, { depth, maxNodes, random: () => .9 }));
    assert.deepEqual(computerMove(state, level, () => .9), computerMove(state, key, () => .9));
  }
  let stats;
  computerMove(state, 2, () => .1, value => { stats = value; });
  assert.equal(stats.random, true);
  computerMove(state, 2, () => .3, value => { stats = value; });
  assert.equal(stats.random, false);
  for (const level of [2, 4]) {
    const large = createGame(12, 12);
    large.letterStreaks[0] = { letter: 'S', count: 2 };
    const move = computerMove(large, level, () => .9);
    assert.equal(move.letter, 'O');
    assert.ok(play(large, move.index, move.letter));
  }
});
