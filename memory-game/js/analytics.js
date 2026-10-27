import { VERSION } from './engine.js';
const PREFIX = 'memory-report-v1-';
const MAX_BYTES = 200000, MAX_BATCH_BYTES = 60000;
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function browserReportStorage() {
  return { list: () => Object.keys(localStorage).filter(key => key.startsWith(PREFIX)),
    get: key => localStorage.getItem(key), set: (key, value) => localStorage.setItem(key, value),
    remove: key => localStorage.removeItem(key) };
}
// Cumulative summaries only: never collect card identities or a flip history.
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
          if (key.startsWith(PREFIX) && value?.schema_version === 1 && value.game === 'memory' &&
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
  function checkpoint(progress = {}) {
    if (!run) return;
    for (const field of ['moves', 'pairs_found', 'flips', 'mismatches', 'unique_positions', 'early_closes']) {
      if (Number.isSafeInteger(progress[field]) && progress[field] >= run[field]) run[field] = progress[field];
    }
    run.elapsed_ms = Math.max(run.elapsed_ms, Math.round(progress.elapsed_ms ?? clock() - startedAt), 0);
    run.foreground_ms = Math.min(run.elapsed_ms, Math.round(foreground + (visible ? Math.max(0, clock() - foregroundAt) : 0)));
    run.updated_at = stamp();
    if (run.outcome !== 'in_progress') run.ended_at = run.updated_at;
    run.revision++; persist();
  }
  async function flush({ keepalive = false, force = false } = {}) {
    if (!endpoint || !fetcher || sending || !force && now() < retryAt) return false;
    sending = true;
    try {
      const records = [], batch = { schema_version: 1, game: 'memory', batch_id: id(), sent_at: stamp(), runs: [] };
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
    start(settings) {
      if (!endpoint) return;
      startedAt = foregroundAt = clock(); foreground = 0;
      run = { schema_version: 1, game: 'memory', game_version: VERSION, rules_version: 'shapes-colors-sizes-v1',
        run_id: id(), revision: 0, environment, build_id: buildId,
        device: typeof device === 'function' ? device() : device,
        rows: settings.rows, columns: settings.columns, pairs_total: settings.totalPairs,
        shape_count: settings.shapeCount, color_count: settings.colorCount,
        size_count: settings.sizeCount, variant_count: settings.variantCount,
        blocked_cells: settings.blockedCells,
        started_at: stamp(), updated_at: stamp(), ended_at: null, outcome: 'in_progress',
        elapsed_ms: 0, foreground_ms: 0, moves: 0, pairs_found: 0, flips: 0,
        mismatches: 0, unique_positions: 0, early_closes: 0 };
      checkpoint();
    },
    checkpoint,
    finish(outcome, progress) {
      if (!run) return;
      run.outcome = outcome; checkpoint(progress); run = null;
    },
    visibility(isVisible) {
      if (isVisible === visible) return;
      if (run && visible) foreground += Math.max(0, clock() - foregroundAt);
      visible = isVisible; foregroundAt = clock();
    },
    flush, get enabled() { return Boolean(endpoint); }, get active() { return Boolean(run); },
  };
}
