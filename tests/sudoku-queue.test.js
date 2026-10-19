import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleQueue } from '../sudoku-game/js/puzzle-queue.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
test('queue fills to ten, hands out distinct puzzles, and replenishes sequentially', async () => {
  let calls = 0, active = 0, peak = 0;
  const queue = createPuzzleQueue(async () => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return [++calls];
  });
  assert.deepEqual(await queue.take(), [1]);
  await tick();
  assert.equal(queue.size, 10);
  assert.equal(calls, 11);
  assert.deepEqual(await queue.take(), [2]);
  await tick();
  assert.equal(queue.size, 10);
  assert.equal(calls, 12);
  assert.equal(peak, 1);
});
test('empty queue serves waiting requests and recovers from generation failure', async () => {
  let fail = true, n = 0;
  const queue = createPuzzleQueue(async () => {
    if (fail) throw new Error('generation failed');
    return [++n];
  }, 2);
  await assert.rejects(queue.take(), /generation failed/);
  fail = false;
  const puzzles = await Promise.all([queue.take(), queue.take(), queue.take()]);
  assert.deepEqual(puzzles, [[1], [2], [3]]);
  await tick();
  assert.equal(queue.size, 2);
});
