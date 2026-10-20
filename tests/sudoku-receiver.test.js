import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRunAnalytics } from '../sudoku-game/js/analytics.js';
const source = readFileSync(new URL('../sudoku-game/analytics/apps-script/Code.gs', import.meta.url), 'utf8');
function example() {
  const memory = new Map();
  const a = createRunAnalytics({ endpoint: 'https://example.test/exec', environment: 'development',
    buildId: 'sha256-0123456789abcdef', id: () => 'test-run',
    device: { category: 'desktop', input: 'mouse', viewport: 'large' },
    storage: { list: () => [...memory.keys()], get: key => memory.get(key), set: (key, value) => memory.set(key, value) } });
  a.start([...'530070000600195000098000060800060003400803001700020006060000280000419005000080079'].map(Number), true);
  return { schema_version: 1, game: 'sudoku', batch_id: 'test-batch', sent_at: new Date().toISOString(), runs: [JSON.parse([...memory.values()][0])] };
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
test('initial, repeated, stale, newer and terminal summaries keep one compressed file', () => {
  const r = receiver(), b = example();
  assert.equal(r.post(b).ok, true); assert.equal(r.files.size, 1); assert.equal(r.writes(), 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.writes(), 1);
  const newer = structuredClone(b); newer.runs[0].revision++; newer.runs[0].filled = 1;
  newer.runs[0].peak_filled = 1; newer.runs[0].counters.entries = 1;
  assert.equal(r.post(newer).ok, true); assert.equal(r.writes(), 2); assert.equal(r.files.size, 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.stored().run.revision, 2);
  const final = structuredClone(newer); final.runs[0].revision++; final.runs[0].outcome = 'solver_revealed'; final.runs[0].ended_at = final.runs[0].updated_at;
  assert.equal(r.post(final).ok, true); assert.equal(r.files.size, 1);
  const after = structuredClone(final); after.runs[0].revision++;
  assert.equal(r.post(after).error, 'run_already_finished');
});
test('validation allowlists fields and refuses malformed input, conflicting IDs/revisions and regressing counts', () => {
  const r = receiver(), b = example(); b.runs[0].answers = 'private'; b.runs[0].device.user_agent = 'private'; b.runs[0].counters.free_text = 'private';
  assert.equal(r.post(b).ok, true); assert.ok(!JSON.stringify(r.stored()).includes('private'));
  const conflict = structuredClone(b); conflict.runs[0].filled = 1; conflict.runs[0].peak_filled = 1;
  assert.equal(r.post(conflict).error, 'revision_conflict');
  conflict.runs[0].revision++; conflict.runs[0].initial_clues = '0'.repeat(81);
  assert.equal(r.post(conflict).error, 'invalid_clue_count');
  assert.equal(r.post('bad json').error, 'invalid_json');
  assert.equal(r.post(' '.repeat(60001)).error, 'batch_too_large');
  const duplicate = structuredClone(b); duplicate.runs.push(duplicate.runs[0]);
  assert.equal(r.post(duplicate).error, 'invalid_run');
  const completed = structuredClone(b); completed.runs[0].outcome = 'completed'; completed.runs[0].ended_at = completed.runs[0].updated_at;
  assert.equal(r.post(completed).error, 'invalid_completion');
  const wrongGame = structuredClone(b); wrongGame.game = 'snake'; assert.equal(r.post(wrongGame).error, 'invalid_schema');
});
test('budgets fail closed, uncertain writes retain reservations, and setup is idempotent', () => {
  const r = receiver({ initialized: false }); assert.equal(r.post(example()).error, 'budget_unavailable');
  r.context.verifySetup(); const state = r.properties.get('ANALYTICS_BUDGET_V1');
  r.context.verifySetup(); assert.equal(r.properties.get('ANALYTICS_BUDGET_V1'), state);
  assert.equal(r.post(example()).ok, true);
  const failure = receiver({ writeFailure: true }); assert.equal(failure.post(example()).error, 'storage_error');
  assert.equal(JSON.parse(failure.properties.get('ANALYTICS_BUDGET_V1')).files, 1);
  const limited = receiver(), budget = JSON.parse(limited.properties.get('ANALYTICS_BUDGET_V1'));
  budget.day_files = 5000; budget.day = '2026-10-19'; limited.properties.set('ANALYTICS_BUDGET_V1', JSON.stringify(budget));
  assert.equal(limited.post(example()).error, 'daily_limit'); assert.equal(limited.writes(), 0);
  limited.properties.set('INGEST_ENABLED', 'false'); assert.equal(limited.post(example()).error, 'disabled');
});

test('manual mode is validated, stored, immutable within a run and backward compatible', () => {
  const r = receiver(), b = example(); b.runs[0].manual_mode = true;
  assert.equal(r.post(b).error, 'invalid_mode');
  b.runs[0].check_conflicts = false; assert.equal(r.post(b).ok, true);
  assert.equal(r.stored().run.manual_mode, true);
  b.runs[0].revision++; b.runs[0].manual_mode = false;
  assert.equal(r.post(b).error, 'run_id_conflict');
  const legacy = receiver(), old = example(); delete old.runs[0].manual_mode;
  assert.equal(legacy.post(old).ok, true); assert.equal(legacy.post(old).ok, true);
  assert.equal('manual_mode' in legacy.stored().run, false);
});

test('difficulty/timing metadata is bounded, immutable, optional for old reports, and retains zero serve time',()=>{
 const r=receiver(),b=example();Object.assign(b.runs[0],{requested_difficulty:'hard',given_difficulty:'medium',puzzle_generation_ms:904,puzzle_serve_ms:0,difficulty_version:'logic-v1'});
 assert.equal(r.post(b).ok,true);assert.equal(r.post(b).ok,true);
 assert.equal(r.stored().run.puzzle_serve_ms,0);assert.equal(r.stored().run.puzzle_generation_ms,904);
 const next=structuredClone(b);next.runs[0].revision++;next.runs[0].puzzle_serve_ms=1;
 assert.equal(r.post(next).error,'run_id_conflict');
 for(const changes of [{given_difficulty:'expert'},{requested_difficulty:'easy',given_difficulty:'hard'},
 {puzzle_generation_ms:-1},{puzzle_serve_ms:300001},{puzzle_serve_ms:1.5},{difficulty_version:'bad value'}]){
  const invalid=structuredClone(b);Object.assign(invalid.runs[0],changes);assert.equal(receiver().post(invalid).ok,false);
 }
 const partial=example();partial.runs[0].requested_difficulty='hard';assert.equal(receiver().post(partial).ok,false);
 const old=receiver(),legacy=example();assert.equal(old.post(legacy).ok,true);assert.equal(old.post(legacy).ok,true);
 assert.equal('requested_difficulty' in old.stored().run,false);
});
test('Novice reports are accepted and cannot fall forward to a harder level', () => {
 const b=example();Object.assign(b.runs[0],{requested_difficulty:'novice',given_difficulty:'novice',puzzle_generation_ms:15,puzzle_serve_ms:0,difficulty_version:'logic-v2'});
 assert.equal(receiver().post(b).ok,true);
 b.runs[0].given_difficulty='easy';assert.equal(receiver().post(b).error,'invalid_difficulty');
 b.runs[0].requested_difficulty='easy';b.runs[0].given_difficulty='novice';assert.equal(receiver().post(b).ok,true);
});
