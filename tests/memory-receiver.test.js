import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRunAnalytics } from '../memory-game/js/analytics.js';
import { createMemoryGame } from '../memory-game/js/engine.js';
const source = readFileSync(new URL('../memory-game/analytics/apps-script/Code.gs', import.meta.url), 'utf8');
function example() {
  const memory = new Map();
  const a = createRunAnalytics({ endpoint: 'https://example.test/exec', id: () => 'test-run',
    storage: { list: () => [...memory.keys()], get: key => memory.get(key), set: (k,v) => memory.set(k,v) } });
  a.start(createMemoryGame().view());
  return { schema_version: 1, game: 'memory', batch_id: 'test-batch', sent_at: new Date().toISOString(), runs: [JSON.parse([...memory.values()][0])] };
}
function receiver({ initialized = true, writeFailure = false } = {}) {
  const files = new Map(), properties = new Map([['DESTINATION_FOLDER_ID', 'folder']]);
  let writes = 0, locked = false;
  if (initialized) properties.set('ANALYTICS_BUDGET_V1', JSON.stringify({ version: 1, folder_id: 'folder',
    files: 0, bytes: 0, day_files: 0, day_bytes: 0, day: '2020-01-01', tokens: 30, token_at: Date.now() }));
  const blob = (body, type, name) => ({ body, name, getBytes: () => [...Buffer.from(body)],
    getDataAsString: () => Buffer.from(body).toString('utf8') });
  const wrap = name => ({ getBlob: () => blob(files.get(name)), getSize: () => files.get(name).length, getId: () => name });
  const folder = { getName: () => 'game_data', getFiles: () => ({ hasNext: () => files.size > 0 }),
    getFilesByName(name) { let consumed = false; return { hasNext: () => files.has(name) && !consumed,
      next() { consumed = true; return wrap(name); } }; },
    createFile(value) { writes++; if (writeFailure) throw Error('uncertain'); files.set(value.name, value.body); } };
  const context = createContext({ console,
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: body => ({ body, setMimeType() { return this; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) ?? null, setProperty: (key, value) => properties.set(key, value) }) },
    LockService: { getScriptLock: () => ({ tryLock() { locked = true; return true; }, waitLock() { locked = true; },
      hasLock: () => locked, releaseLock() { locked = false; } }) },
    Utilities: { newBlob: blob, gzip: (value, name) => blob(gzipSync(value.body), 'application/gzip', name),
      ungzip: value => blob(gunzipSync(value.body)), Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (_, data) => [...createHash('sha256').update(data).digest()],
      formatDate: (date, zone) => { assert.equal(zone, 'Asia/Jakarta'); return '2026-10-19'; } },
    DriveApp: { getFolderById: () => folder },
    Drive: { Files: { get: () => ({ id: 'folder' }), update(_, id, value) {
      writes++; if (writeFailure) throw Error('uncertain'); assert.ok(files.has(id)); files.set(id, value.body);
    } } },
  });
  runInContext(source, context);
  return { files, properties, context, writes: () => writes,
    post: data => JSON.parse(context.doPost({ postData: { contents: typeof data === 'string' ? data : JSON.stringify(data) } }).body),
    stored: () => JSON.parse(gunzipSync([...files.values()][0])) };
}

test('Memory archives replace by revision, deduplicate and preserve terminal results', () => {
  const r = receiver(), b = example(); const initial = r.post(b); assert.equal(initial.ok, true, JSON.stringify({ initial, run: b.runs[0] })); assert.equal(r.writes(), 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.writes(), 1);
  const next = structuredClone(b), run = next.runs[0]; run.revision++; run.moves = 1; run.flips = 2; run.mismatches = 1; run.unique_positions = 2;
  assert.equal(r.post(next).ok, true); assert.equal(r.files.size, 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.stored().run.moves, 1);
  const conflict = structuredClone(next); conflict.runs[0].unique_positions = 1;
  assert.equal(r.post(conflict).error, 'revision_conflict');
  const decrease = structuredClone(next); decrease.runs[0].revision++; decrease.runs[0].unique_positions = 1;
  assert.equal(r.post(decrease).error, 'invalid_revision');
  const end = structuredClone(next); end.runs[0].revision++; end.runs[0].outcome = 'restarted'; end.runs[0].ended_at = end.runs[0].updated_at;
  assert.equal(r.post(end).ok, true); end.runs[0].revision++;
  assert.equal(r.post(end).error, 'run_already_finished');
});

