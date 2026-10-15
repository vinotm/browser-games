// Snapshot values so later gameplay mutations cannot rewrite historical events.
function snapshot(value, key = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return key.endsWith('_ms') ? Math.round(value) : Math.round(value * 100) / 100;
  }
  if (Array.isArray(value)) return value.map((item) => snapshot(item));
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, snapshot(item, name)]));
  return value;
}

// Bounded local queue. Telemetry failures must never interrupt a game.
export function createAnalytics({ endpoint, game, version, device, storage, fetcher = globalThis.fetch?.bind(globalThis),
  now = Date.now, id = () => crypto.randomUUID() }) {
  // A public clone is playable without enabling data collection.
  if (!endpoint) return {
    start() {}, record() {}, finish() {}, checkpoint() {}, async flush() { return false; },
    get active() { return false; }, get pending() { return 0; },
  };
  const stamp = () => new Date(now()).toISOString();
  const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  let data = { queue: [], current: null }, sending = false, failures = 0, retryAt = 0;
  try {
    const saved = JSON.parse(storage.get('queue', 'null'));
    if (saved && Array.isArray(saved.queue) && saved.queue.every((batch) =>
      typeof batch?.batch_id === 'string' && Array.isArray(batch.runs)) && bytes(saved) < 600000) {
      data.queue = saved.queue;
      const run = saved.current;
      if (run && typeof run.run_id === 'string' && typeof run.started_at === 'string' &&
        Array.isArray(run.events) && Number.isSafeInteger(run.next_seq) &&
        Number.isFinite(run.last_active_ms) && run.summary && typeof run.summary === 'object') data.current = run;
    }
  } catch { /* Start fresh if local storage is unavailable or corrupt. */ }
  function persist() {
    try {
      while (data.queue.length > 50 || bytes(data) > 500000 && data.queue.length) data.queue.shift();
      storage.set('queue', JSON.stringify(data));
    } catch { /* Gameplay continues even if storage is denied. */ }
  }
  function checkpoint(status = 'partial', summary = {}) {
    const run = data.current;
    if (!run || (!run.events.length && status === 'partial')) return;
    const record = { run_id: run.run_id, device: run.device, started_at: run.started_at,
      ended_at: status === 'partial' ? null : stamp(), status,
      summary: { ...run.summary, ...summary }, events: run.events };
    data.queue.push({ schema_version: run.schema_version ?? 1, game, game_version: run.version,
      batch_id: id(), sent_at: stamp(), runs: [record] });
    run.events = [];
    if (status !== 'partial') data.current = null;
    persist();
  }
  function record(type, activeMs, details = {}, objectId = null) {
    const run = data.current;
    if (!run) return;
    // Combo state is already present on food events; avoid a second event stream.
    if (type === 'combo_increased' || type === 'combo_ended') return;
    const active = Math.max(run.last_active_ms, Math.round(activeMs));
    run.last_active_ms = active;
    const event = { seq: run.next_seq++, type, active_ms: active };
    if (run.schema_version === 2) {
      // Wall time includes pauses; active time does not. Keep both independently.
      event.elapsed_ms = Math.max(run.last_elapsed_ms ?? 0, now() - Date.parse(run.started_at), 0);
      run.last_elapsed_ms = event.elapsed_ms;
      if (objectId != null) event.object_id = objectId;
      if (Object.keys(details).length) event.details = snapshot(details);
    } else {
      // Finish a run restored from an older tab without mixing event schemas.
      Object.assign(event, { occurred_at: stamp(), object_id: objectId, details: snapshot(details) });
    }
    run.events.push(event);
    if (type === 'item_eaten' && Number.isFinite(details.combo)) {
      run.summary.max_combo = Math.max(run.summary.max_combo ?? 0, details.combo);
    }
    if (type === 'item_eaten' && Number.isFinite(details.score)) run.summary.score = details.score;
    run.summary.active_ms = active;
    if (run.events.length >= 150 || bytes(run.events) > 32000) checkpoint();
    else persist();
  }
  function finish(status, activeMs, summary = {}) {
    if (!data.current) return;
    record(status === 'abandoned' ? 'run_abandoned' : 'run_ended', activeMs, summary);
    checkpoint(status, summary);
  }
  // A saved current run belongs to a page that closed before reporting its end.
  if (data.current) finish('abandoned', data.current.last_active_ms, { reason: 'page_reloaded' });
  async function flush({ force = false, keepalive = false } = {}) {
    if (sending || !fetcher || !endpoint || (!force && now() < retryAt)) return false;
    sending = true;
    try {
      while (data.queue.length) {
        const batch = data.queue[0];
        const response = await fetcher(endpoint, { method: 'POST', credentials: 'omit',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(batch), keepalive,
          signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('upload_failed');
        const ack = await response.json();
        if (!ack.ok || ack.batch_id !== batch.batch_id) throw new Error('upload_not_acknowledged');
        // New local events may have trimmed the queue while this upload was pending.
        data.queue = data.queue.filter((entry) => entry.batch_id !== batch.batch_id);
        failures = 0; retryAt = 0; persist();
        if (keepalive) break;
      }
      return true;
    } catch {
      retryAt = now() + Math.min(60000, 2000 * 2 ** Math.min(5, failures++));
      return false;
    } finally { sending = false; }
  }
  return {
    start(activeMs = 0, summary = {}) {
      if (data.current) finish('abandoned', data.current.last_active_ms, { reason: 'restart' });
      data.current = { schema_version: 2, run_id: id(), version, device: typeof device === 'function' ? device() : device,
        started_at: stamp(), next_seq: 0, last_active_ms: 0, last_elapsed_ms: 0, summary: snapshot(summary), events: [] };
      record('run_started', activeMs, summary);
    },
    record, finish, checkpoint, flush,
    get active() { return Boolean(data.current); },
    get pending() { return data.queue.length; },
  };
}
