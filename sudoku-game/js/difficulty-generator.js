// Fresh, bounded generation guided by human-style solving. No puzzle bank or storage.
import { gradePuzzle } from './difficulty.js';
import { countSolutions } from './puzzle.js';

export const DIFFICULTY_GENERATOR_VERSION = 'guided-v1';
const levels = ['easy', 'medium', 'hard'];
const cells = Array.from({ length: 81 }, (_, i) => i);
const boxOf = i => Math.floor(i / 27) * 3 + Math.floor(i % 9 / 3);
function shuffled(input, random) {
  const result = [...input];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Randomized MRV backtracking constructs a complete grid rather than permuting
// a stored seed. Bit masks track the three constraints during construction.
function completeGrid(random, stop, stats) {
  const board = Array(81).fill(0);
  const rows = Array(9).fill(0), columns = Array(9).fill(0), boxes = Array(9).fill(0);
  function search() {
    stats.solutionNodes++;
    if (stats.solutionNodes % 32 === 0 && stop()) return false;
    let index = -1, choices, smallest = 10;
    for (const i of cells) {
      if (board[i]) continue;
      const mask = 511 & ~(rows[Math.floor(i / 9)] | columns[i % 9] | boxes[boxOf(i)]);
      let count = 0;
      for (let m = mask; m; m &= m - 1) count++;
      if (!count) return false;
      if (count < smallest) {
        index = i; choices = mask; smallest = count;
        if (count === 1) break;
      }
    }
    if (index < 0) return true;
    const r = Math.floor(index / 9), c = index % 9, b = boxOf(index);
    const options = [];
    for (let digit = 1; digit <= 9; digit++) if (choices & (1 << (digit - 1))) options.push(digit);
    for (const digit of shuffled(options, random)) {
      const mask = 1 << (digit - 1);
      board[index] = digit; rows[r] |= mask; columns[c] |= mask; boxes[b] |= mask;
      if (search()) return true;
      board[index] = 0; rows[r] ^= mask; columns[c] ^= mask; boxes[b] ^= mask;
      if (stop()) return false;
    }
    return false;
  }
  return search() ? board : null;
}

/**
 * Incremental search: next() yields between clue-removal checks. Its final
 * return value is {status:'success', puzzle, grade, stats}, or
 * {status:'exhausted', reason, stats}. It never substitutes another difficulty.
 * Budgets are checked between deductions/removals; one synchronous operation may
 * finish just beyond the time limit. Run this in a worker, not on the UI thread.
 */
export function* createDifficultySearch(difficulty, {
  random = Math.random, maxTimeMs = 10_000, maxPasses = 100, maxChecks = 6000, maxClues = 36,
  onCandidate = null, shouldStop = null
} = {}) {
  if (!levels.includes(difficulty)) throw new Error('Unknown difficulty level');
  if (typeof random !== 'function') throw new Error('Expected a random function');
  if (onCandidate !== null && typeof onCandidate !== 'function') throw new Error('Expected a candidate callback');
  if (shouldStop !== null && typeof shouldStop !== 'function') throw new Error('Expected a stop callback');
  if (!Number.isFinite(maxTimeMs) || maxTimeMs < 0 ||
      !Number.isInteger(maxPasses) || maxPasses < 0 ||
      !Number.isInteger(maxChecks) || maxChecks < 0 ||
      !Number.isInteger(maxClues) || maxClues < 17 || maxClues > 80) {
    throw new Error('Invalid generation budget or clue limit');
  }
  const rng = () => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Random values must be in [0, 1)');
    return value;
  };
  const started = performance.now();
  const stats = { version: DIFFICULTY_GENERATOR_VERSION, requestedDifficulty: difficulty,
    passes: 0, completeGrids: 0, branchRestarts: 0, solutionNodes: 0, gradeChecks: 0,
    acceptedRemovals: 0, rejectedRemovals: 0, uniquenessChecks: 0, elapsedMs: 0 };
  let reason = null;
  function stop() {
    if (reason) return true;
    if (shouldStop?.()) reason = 'cancelled';
    else if (performance.now() - started >= maxTimeMs) reason = 'time';
    else if (stats.gradeChecks >= maxChecks) reason = 'checks';
    return Boolean(reason);
  }
  function finish(result) {
    stats.elapsedMs = performance.now() - started;
    return { ...result, stats };
  }
  // A few intermediate boards live only within this call. Revisit their clue
  // removals in a different order, then restart with a genuinely fresh solution.
  let branches = [], passesOnGrid = 0, gridStarted = started;
  while (stats.passes < maxPasses && !stop()) {
    stats.passes++;
    let board;
    if (branches.length && passesOnGrid < 3) {
      board = [...branches[Math.floor(rng() * branches.length)]];
      stats.branchRestarts++;
    } else {
      branches = []; passesOnGrid = 0;
      gridStarted = performance.now();
      board = completeGrid(rng, stop, stats);
      if (!board) {
        if (!reason) throw new Error('Complete grid construction failed');
        break;
      }
      stats.completeGrids++;
    }
    passesOnGrid++;
    let remaining = board.filter(Boolean).length;
    for (const index of shuffled(cells.filter(i => board[i]), rng)) {
      if (stop()) break;
      const previous = board[index]; board[index] = 0;
      stats.gradeChecks++;
      const grade = gradePuzzle(board, { maxLevel: difficulty });
      if (grade.status === 'invalid') throw new Error('Logical grading contradicted the generated solution');
      if (grade.status !== 'solved') {
        // Solvability by permitted logic is the acceptance criterion: restore a
        // clue that would require a guess or an unsupported technique.
        board[index] = previous; stats.rejectedRemovals++;
        yield;
        continue;
      }
      remaining--; stats.acceptedRemovals++;
      if (onCandidate && remaining <= maxClues) {
        onCandidate({ puzzle: [...board], grade: { ...grade, counts: { ...grade.counts } },
          generationMs: performance.now() - gridStarted, sourceId: stats.completeGrids });
      }
      if (grade.difficulty === difficulty && remaining <= maxClues) {
        // A completed sound logical solve already establishes uniqueness. Use
        // the independent search solver as a final check before publishing it.
        stats.uniquenessChecks++;
        if (countSolutions(board) !== 1) throw new Error('Generated puzzle failed uniqueness verification');
        return finish({ status: 'success', puzzle: board, grade });
      }
      const intermediate = difficulty === 'hard' ? 'medium' : 'easy';
      if (difficulty !== 'easy' && grade.difficulty === intermediate && remaining <= maxClues && branches.length < 4) {
        branches.push([...board]);
      }
      yield;
    }
  }
  return finish({ status: 'exhausted', reason: reason || 'passes' });
}

// Synchronous compatibility API. A background worker can instead advance the
// search iterator in short slices, yielding to incoming foreground requests.
export function createDifficultyPuzzle(difficulty, options) {
  const search = createDifficultySearch(difficulty, options);
  let step;
  do { step = search.next(); } while (!step.done);
  return step.value;
}
