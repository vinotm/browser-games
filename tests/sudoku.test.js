import { createDifficultyPuzzle } from '../sudoku-game/js/difficulty-generator.js';
const createPuzzle = (random = Math.random) => {
  const result = createDifficultyPuzzle('easy', { random });
  if (result.status !== 'success') throw new Error('Test puzzle generation failed');
  return result.puzzle;
};
import test from 'node:test';
import assert from 'node:assert/strict';
import { conflicts, solve, enteredValue, countSolutions } from '../sudoku-game/js/puzzle.js';
test('generated puzzles are unique and solve to valid complete boards', () => {
  for (let run = 0; run < 30; run++) {
    const board = createPuzzle(), original = [...board];
    assert.ok(board.filter(Boolean).length <= 36);
    assert.equal(countSolutions(board), 1);
    assert.equal(conflicts(board).some(Boolean), false);
    const solver = solve(board);
    let result;
    do { result = solver.next(); } while (!result.done);
    assert.equal(result.value, true);
    assert.equal(board.every(Boolean), true);
    assert.equal(conflicts(board).some(Boolean), false);
    original.forEach((value, i) => { if (value) assert.equal(board[i], value); });
  }
});
test('conflicts include both cells with a duplicated digit', () => {
  const board = Array(81).fill(0); board[0] = board[1] = 4;
  assert.deepEqual(conflicts(board).slice(0, 2), [true, true]);
});

test('repeating a digit only erases conflicting entries when checks are enabled', () => {
  const board = Array(81).fill(0); board[0] = board[1] = 4;
  assert.equal(enteredValue(board, 0, 4, true), 0);
  assert.equal(enteredValue(board, 0, 4, false), 4);
  assert.equal(enteredValue(board, 0, 5, true), 5);
  board[1] = 0;
  assert.equal(enteredValue(board, 0, 4, true), 4);
});

test('solution counter distinguishes impossible and ambiguous boards without mutation', () => {
  const empty = Array(81).fill(0);
  assert.equal(countSolutions(empty), 2);
  assert.deepEqual(empty, Array(81).fill(0));
  empty[0] = empty[1] = 1;
  assert.equal(countSolutions(empty), 0);
});
