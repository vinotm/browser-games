import { VERSION } from './rules.js';
import { difficultyLevel } from './difficulty.js';
const PREFIX = 'sos-report-v1-';
const MAX_BYTES = 200000, MAX_BATCH_BYTES = 60000;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function browserReportStorage() {
  return { list: () => Object.keys(localStorage).filter(key => key.startsWith(PREFIX)),
    get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value),
    remove: key => localStorage.removeItem(key) };
}
// Cumulative match snapshots: moves are [cell index, S=0/O=1, elapsed milliseconds].
// Players, strikes and points can be reconstructed from the first player and rules.
export function createRunAnalytics({ endpoint = '', environment = 'unknown', buildId = 'unknown',
  device = { category: 'unknown', input: 'unknown', viewport: 'unknown' },
  storage = browserReportStorage(), fetcher = globalThis.fetch?.bind(globalThis),
  now = Date.now, clock = () => performance.now(), id = () => crypto.randomUUID() } = {}) {
  let run = null, sending = false, retryAt = 0, failures = 0, visible = true;
  let startedAt = 0, foregroundAt = 0, foreground = 0;
  const stamp = () => new Date(now()).toISOString();
  function pending() {
    const records = [];
    try {
      for (const key of storage.list()) {
        try {
          const value = JSON.parse(storage.get(key));
          if (key.startsWith(PREFIX) && [1, 2].includes(value?.schema_version) && value.game === 'sos' &&
              typeof value.run_id === 'string' && Number.isSafeInteger(value.revision) && value.revision > 0 &&
              typeof value.updated_at === 'string' && bytes(value) < MAX_BATCH_BYTES - 1000) records.push({ key, value });
        } catch { /* One malformed record must not block other uploads. */ }
      }
    } catch { /* Storage may be unavailable. */ }
    return records.sort((a, b) => a.value.updated_at.localeCompare(b.value.updated_at));
  }
  function persist() {
    try {
      storage.set(PREFIX + run.run_id, JSON.stringify(run));
      const records = pending();
      let size = records.reduce((sum, item) => sum + bytes(item.value), 0);
      while (records.length > 100 || size > MAX_BYTES) {
        const oldest = records.shift(); size -= bytes(oldest.value); storage.remove(oldest.key);
      }
    } catch { /* Analytics must never interrupt play. */ }
  }
  function checkpoint() {
    if (!run) return;
    run.elapsed_ms = Math.max(run.elapsed_ms, Math.round(clock() - startedAt), 0);
    run.foreground_ms = Math.min(run.elapsed_ms, Math.round(foreground + (visible ? Math.max(0, clock() - foregroundAt) : 0)));
    run.updated_at = stamp();
    if (run.outcome !== 'in_progress') run.ended_at = run.updated_at;
    run.revision++; persist();
  }
  async function flush({ keepalive = false, force = false } = {}) {
    if (!endpoint || !fetcher || sending || !force && now() < retryAt) return false;
    sending = true;
    try {
      const records = [], batch = { schema_version: 2, game: 'sos', batch_id: id(), sent_at: stamp(), runs: [] };
      for (const record of pending()) {
        batch.runs.push(record.value);
        if (bytes(batch) > MAX_BATCH_BYTES) { batch.runs.pop(); break; }
        records.push(record);
        if (records.length === 20) break;
      }
      if (!records.length) return true;
      const response = await fetcher(endpoint, { method: 'POST', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(batch), keepalive,
        signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error('upload_failed');
      const ack = await response.json();
      if (!ack.ok || ack.batch_id !== batch.batch_id) throw Error('upload_not_acknowledged');
      for (const { key, value } of records) {
        try { if (JSON.parse(storage.get(key))?.revision === value.revision) storage.remove(key); } catch { /* Retry later. */ }
      }
      retryAt = 0; failures = 0; return true;
    } catch {
      retryAt = now() + Math.min(60000, 2000 * 2 ** Math.min(5, failures++)); return false;
    } finally { sending = false; }
  }
  return {
    start({ size, rows = size, columns = size, mode, difficulty, firstPlayer }) {
      if (!endpoint) return;
      startedAt = foregroundAt = clock(); foreground = 0;
      run = { schema_version: 2, game: 'sos', game_version: VERSION, rules_version: 'rectangular-v2',
        run_id: id(), revision: 0, environment, build_id: buildId,
        device: typeof device === 'function' ? device() : device,
        rows, columns, mode, difficulty: mode === 'computer' ? `diff ${difficultyLevel(difficulty)}` : null, first_player: firstPlayer,
        started_at: stamp(), updated_at: stamp(), ended_at: null, outcome: 'in_progress',
        elapsed_ms: 0, foreground_ms: 0, moves: [],
        ai: { decisions: 0, search_ms: 0, nodes: 0, budget_hits: 0, random_moves: 0 } };
      checkpoint();
    },
    move(index, letter, stats = null) {
      if (!run) return;
      run.moves.push([index, letter === 'S' ? 0 : 1, Math.max(run.elapsed_ms, Math.round(clock() - startedAt), 0)]);
      if (stats) {
        run.ai.decisions++; run.ai.search_ms += Math.max(0, Math.round(stats.search_ms || 0));
        run.ai.nodes += Math.max(0, Math.round(stats.nodes || 0));
        run.ai.budget_hits += stats.budget_hit ? 1 : 0; run.ai.random_moves += stats.random ? 1 : 0;
      }
      checkpoint();
    },
    checkpoint,
    finish(outcome) {
      if (!run) return;
      run.outcome = outcome; checkpoint(); run = null;
    },
    visibility(isVisible) {
      if (isVisible === visible) return;
      if (run && visible) foreground += Math.max(0, clock() - foregroundAt);
      visible = isVisible; foregroundAt = clock();
    },
    flush, get enabled() { return Boolean(endpoint); }, get active() { return Boolean(run); },
  };
}
