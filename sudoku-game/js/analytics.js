import { DIFFICULTY_VERSION } from './difficulty.js';
import { levels } from './difficulty-pool.js';
// Cumulative summaries only: no selected cells, answers, notes or move history.
export const COUNTERS = ['entries', 'erases', 'note_edits', 'pencil_toggles', 'undos', 'redos',
  'checkpoint_saves', 'checkpoint_restores', 'conflict_entries'];
const PREFIX = 'sudoku-report-v1-';
export function browserReportStorage() {
  return {
    list: () => Object.keys(localStorage).filter(key => key.startsWith(PREFIX)),
    get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value),
    remove: key => localStorage.removeItem(key),
  };
}
export function createRunAnalytics({ endpoint = '', environment = 'unknown', buildId = 'unknown',
  device, storage = browserReportStorage(), fetcher = globalThis.fetch?.bind(globalThis),
  now = Date.now, clock = () => performance.now(), id = () => crypto.randomUUID() } = {}) {
  let run = null, sending = false, retryAt = 0, failures = 0, visible = true, foregroundAt = 0, foreground = 0;
  const stamp = () => new Date(now()).toISOString();
  function pending() {
    try { return storage.list().map(key => ({ key, value: JSON.parse(storage.get(key)) }))
      .filter(({ value }) => value?.schema_version === 1 && value.game === 'sudoku' && value.run_id && value.revision > 0)
      .sort((a, b) => a.value.updated_at.localeCompare(b.value.updated_at)); }
    catch { return []; }
  }
  function persist(value) {
    try {
      storage.set(PREFIX + value.run_id, JSON.stringify(value));
      const records = pending();
      let size = records.reduce((sum, item) => sum + JSON.stringify(item.value).length, 0);
      while (records.length > 100 || size > 200000 && records.length > 1) {
        const oldest = records.shift(); size -= JSON.stringify(oldest.value).length; storage.remove(oldest.key);
      }
    } catch { /* Storage denial must not affect play. */ }
  }
  function snapshot(progress = {}, outcome = 'in_progress') {
    if (!run) return;
    const filled = Math.max(0, Math.min(81 - run.clue_count, progress.filled ?? run.filled));
    run.filled = filled; run.peak_filled = Math.max(run.peak_filled, filled);
    run.elapsed_ms = Math.max(run.elapsed_ms, Math.round(progress.elapsed_ms ?? run.elapsed_ms));
    run.wall_elapsed_ms = Math.max(run.wall_elapsed_ms, now() - Date.parse(run.started_at), 0);
    run.foreground_ms = Math.min(run.wall_elapsed_ms, Math.round(foreground + (visible ? Math.max(0, clock() - foregroundAt) : 0)));
    run.updated_at = stamp(); run.outcome = outcome; run.revision++;
    run.ended_at = outcome === 'in_progress' ? null : run.updated_at;
    persist(run);
    return run;
  }
  async function flush({ keepalive = false, force = false } = {}) {
    if (!endpoint || !fetcher || sending || !force && now() < retryAt) return false;
    sending = true;
    try {
      // Keep unload requests comfortably below the browser's keepalive body budget.
      const records = pending().slice(0, 20);
      if (!records.length) return true;
      const batch = { schema_version: 1, game: 'sudoku', batch_id: id(), sent_at: stamp(), runs: records.map(item => item.value) };
      const response = await fetcher(endpoint, { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(batch), keepalive,
        signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('upload_failed');
      const ack = await response.json();
      if (!ack.ok || ack.batch_id !== batch.batch_id) throw new Error('upload_not_acknowledged');
      for (const { key, value } of records) {
        // Do not erase a newer snapshot created during this request (including in another tab).
        try { if (JSON.parse(storage.get(key))?.revision === value.revision) storage.remove(key); } catch { /* Retry later. */ }
      }
      retryAt = 0; failures = 0; return true;
    } catch {
      retryAt = now() + Math.min(60000, 2000 * 2 ** Math.min(5, failures++)); return false;
    } finally { sending = false; }
  }
  return {
    start(clues, checkConflicts, manualMode = false, delivery = null) {
      if (!endpoint) return;
      foreground = 0; foregroundAt = clock();
      run = { schema_version: 1, game: 'sudoku', game_version: 'beta-5.5', generator_version: delivery?.generatorVersion || 'unique-v1',
        run_id: id(), revision: 0, initial_clues: clues.join(''), clue_count: clues.filter(Boolean).length,
        check_conflicts: checkConflicts, manual_mode: manualMode, environment, build_id: buildId,
        device: typeof device === 'function' ? device() : device, started_at: stamp(),
        filled: 0, peak_filled: 0, elapsed_ms: 0, wall_elapsed_ms: 0, foreground_ms: 0,
        counters: Object.fromEntries(COUNTERS.map(key => [key, 0])) };
      if (delivery && levels.includes(delivery.requestedDifficulty) &&
          levels.indexOf(delivery.givenDifficulty) >= 0 &&
          levels.indexOf(delivery.givenDifficulty) <= levels.indexOf(delivery.requestedDifficulty) &&
          [delivery.generationMs, delivery.serveMs].every(value => Number.isFinite(value) && value >= 0 && value <= 300000)) {
        Object.assign(run, { requested_difficulty: delivery.requestedDifficulty, given_difficulty: delivery.givenDifficulty,
          puzzle_generation_ms: Math.round(delivery.generationMs), puzzle_serve_ms: Math.round(delivery.serveMs),
          difficulty_version: delivery.difficultyVersion || DIFFICULTY_VERSION });
      }
      snapshot();
    },
    count(key) { if (run && COUNTERS.includes(key)) run.counters[key]++; },
    progress(filled) { if (run) run.peak_filled = Math.max(run.peak_filled, filled); },
    checkpoint: snapshot,
    finish(outcome, progress) { snapshot(progress, outcome); run = null; },
    visibility(isVisible) {
      if (isVisible === visible) return;
      if (run && visible) foreground += Math.max(0, clock() - foregroundAt);
      visible = isVisible; foregroundAt = clock();
    },
    flush, get enabled() { return Boolean(endpoint); }, get active() { return Boolean(run); },
  };
}