test('Memory strips unknown fields and rejects invalid settings, counters and completion', () => {
  const r = receiver(), b = example(); b.runs[0].layout = ['private']; b.runs[0].device.user_agent = 'private';
  assert.equal(r.post(b).ok, true); assert.ok(!JSON.stringify(r.stored()).includes('private'));
  for (const values of [{ rows: 21 }, { pairs_total: 9 }, { color_count: 4 }, { flips: 3 },
    { moves: 1 }, { unique_positions: 1 }, { early_closes: 1 }, { elapsed_ms: 0, foreground_ms: 1 }, { pairs_found: 9 }]) {
    const invalid = example(); Object.assign(invalid.runs[0], values); assert.equal(receiver().post(invalid).ok, false, JSON.stringify(values));
  }
  const complete = example(); const run = complete.runs[0];
  Object.assign(run, { moves: 8, flips: 16, pairs_found: 8, unique_positions: 16, outcome: 'completed', ended_at: run.updated_at });
  assert.equal(receiver().post(complete).ok, true);
  run.unique_positions = 15; assert.equal(receiver().post(complete).ok, false);
  assert.equal(r.post('invalid').error, 'invalid_json');
  assert.equal(r.post(' '.repeat(60001)).error, 'batch_too_large');
  const duplicate = example(); duplicate.runs.push(duplicate.runs[0]); assert.equal(receiver().post(duplicate).error, 'invalid_run');
});

test('Memory backend agrees with engine settings across odd, colored and sized boards', () => {
  for (const [rows, columns] of [[3,3], [6,6], [4,10], [13,13], [14,14], [20,20]]) {
    const b = example(), view = createMemoryGame(Math.random, { rows, columns }).view();
    Object.assign(b.runs[0], { rows, columns, pairs_total: view.totalPairs, blocked_cells: view.blockedCells,
      shape_count: view.shapeCount, color_count: view.colorCount, size_count: view.sizeCount, variant_count: view.variantCount });
    assert.equal(receiver().post(b).ok, true);
  }
});

test('Memory receiver fails closed on budget errors and reserves uncertain writes', () => {
  const r = receiver({ initialized: false }); assert.equal(r.post(example()).error, 'budget_unavailable');
  r.context.verifySetup(); const budget = r.properties.get('ANALYTICS_BUDGET_V1');
  r.context.verifySetup(); assert.equal(r.properties.get('ANALYTICS_BUDGET_V1'), budget);
  assert.equal(r.post(example()).ok, true);
  const fail = receiver({ writeFailure: true }); assert.equal(fail.post(example()).error, 'storage_error');
  assert.equal(JSON.parse(fail.properties.get('ANALYTICS_BUDGET_V1')).files, 1);
  for (const [field, value, error] of [['bytes', 1000000000, 'storage_limit'], ['day_files', 5000, 'daily_limit'], ['tokens', 0, 'rate_limited']]) {
    const limited = receiver(), state = JSON.parse(limited.properties.get('ANALYTICS_BUDGET_V1'));
    state[field] = value; state.day = '2026-10-19'; limited.properties.set('ANALYTICS_BUDGET_V1', JSON.stringify(state));
    assert.equal(limited.post(example()).error, error); assert.equal(limited.writes(), 0);
  }
  r.properties.set('INGEST_ENABLED', 'false'); assert.equal(r.post(example()).error, 'disabled');
});
