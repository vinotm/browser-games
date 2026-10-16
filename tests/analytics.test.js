import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const source = readFileSync(new URL('../analytics/apps-script/Code.gs', import.meta.url), 'utf8');
const example = JSON.parse(readFileSync(new URL('../analytics/apps-script/example-batch.json', import.meta.url)));

function receiver({ configured = true, busy = false, broken = false, writeFailure = false, initialized = true } = {}) {
  const files = new Map();
  let locked = false, releases = 0, reads = 0;
  const properties = new Map(configured ? [['DESTINATION_FOLDER_ID', 'private-folder']] : []);
  if (initialized) properties.set('ANALYTICS_BUDGET_V1', JSON.stringify({ version: 1, folder_id: 'private-folder', files: 0, bytes: 0, day_files: 0, day_bytes: 0, day: '2020-01-01', tokens: 60, token_at: Date.now() }));
  const blob = (body, type, name) => ({ body, type, name,
    getBytes: () => [...Buffer.from(body)], getDataAsString: () => Buffer.from(body).toString('utf8') });
  const folder = {
    getFilesByName(name) {
      const found = files.get(name);
      let consumed = false;
      return { hasNext: () => !!found && !consumed,
        next() { consumed = true; return { getBlob: () => blob(found) }; } };
    },
    getFiles() { return { hasNext: () => files.size > 0 }; },
    getFolders() { return { hasNext: () => false }; },
    createFile(value) { if (writeFailure) throw new Error("uncertain write"); files.set(value.name, value.body); },
  };
  const context = createContext({
    console: { error() {}, log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, value) }) },
    ContentService: { MimeType: { JSON: 'application/json' },
      createTextOutput: (body) => ({ body, setMimeType() { return this; } }) },
    Utilities: { formatDate: (date, zone) => { assert.equal(zone, 'Asia/Jakarta'); return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }, newBlob: blob, gzip: (value, name) => blob(gzipSync(value.body), 'application/gzip', name),
      ungzip: (value) => blob(gunzipSync(value.body)), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, body) => [...createHash('sha256').update(body).digest()] },
    LockService: { getScriptLock: () => ({ tryLock() { locked = !busy; return locked; },
      hasLock: () => locked, releaseLock() { locked = false; releases++; } }) },
    DriveApp: { getFolderById(id) {
      reads++;
      assert.equal(id, 'private-folder');
      assert.equal(locked, true);
      if (broken) throw new Error('private-folder: sensitive internal error');
      return folder;
    } },
  });
  runInContext(source, context);
  runInContext(readFileSync(new URL('../analytics/apps-script/Setup.gs', import.meta.url), 'utf8'), context);
  const post = (data = example) => JSON.parse(context.doPost({ postData: {
    contents: typeof data === 'string' ? data : JSON.stringify(data) } }).body);
  return { context, files, properties, post, stats: () => ({ releases, reads, locked }) };
}

test('GAS archives multiple runs in one private gzip JSON file and adds a UTC receipt', () => {
  const r = receiver();
  const batch = structuredClone(example);
  batch.runs.push({ ...structuredClone(batch.runs[0]), run_id: 'second-run' });
  assert.deepEqual(r.post(batch), { ok: true, batch_id: batch.batch_id, duplicate: false });
  assert.equal(r.files.size, 1);
  const archive = JSON.parse(gunzipSync([...r.files.values()][0]));
  assert.equal(archive.runs.length, 2);
  assert.equal(archive.runs[0].events[1].object_id, 'food-1');
  assert.match(archive.received_at, /Z$/);
  assert.match(archive.payload_sha256, /^[0-9a-f]{64}$/);
  assert.equal(r.stats().locked, false);
});

test('existing receiver preserves deployment labels and collision attribution in summaries and events', () => {
  const r = receiver();
  const batch = structuredClone(example);
  Object.assign(batch.runs[0].summary, { environment: 'development', build_id: 'sha256-1234567890abcdef',
    death_cause: 'wall', wall_id: 'wall-7', wall_source: 'expired_food', collision_cell: { x: 4, y: 5 } });
  Object.assign(batch.runs[0].events.at(-1).details, batch.runs[0].summary);
  assert.equal(r.post(batch).ok, true);
  const archive = JSON.parse(gunzipSync([...r.files.values()][0]));
  assert.deepEqual(archive.runs[0].summary, batch.runs[0].summary);
  assert.deepEqual(archive.runs[0].events.at(-1).details, batch.runs[0].events.at(-1).details);
});

