import { createDifficultySearch } from './difficulty-generator.js';
import { countSolutions } from './puzzle.js';
import { PuzzlePool, levels } from './difficulty-pool.js';

// Worker-owned queues. No persistent puzzle storage and no analytics dependency.
export function createPuzzleService({ generate = createDifficultySearch, verify = countSolutions,
  clock = () => performance.now(), yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  capacity = 5, timeoutMs = 2000, sliceMs = 12, backgroundBudgetMs = 1000 } = {}) {
  const pool = new PuzzlePool(capacity), pending = [];
  let running = false, background = null, sequence = 0, paused = false, closed = false, started = false;
  function search(level, budget, backgroundMode = false) {
    const id = ++sequence;
    return generate(level, { maxTimeMs: budget,
      onCandidate: candidate => pool.offer({ ...candidate, origin: `${id}:${candidate.sourceId}` }),
      shouldStop: backgroundMode ? () => !pool.missing() || paused || closed : () => closed });
  }
  function advance(iterator) {
    const begin = clock(); let step;
    do { step = iterator.next(); } while (!step.done && clock() - begin < sliceMs);
    return step;
  }
  function stopBackground() { background?.return(); background = null; }
  async function serve(level) {
    stopBackground();
    const begin = clock();
    let selected = pool.take(level), cacheHit = Boolean(selected);
    if (!selected) {
      const iterator = search(level, timeoutMs); let step;
      try {
        do { step = advance(iterator); if (!step.done) await yieldControl(); } while (!step.done && !closed);
      } finally { iterator.return(); }
      if (closed) throw new Error('Puzzle service closed');
      selected = pool.take(level) || pool.fallback(level);
    }
    if (!selected) throw new Error('No puzzle ready. Please try again.');
    if (verify(selected.puzzle) !== 1) throw new Error('Puzzle verification failed');
    return { puzzle: selected.puzzle, requestedDifficulty: level, givenDifficulty: selected.grade.difficulty,
      generationMs: Math.max(0, Math.round(selected.generationMs)), serveMs: cacheHit ? 0 : Math.max(0, Math.round(clock() - begin)),
      cacheHit, generatorVersion: 'guided-v1', difficultyVersion: selected.grade.version };
  }
  async function pump() {
    if (running || closed) return;
    running = true;
    try {
      while (!closed) {
        if (pending.length) {
          const request = pending.shift();
          try { request.resolve(await serve(request.level)); } catch (error) { request.reject(error); }
          started = true;
        } else {
          if (paused || !started || !pool.missing()) break;
          if (!background) background = search(pool.missing(), backgroundBudgetMs, true);
          try { if (advance(background).done) background = null; }
          catch { stopBackground(); break; } // A later foreground request can retry.
        }
        await yieldControl();
      }
    } finally { running = false; }
  }
  return {
    warmup() { if (!closed) { started = true; void pump(); } },
    request(level) {
      if (!levels.includes(level)) return Promise.reject(new Error('Unknown difficulty level'));
      if (closed) return Promise.reject(new Error('Puzzle service closed'));
      const result = new Promise((resolve, reject) => pending.push({ level, resolve, reject }));
      void pump(); return result;
    },
    setPaused(value) { paused = Boolean(value); if (paused) stopBackground(); else void pump(); },
    close() {
      closed = true; stopBackground();
      while (pending.length) pending.shift().reject(new Error('Puzzle service closed'));
    },
    counts: () => pool.counts(),
  };
}
