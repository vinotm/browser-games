import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRunAnalytics } from '../sos-game/js/analytics.js';
import { createGame, allowedLetters, play } from '../sos-game/js/rules.js';
const source = readFileSync(new URL('../sos-game/analytics/apps-script/Code.gs', import.meta.url), 'utf8');
function example() {
  const memory = new Map();
  const a = createRunAnalytics({ endpoint: 'https://example.test/exec', id: () => 'test-run',
    storage: { list: () => [...memory.keys()], get: key => memory.get(key), set: (k,v) => memory.set(k,v) } });
  a.start({ size: 4, mode: 'local', firstPlayer: 0 });
  return { schema_version: 1, game: 'sos', batch_id: 'test-batch', sent_at: new Date().toISOString(), runs: [JSON.parse([...memory.values()][0])] };
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
test('compressed run updates are idempotent, append-only and terminal reports are immutable', () => {
  const r = receiver(), b = example(); assert.equal(r.post(b).ok, true); assert.equal(r.writes(), 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.writes(), 1);
  const newer = structuredClone(b); newer.runs[0].revision++; newer.runs[0].moves.push([0,0,0]);
  assert.equal(r.post(newer).ok, true); assert.equal(r.files.size, 1);
  assert.equal(r.post(b).ok, true); assert.equal(r.stored().run.moves.length, 1);
  const changed = structuredClone(newer); changed.runs[0].revision++; changed.runs[0].moves[0][1] = 1;
  assert.equal(r.post(changed).error, 'invalid_revision');
  const end = structuredClone(newer); end.runs[0].revision++; end.runs[0].outcome = 'restarted'; end.runs[0].ended_at = end.runs[0].updated_at;
  assert.equal(r.post(end).ok, true); end.runs[0].revision++;
  assert.equal(r.post(end).error, 'run_already_finished');
});
test('receiver replays legal turns, scoring extra turns and per-player limits exactly like game rules', () => {
  let seed = 42;
  const random = n => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % n; };
  for (const size of [4,6,8,10]) for (let trial = 0; trial < 8; trial++) {
    const r = receiver(), b = example(), run = b.runs[0]; run.rows = run.columns = size;
    run.first_player = trial % 2; run.mode = trial % 2 ? 'computer' : 'local'; run.difficulty = run.mode === 'computer' ? 'hard' : null;
    let state = createGame(size); state.player = run.first_player;
    let computerMoves = 0;
    while (!state.finished) {
      const empty = state.cells.flatMap((c,i) => c ? [] : [i]), letters = allowedLetters(state);
      const index = empty[random(empty.length)], letter = letters[random(letters.length)];
      if (run.mode === 'computer' && state.player === 1) computerMoves++;
      run.moves.push([index, letter === 'S' ? 0 : 1, 0]); state = play(state, index, letter);
    }
    run.ai.decisions = computerMoves; run.outcome = 'completed'; run.ended_at = run.updated_at;
    assert.equal(r.post(b).ok, true);
    const replay = r.context.replay_(run);
    assert.deepEqual([...replay.scores], state.scores); assert.equal(replay.player, state.player);
  }
});
test('invalid moves, timings, AI counts and personal fields are rejected or discarded', () => {
  const r = receiver(), b = example(); b.runs[0].names = ['private']; b.runs[0].device.user_agent = 'private';
  assert.equal(r.post(b).ok, true); assert.ok(!JSON.stringify(r.stored()).includes('private'));
  const collision = structuredClone(b); collision.runs[0].moves.push([0,0,0]);
  assert.equal(r.post(collision).error, 'revision_conflict');
  for (const moves of [[[0,0,0],[0,1,0]], [[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0]], [[16,0,0]], [[0,2,0]], [[0,0,10]]]) {
    const invalid = example(); invalid.runs[0].moves = moves; assert.equal(receiver().post(invalid).ok, false);
  }
  const completed = example(); completed.runs[0].outcome = 'completed'; completed.runs[0].ended_at = completed.runs[0].updated_at;
  assert.equal(receiver().post(completed).error, 'invalid_completion');
  const ai = example(); ai.runs[0].ai.decisions = 1; assert.equal(receiver().post(ai).error, 'invalid_ai');
  assert.equal(r.post('invalid').error, 'invalid_json');
  assert.equal(r.post(' '.repeat(60001)).error, 'batch_too_large');
  const duplicate = example(); duplicate.runs.push(duplicate.runs[0]); assert.equal(r.post(duplicate).error, 'invalid_run');
});
test('missing budgets fail closed; uncertain writes reserve capacity; setup is idempotent', () => {
  const r = receiver({ initialized: false }); assert.equal(r.post(example()).error, 'budget_unavailable');
  r.context.verifySetup(); const budget = r.properties.get('ANALYTICS_BUDGET_V1');
  r.context.verifySetup(); assert.equal(r.properties.get('ANALYTICS_BUDGET_V1'), budget);
  assert.equal(r.post(example()).ok, true);
  const failure = receiver({ writeFailure: true }); assert.equal(failure.post(example()).error, 'storage_error');
  assert.equal(JSON.parse(failure.properties.get('ANALYTICS_BUDGET_V1')).files, 1);
  const full = receiver(), state = JSON.parse(full.properties.get('ANALYTICS_BUDGET_V1'));
  state.bytes = 1000000000; full.properties.set('ANALYTICS_BUDGET_V1', JSON.stringify(state));
  assert.equal(full.post(example()).error, 'storage_limit'); assert.equal(full.writes(), 0);
  full.properties.set('INGEST_ENABLED', 'false'); assert.equal(full.post(example()).error, 'disabled');
});

test('schema 2 rectangular replay, maximum dimensions and schema 1 compatibility', () => {
  for (const [rows,columns] of [[3,8],[12,20],[20,12],[20,20]]) {
    const r=receiver(),b=example(),run=b.runs[0]; run.rows=rows;run.columns=columns;
    let state=createGame(rows,columns);
    while(!state.finished){
      const index=state.cells.findIndex(c=>!c),letters=allowedLetters(state),letter=letters[index%letters.length];
      state=play(state,index,letter);run.moves.push([index,letter==='S'?0:1,0]);
    }
    run.outcome='completed';run.ended_at=run.updated_at;
    assert.equal(r.post(b).ok,true);
    assert.deepEqual([...r.context.replay_(run).scores],state.scores);
    assert.equal(r.stored().run.rows,rows);assert.equal(r.stored().run.columns,columns);
    const wrong=example();wrong.runs[0].rows=21;assert.equal(receiver().post(wrong).error,'invalid_setting');
  }
  const r=receiver(),legacy=example(),run=legacy.runs[0];
  run.schema_version=1;run.rules_version='per-player-limit-v1';run.size=4;delete run.rows;delete run.columns;
  assert.equal(r.post(legacy).ok,true);assert.equal(r.post(legacy).ok,true);
  assert.equal(r.stored().run.size,4);assert.equal(r.stored().run.schema_version,1);
  const changed=structuredClone(legacy);changed.runs[0].revision++;changed.runs[0].schema_version=2;
  changed.runs[0].rules_version='rectangular-v2';changed.runs[0].rows=4;changed.runs[0].columns=4;
  assert.equal(r.post(changed).error,'run_id_conflict');
});