test('GAS deduplicates retries durably and rejects conflicting batch IDs', () => {
  const r = receiver();
  r.post();
  const first = [...r.files.values()][0];
  assert.equal(r.post().duplicate, true);
  const changed = structuredClone(example);
  changed.runs[0].summary.score++;
  assert.deepEqual(r.post(changed), { ok: false, error: 'batch_id_conflict' });
  assert.equal(r.files.size, 1);
  assert.equal([...r.files.values()][0], first);
  assert.equal(r.stats().releases, 3);
});

test('GAS preserves coarse per-run device data and drops unnecessary identifying fields', () => {
  const r = receiver();
  const batch = structuredClone(example);
  batch.runs[0].device = { category: 'desktop', input: 'mouse', viewport: 'large', raw_user_agent: 'discard' };
  batch.runs.push({ ...structuredClone(batch.runs[0]), run_id: 'mobile-run',
    device: { category: 'mobile', input: 'touch', viewport: 'small' } });
  assert.equal(r.post(batch).ok, true);
  const archive = JSON.parse(gunzipSync([...r.files.values()][0]));
  assert.deepEqual(archive.runs.map((run) => run.device), [
    { category: 'desktop', input: 'mouse', viewport: 'large' },
    { category: 'mobile', input: 'touch', viewport: 'small' },
  ]);
  batch.batch_id = 'bad-device';
  batch.runs[0].device.category = 'fingerprint';
  assert.deepEqual(r.post(batch), { ok: false, error: 'invalid_device' });
});

test('GAS rejects malformed input before accessing Drive', () => {
  const r = receiver();
  assert.equal(r.post('{bad').error, 'invalid_json');
  for (const [mutate, error] of [
    [(b) => b.batch_id = '../escape', 'invalid_batch_id'],
    [(b) => b.sent_at = '2025-01-01T08:00:00', 'invalid_sent_at'],
    [(b) => b.runs[0].events[1].seq = 0, 'invalid_event_sequence'],
    [(b) => b.runs[0].events[1].active_ms = -1, 'invalid_active_ms'],
    [(b) => b.runs[0].ended_at = null, 'missing_ended_at'],
    [(b) => b.runs.push(structuredClone(b.runs[0])), 'invalid_run_id'],
    [(b) => b.runs[0].events = Array(2001).fill(b.runs[0].events[0]), 'too_many_events'],
  ]) {
    const batch = structuredClone(example);
    mutate(batch);
    assert.equal(r.post(batch).error, error);
  }
  assert.equal(r.post('x'.repeat(262145)).error, 'batch_too_large');
  const unicode = structuredClone(example);
  unicode.runs[0].summary.extra = '😀'.repeat(70000);
  assert.equal(r.post(unicode).error, 'batch_too_large');
  assert.equal(r.stats().reads, 0);
});

test('partial runs preserve identifiers across separate chunk files', () => {
  const r = receiver();
  const batch = structuredClone(example);
  batch.runs[0].status = 'partial';
  batch.runs[0].ended_at = null;
  assert.equal(r.post(batch).ok, true);
  batch.batch_id = 'next-chunk';
  batch.runs[0].events = [{ seq: 4, type: 'paused', occurred_at: batch.sent_at, active_ms: 55000 }];
  assert.equal(r.post(batch).ok, true);
  assert.equal(r.files.size, 2);
});

test('health endpoint never reads archives; unavailable storage returns no private details', () => {
  const r = receiver({ broken: true });
  const health = JSON.parse(r.context.doGet().body);
  assert.equal(health.ok, true);
  assert.equal(r.stats().reads, 0);
  assert.deepEqual(r.post(), { ok: false, error: 'storage_error' });
  assert.equal(r.stats().locked, false);
  assert.deepEqual(receiver({ busy: true }).post(), { ok: false, error: 'busy' });
  assert.deepEqual(receiver({ configured: false }).post(), { ok: false, error: 'not_configured' });
  r.properties.set('INGEST_ENABLED', 'false');
  assert.deepEqual(r.post(), { ok: false, error: 'disabled' });
});


test('schema 2 keeps pause-aware event times, omits empty fields and rejects invalid offsets', () => {
  const r = receiver();
  const batch = structuredClone(example);
  batch.schema_version = 2;
  for (const e of batch.runs[0].events) {
    e.elapsed_ms = Date.parse(e.occurred_at) - Date.parse(batch.runs[0].started_at);
    delete e.occurred_at;
  }
  batch.runs[0].events.at(-1).elapsed_ms = 60000; // 55 seconds active + five paused.
  assert.equal(r.post(batch).ok, true);
  const archive = JSON.parse(gunzipSync([...r.files.values()][0]));
  assert.equal(archive.schema_version, 2);
  assert.equal(archive.runs[0].events.at(-1).elapsed_ms, 60000);
  assert.equal(archive.runs[0].events.at(-1).active_ms, 55000);
  assert.equal('details' in archive.runs[0].events[0], false);
  assert.equal('object_id' in archive.runs[0].events[0], false);
  assert.ok([...r.files.keys()][0].endsWith('.json.gz'));
  assert.equal(r.post(batch).duplicate, true);
  for (const value of [-1, 1.5, '100', null, 9007199254740991]) {
    batch.runs[0].events[1].elapsed_ms = value;
    assert.equal(r.post(batch).error, 'invalid_event_time');
  }
  batch.runs[0].events[1].elapsed_ms = 4000;
  assert.equal(r.post(batch).error, 'invalid_event_time'); // Next event goes backwards.
});

