/* Browser Games analytics receiver. No read endpoint and no browser credentials. */
const INGEST_LIMITS = Object.freeze({ bytes: 256 * 1024, runs: 50, events: 2000 });

function doGet() {
  return jsonResponse_({ ok: true, service: 'browser-games-analytics', schema_version: 2, accepted_schemas: [1, 2], storage: 'json.gz' });
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
    const batch = validateBatch_(payload);
    const encoded = JSON.stringify(batch);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
      encoded, Utilities.Charset.UTF_8).map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
    const legacyName = batch.game + '_batch_' + batch.batch_id + '.json';
    const name = legacyName + '.gz';
    lock = LockService.getScriptLock();
    require_(lock.tryLock(5000), 'busy');
    const folder = DriveApp.getFolderById(folderId);
    // Check both generations so retries from old tabs never create another archive.
    for (const candidate of [name, legacyName]) {
      const matches = folder.getFilesByName(candidate);
      if (matches.hasNext()) {
        const blob = matches.next().getBlob();
        const stored = JSON.parse((candidate === name ? Utilities.ungzip(blob) : blob).getDataAsString('UTF-8'));
        require_(stored.payload_sha256 === digest, 'batch_id_conflict');
        return jsonResponse_({ ok: true, batch_id: batch.batch_id, duplicate: true });
      }
    }
    const archive = Object.assign({ received_at: new Date().toISOString(), payload_sha256: digest }, batch);
    folder.createFile(Utilities.gzip(Utilities.newBlob(JSON.stringify(archive), 'application/json'), name));
    return jsonResponse_({ ok: true, batch_id: batch.batch_id, duplicate: false });
  } catch (error) {
    // Never expose folder IDs, private file contents, or internal Google errors.
    const code = error && error.ingestCode || 'storage_error';
    if (code === 'storage_error') console.error('Analytics storage operation failed');
    return jsonResponse_({ ok: false, error: code });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
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

function validateBatch_(input) {
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
