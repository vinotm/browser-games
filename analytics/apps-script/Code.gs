/* Browser Games analytics receiver. No read endpoint and no browser credentials. */
const INGEST_LIMITS = Object.freeze({ bytes: 256 * 1024, runs: 50, events: 2000 });

const HARDENING = Object.freeze({ version: '2026-10-15.1',
  bytes: 1000000000, files: 1000000, burst: 60, perSecond: 1,
  dailyFiles: 5000, dailyBytes: 50000000, lockMs: 1000 });
const BUDGET_KEY = 'ANALYTICS_BUDGET_V1';

function doGet() {
  return jsonResponse_({ ok: true, service: 'browser-games-analytics', schema_version: 2,
    accepted_schemas: [1, 2], storage: 'json.gz', hardening_version: HARDENING.version });
}

function doPost(e) {
  let lock;
  try {
    const properties = PropertiesService.getScriptProperties();
    require_(properties.getProperty('INGEST_ENABLED') !== 'false', 'disabled');
    const folderId = receiverFolderId_();
    require_(folderId, 'not_configured');
    const raw = e && e.postData && e.postData.contents;
    require_(typeof raw === 'string' && raw.length > 0, 'empty_body');
    require_(raw.length <= INGEST_LIMITS.bytes &&
      Utilities.newBlob(raw).getBytes().length <= INGEST_LIMITS.bytes, 'batch_too_large');
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { reject_('invalid_json'); }
    // Preserve the original canonical form for retrying archives written before hardening.
    const legacy = validateLegacyBatch_(payload);
    const batch = hardenBatch_(legacy);
    const digest = digest_(batch);
    const legacyDigest = digest_(legacy);
    lock = LockService.getScriptLock();
    require_(lock.tryLock(HARDENING.lockMs), 'busy');
    // Recheck the emergency switch inside the lock.
    require_(properties.getProperty('INGEST_ENABLED') !== 'false', 'disabled');
    const state = budgetState_(properties, folderId);
    const now = Date.now();
    const tokens = Math.min(HARDENING.burst, state.tokens + Math.max(0, now - state.token_at) / 1000 * HARDENING.perSecond);
    require_(tokens >= 1, 'rate_limited');
    state.tokens = tokens - 1;
    state.token_at = Math.max(state.token_at, now);
    // A valid attempt, including a duplicate, consumes a token before Drive work.
    properties.setProperty(BUDGET_KEY, JSON.stringify(state));
    const legacyName = batch.game + '_batch_' + batch.batch_id + '.json';
    const name = legacyName + '.gz';
    const folder = DriveApp.getFolderById(folderId);
    for (const candidate of [name, legacyName]) {
      const matches = folder.getFilesByName(candidate);
      if (matches.hasNext()) {
        const blob = matches.next().getBlob();
        require_(blob.getBytes().length <= INGEST_LIMITS.bytes + 4096, 'invalid_existing_archive');
        const stored = JSON.parse((candidate === name ? Utilities.ungzip(blob) : blob).getDataAsString('UTF-8'));
        require_(stored.payload_sha256 === digest || stored.payload_sha256 === legacyDigest, 'batch_id_conflict');
        return jsonResponse_({ ok: true, batch_id: batch.batch_id, duplicate: true });
      }
    }
    const archive = Object.assign({ received_at: new Date(now).toISOString(),
      payload_sha256: digest, ingestion_version: HARDENING.version }, batch);
    const blob = Utilities.gzip(Utilities.newBlob(JSON.stringify(archive), 'application/json'), name);
    const size = blob.getBytes().length;
    require_(size <= INGEST_LIMITS.bytes + 4096, 'batch_too_large');
    // Rotate only forwards: a backwards clock cannot reset a spent daily allowance.
    const day = Utilities.formatDate(new Date(now), 'Asia/Jakarta', 'yyyy-MM-dd');
    if (day > state.day) { state.day = day; state.day_files = 0; state.day_bytes = 0; }
    require_(state.files + 1 <= HARDENING.files && state.bytes + size <= HARDENING.bytes, 'storage_limit');
    require_(state.day_files + 1 <= HARDENING.dailyFiles &&
      state.day_bytes + size <= HARDENING.dailyBytes, 'daily_limit');
    state.files++; state.bytes += size; state.day_files++; state.day_bytes += size;
    // Reserve BEFORE createFile. Never release on errors/timeouts: a write may have succeeded.
    // A stale/missing/corrupt ledger fails closed. Deletion never replenishes capacity.
    properties.setProperty(BUDGET_KEY, JSON.stringify(state));
    folder.createFile(blob);
    return jsonResponse_({ ok: true, batch_id: batch.batch_id, duplicate: false });
  } catch (error) {
    const code = error && error.ingestCode || 'storage_error';
    if (code === 'storage_error') console.error('Analytics storage operation failed');
    return jsonResponse_({ ok: false, error: code });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function digest_(batch) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(batch),
    Utilities.Charset.UTF_8).map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function budgetState_(properties, folderId) {
  let state;
  try { state = JSON.parse(properties.getProperty(BUDGET_KEY)); } catch (_) { reject_('budget_unavailable'); }
  require_(object_(state) && state.version === 1 && state.folder_id === folderId, 'budget_unavailable');
  for (const field of ['files', 'bytes', 'day_files', 'day_bytes', 'token_at']) {
    require_(Number.isSafeInteger(state[field]) && state[field] >= 0, 'budget_unavailable');
  }
  require_(Number.isFinite(state.tokens) && state.tokens >= 0 && state.tokens <= HARDENING.burst &&
    typeof state.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.day), 'budget_unavailable');
  return state;
}