test('schema 1 retries recognize legacy uncompressed archives', () => {
  const r = receiver();
  r.post();
  const [[name, body]] = r.files;
  r.files.clear();
  r.files.set(name.slice(0, -3), gunzipSync(body));
  assert.equal(r.post().duplicate, true);
  assert.equal(r.files.size, 1);
  const changed = structuredClone(example);
  changed.runs[0].summary.score++;
  assert.equal(r.post(changed).error, 'batch_id_conflict');
});

test('hardening fails closed and enforces global, daily and cumulative budgets', () => {
  const key = 'ANALYTICS_BUDGET_V1';
  const missing = receiver({ initialized: false });
  assert.equal(missing.post().error, 'budget_unavailable');
  assert.equal(missing.stats().reads, 0);
  for (const [patch, error] of [
    [{ tokens: 0, token_at: Date.now() + 10000 }, 'rate_limited'],
    [{ files: 1000000 }, 'storage_limit'],
    [{ bytes: 1000000000 }, 'storage_limit'],
    [{ day: '9999-12-31', day_files: 5000 }, 'daily_limit'],
    [{ day: '9999-12-31', day_bytes: 50000000 }, 'daily_limit'],
  ]) {
    const r = receiver();
    r.properties.set(key, JSON.stringify({ ...JSON.parse(r.properties.get(key)), ...patch }));
    assert.equal(r.post().error, error);
    assert.equal(r.files.size, 0);
  }
  const r = receiver({ writeFailure: true });
  assert.equal(r.post().error, 'storage_error');
  const state = JSON.parse(r.properties.get(key));
  assert.equal(state.files, 1);
  assert.ok(state.bytes > 0); // Keep reservations after uncertain writes.
});

test('duplicates consume rate tokens without spending more storage allowance', () => {
  const r = receiver();
  r.post();
  const before = JSON.parse(r.properties.get('ANALYTICS_BUDGET_V1'));
  assert.equal(r.post().duplicate, true);
  const after = JSON.parse(r.properties.get('ANALYTICS_BUDGET_V1'));
  assert.equal(after.files, before.files);
  assert.equal(after.bytes, before.bytes);
  assert.ok(after.tokens < before.tokens);
});

test('metadata is sanitized and legacy canonical digests still acknowledge retries', () => {
  const r = receiver();
  const batch = structuredClone(example);
  batch.runs[0].summary.email = 'discard@example.test';
  const legacy = r.context.validateLegacyBatch_(batch);
  const digest = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  r.files.set(`snake_batch_${batch.batch_id}.json`, JSON.stringify({ payload_sha256: digest }));
  assert.equal(r.post(batch).duplicate, true);
  r.files.clear();
  assert.equal(r.post(batch).ok, true);
  const stored = JSON.parse(gunzipSync([...r.files.values()][0]));
  assert.equal('email' in stored.runs[0].summary, false);
  batch.batch_id = 'invalid-event';
  batch.runs[0].events[0].type = 'arbitrary_event';
  assert.equal(r.post(batch).error, 'invalid_event_type');
  batch.runs[0].events[0].type = 'run_started';
  batch.runs[0].summary.environment = 'personal-host';
  assert.equal(r.post(batch).error, 'invalid_report');
});

test('new budget setup requires disabled ingestion, an empty folder and no existing ledger', () => {
  const r = receiver({ initialized: false });
  assert.throws(() => r.context.initializeNewAnalyticsBudget(), /disable_ingestion_first/);
  r.properties.set('INGEST_ENABLED', 'false');
  r.files.set('existing', 'data');
  assert.throws(() => r.context.initializeNewAnalyticsBudget(), /destination_not_empty/);
  r.files.clear();
  r.context.initializeNewAnalyticsBudget();
  const state = JSON.parse(r.properties.get('ANALYTICS_BUDGET_V1'));
  assert.equal(state.files, 0);
  assert.equal(state.bytes, 0);
  assert.match(state.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.throws(() => r.context.initializeNewAnalyticsBudget(), /budget_already_exists/);
  r.properties.set('INGEST_ENABLED', 'true');
  assert.equal(r.post().ok, true);
});
