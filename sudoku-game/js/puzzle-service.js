import { createDifficultySearch, DIFFICULTY_GENERATOR_VERSION } from './difficulty-generator.js';
import { countSolutions } from './puzzle.js';
import { PuzzlePool, levels } from './difficulty-pool.js';

// Worker-owned queues with optional persistent storage; no analytics dependency.
export function createPuzzleService({ generate = createDifficultySearch, verify = countSolutions,
  clock = () => performance.now(), yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  store = null, capacity = 5, timeoutMs = 2000, sliceMs = 12, backgroundBudgetMs = 1000 } = {}) {
  const pool = new PuzzlePool(capacity), pending = [];
  let running = false, background = null, sequence = 0, paused = false, closed = false, started = false;
  let persistence = Promise.resolve(), usableStore = store;
  function persist(candidate) {
    if (usableStore) persistence = persistence.then(() => usableStore?.offer(candidate)).catch(() => { usableStore = null; });
  }
  const ready = store ? store.load().then(candidates => {
    for (const candidate of candidates) {
      if (Array.isArray(candidate.puzzle) && candidate.puzzle.length === 81 &&
          candidate.puzzle.every(n => Number.isInteger(n) && n >= 0 && n <= 9) &&
          levels.includes(candidate.grade?.difficulty) && Number.isFinite(candidate.generationMs) &&
          verify(candidate.puzzle) === 1) pool.offer(candidate);
    }
  }).catch(() => { usableStore = null; }) : Promise.resolve();
  async function take(level, fallback = false) {
    let candidate;
    while ((candidate = fallback ? pool.fallback(level) : pool.take(level))) {
      await persistence;
      if (!usableStore) return candidate;
      try { if (await usableStore.claim(candidate)) return candidate; }
      catch { usableStore = null; return candidate; }
    }
    return null;
  }
  function search(level, budget, backgroundMode = false) {
    const id = `${globalThis.crypto?.randomUUID?.() || Math.random()}:${++sequence}`;
    return generate(level, { maxTimeMs: budget,
      onCandidate: candidate => {
        const entry = { ...candidate, origin: `${id}:${candidate.sourceId}` };
        pool.offer(entry); persist(entry);
      },
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
    let selected = await take(level), cacheHit = Boolean(selected);
    if (!selected) {
      const iterator = search(level, timeoutMs); let step;
      try {
        do { step = advance(iterator); if (!step.done) await yieldControl(); } while (!step.done && !closed);
      } finally { iterator.return(); }
      if (closed) throw new Error('Puzzle service closed');
      selected = await take(level) || await take(level, true);
    }
    if (!selected) throw new Error('No puzzle ready. Please try again.');
    if (verify(selected.puzzle) !== 1) throw new Error('Puzzle verification failed');
    return { puzzle: selected.puzzle, requestedDifficulty: level, givenDifficulty: selected.grade.difficulty,
      generationMs: Math.max(0, Math.round(selected.generationMs)), serveMs: cacheHit ? 0 : Math.max(0, Math.round(clock() - begin)),
      cacheHit, generatorVersion: DIFFICULTY_GENERATOR_VERSION, difficultyVersion: selected.grade.version };
  }
  async function pump() {
    if (running || closed) return;
    running = true;
    try {
      await ready;
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