// Editor-only administration. No public endpoint exposes counters or private folder metadata.
function inspectAnalyticsBudget() {
  console.log(JSON.stringify(budgetState_(PropertiesService.getScriptProperties(), receiverFolderId_())));
}

function receiverFolderId_() {
  return PropertiesService.getScriptProperties().getProperty('DESTINATION_FOLDER_ID') ||
    (typeof DEPLOYED_FOLDER_ID === 'string' ? DEPLOYED_FOLDER_ID : '');
}

// Run once in the Apps Script editor to authorize Drive and verify the folder.
function verifySetup() {
  const id = receiverFolderId_();
  require_(id, 'not_configured');
  const folder = DriveApp.getFolderById(id);
  console.log('Destination accessible: ' + folder.getName());
}

function validateLegacyBatch_(input) {
  require_(object_(input) && [1, 2].includes(input.schema_version), 'invalid_schema');
  // Extend this list when another game's event collection is implemented.
  require_(input.game === 'snake', 'invalid_game');
  require_(id_(input.batch_id), 'invalid_batch_id');
  require_(text_(input.game_version, 80), 'invalid_game_version');
  require_(timestamp_(input.sent_at), 'invalid_sent_at');
  require_(Array.isArray(input.runs) && input.runs.length > 0 &&
    input.runs.length <= INGEST_LIMITS.runs, 'invalid_runs');
  let eventCount = 0;
  const runIds = new Set();
  const runs = input.runs.map((run) => {
    require_(object_(run) && id_(run.run_id) && !runIds.has(run.run_id), 'invalid_run_id');
    runIds.add(run.run_id);
    require_(timestamp_(run.started_at), 'invalid_started_at');
    require_(['partial', 'completed', 'abandoned'].includes(run.status), 'invalid_run_status');
    require_(run.ended_at == null || timestamp_(run.ended_at), 'invalid_ended_at');
    require_(run.status !== 'completed' || timestamp_(run.ended_at), 'missing_ended_at');
    require_(run.ended_at == null || Date.parse(run.ended_at) >= Date.parse(run.started_at), 'invalid_run_times');
    require_(run.summary == null || object_(run.summary), 'invalid_summary');
    require_(Array.isArray(run.events), 'invalid_events');
    eventCount += run.events.length;
    require_(eventCount <= INGEST_LIMITS.events, 'too_many_events');
    let lastSequence = -1;
    let lastActive = -1;
    let lastElapsed = -1;
    const events = run.events.map((event) => {
      require_(object_(event) && Number.isSafeInteger(event.seq) && event.seq > lastSequence, 'invalid_event_sequence');
      require_(typeof event.type === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(event.type), 'invalid_event_type');
      if (input.schema_version === 1) require_(timestamp_(event.occurred_at), 'invalid_event_time');
      else {
        require_(Number.isSafeInteger(event.elapsed_ms) && event.elapsed_ms >= 0 &&
          event.elapsed_ms >= lastElapsed &&
          Number.isFinite(Date.parse(run.started_at) + event.elapsed_ms) &&
          Math.abs(Date.parse(run.started_at) + event.elapsed_ms) <= 8640000000000000, 'invalid_event_time');
        lastElapsed = event.elapsed_ms;
      }
      require_(Number.isFinite(event.active_ms) && event.active_ms >= 0 && event.active_ms >= lastActive, 'invalid_active_ms');
      require_(event.object_id == null || id_(event.object_id), 'invalid_object_id');
      require_(event.details == null || object_(event.details), 'invalid_details');
      lastSequence = event.seq;
      lastActive = event.active_ms;
      if (input.schema_version === 1) return { seq: event.seq, type: event.type, occurred_at: event.occurred_at,
        active_ms: event.active_ms, object_id: event.object_id || null, details: event.details || {} };
      const record = { seq: event.seq, type: event.type, elapsed_ms: event.elapsed_ms, active_ms: event.active_ms };
      if (event.object_id != null) record.object_id = event.object_id;
      if (event.details && Object.keys(event.details).length) record.details = event.details;
      return record;
    });
    const record = { run_id: run.run_id, status: run.status, started_at: run.started_at,
      ended_at: run.ended_at || null, summary: run.summary || {}, events: events };
    if (run.device != null) {
      require_(object_(run.device) && ['desktop', 'mobile', 'tablet', 'unknown'].includes(run.device.category) &&
        ['mouse', 'touch', 'mixed', 'unknown'].includes(run.device.input) &&
        ['small', 'medium', 'large', 'unknown'].includes(run.device.viewport), 'invalid_device');
      record.device = { category: run.device.category, input: run.device.input, viewport: run.device.viewport };
    }
    return record;
  });
  return { schema_version: input.schema_version, game: input.game, game_version: input.game_version,
    batch_id: input.batch_id, sent_at: input.sent_at, runs: runs };
}

function object_(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text_(value, max) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
function id_(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value); }
function timestamp_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
function require_(condition, code) { if (!condition) reject_(code); }
function reject_(code) { const error = new Error(code); error.ingestCode = code; throw error; }
function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

const EVENT_TYPES = Object.freeze(['run_started', 'run_ended', 'run_abandoned', 'paused', 'resumed',
  'item_spawned', 'item_eaten', 'item_expired', 'item_removed', 'effect_started', 'effect_refreshed',
  'effect_ended', 'wall_scheduled', 'wall_warning', 'wall_solid', 'wall_cancelled',
  'combo_increased', 'combo_ended']);
const REPORT_FIELDS = Object.freeze(['score', 'active_ms', 'max_combo', 'base_step_ms', 'environment',
  'build_id', 'death_cause', 'snake_length', 'reason', 'collision_cell', 'wall_id', 'wall_source',
  'kind', 'x', 'y', 'lifetime_ms', 'warning_at_ms', 'corners_allowed', 'cells', 'source', 'food_id',
  'warning_ms', 'duration_ms', 'points', 'critical', 'combo', 'count']);
const STRING_FIELDS = Object.freeze(['kind', 'reason', 'source', 'wall_source', 'death_cause', 'environment', 'build_id', 'wall_id', 'food_id']);
const VALUE_SETS = Object.freeze({
  kind: ['normal', 'normal_food', 'moving_food', 'large_food', 'shortener', 'extender', 'critRate', 'critMultiplier', 'speedUp', 'slowDown', 'reverse', 'magnet'],
  source: ['snake', 'magnet', 'expired_food', 'milestone'],
  wall_source: ['milestone', 'expired_food'],
  reason: ['restart', 'page_reloaded', 'expired', 'opposite_pickup', 'no_safe_space', 'food_space', 'timeout', 'miss', 'death'],
  death_cause: ['edge', 'wall', 'body', 'board_filled'],
});
const MAX_DURATION = 365 * 24 * 60 * 60 * 1000;

function validateBatch_(input) { return hardenBatch_(validateLegacyBatch_(input)); }

function hardenBatch_(batch) {
  require_(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(batch.game_version), 'invalid_game_version');
  const future = Date.now() + 24 * 60 * 60 * 1000;
  require_(Date.parse(batch.sent_at) <= future, 'invalid_sent_at');
  return Object.assign({}, batch, { runs: batch.runs.map((run) => {
    require_(Date.parse(run.started_at) <= future && (run.ended_at == null || Date.parse(run.ended_at) <= future), 'invalid_run_times');
    // Partial chunks may start at any sequence number and offline data has no age cutoff.
    require_(run.events.length > 0, 'invalid_events');
    return Object.assign({}, run, { summary: cleanReport_(run.summary), events: run.events.map((event) => {
      require_(EVENT_TYPES.includes(event.type), 'invalid_event_type');
      require_(event.seq <= 10000000 && event.active_ms <= MAX_DURATION, 'invalid_event_sequence');
      if (batch.schema_version === 2) {
        require_(event.elapsed_ms <= MAX_DURATION && event.active_ms <= event.elapsed_ms + 1000, 'invalid_event_time');
      } else require_(Date.parse(event.occurred_at) <= future &&
        Date.parse(event.occurred_at) >= Date.parse(run.started_at), 'invalid_event_time');
      const result = Object.assign({}, event);
      if (event.details) result.details = cleanReport_(event.details);
      if (batch.schema_version === 2 && result.details && !Object.keys(result.details).length) delete result.details;
      return result;
    }) });
  }) });
}

function cleanReport_(value) {
  require_(object_(value), 'invalid_report');
  const result = {};
  for (const key of Object.keys(value)) {
    require_(!['__proto__', 'constructor', 'prototype'].includes(key), 'invalid_report');
    // Unknown fields are intentionally discarded; never store arbitrary caller-provided metadata.
    if (!REPORT_FIELDS.includes(key)) continue;
    const item = value[key];
    if (STRING_FIELDS.includes(key)) {
      require_(typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(item), 'invalid_report');
      if (Object.prototype.hasOwnProperty.call(VALUE_SETS, key)) require_(VALUE_SETS[key].includes(item), 'invalid_report');
      if (key === 'environment') require_(['production', 'preview', 'development', 'unknown'].includes(item), 'invalid_report');
      if (key === 'build_id') require_(item === 'unknown' || /^sha256-[a-f0-9]{16}$/.test(item), 'invalid_report');
    } else if (key === 'critical' || key === 'corners_allowed') {
      require_(typeof item === 'boolean', 'invalid_report');
    } else if (key === 'collision_cell') {
      result[key] = cleanCell_(item, true); continue;
    } else if (key === 'cells') {
      require_(Array.isArray(item) && item.length <= 1024, 'invalid_report');
      result[key] = item.map((cell) => cleanCell_(cell, false)); continue;
    } else {
      require_(Number.isFinite(item) && item >= 0 && item <= (key.endsWith('_ms') ? MAX_DURATION : 1000000000), 'invalid_report');
      if (key === 'x' || key === 'y') require_(item <= 32, 'invalid_report');
      if (key === 'snake_length') require_(Number.isSafeInteger(item) && item <= 1024, 'invalid_report');
      if (key === 'base_step_ms') require_(item > 0 && item <= 60000, 'invalid_report');
    }
    result[key] = item;
  }
  return result;
}

function cleanCell_(cell, collision) {
  require_(object_(cell) && Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y) &&
    cell.x >= (collision ? -1 : 0) && cell.y >= (collision ? -1 : 0) && cell.x <= (collision ? 32 : 31) && cell.y <= (collision ? 32 : 31), 'invalid_report');
  return { x: cell.x, y: cell.y };
}
