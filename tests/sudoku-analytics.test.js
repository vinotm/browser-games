import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunAnalytics } from '../sudoku-game/js/analytics.js';
const clues = [...'530070000600195000098000060800060003400803001700020006060000280000419005000080079'].map(Number);
function setup(overrides = {}) {
  let millis = 1700000000000, serial = 0;
  const memory = new Map(), calls = [];
  const storage = { list: () => [...memory.keys()], get: key => memory.get(key),
    set: (key, value) => memory.set(key, value), remove: key => memory.delete(key) };
  const collector = createRunAnalytics({ endpoint: 'https://example.test/exec', environment: 'development',
    buildId: 'sha256-0123456789abcdef', device: { category: 'mobile', input: 'touch', viewport: 'small' },
    storage, now: () => millis, clock: () => millis, id: () => `id-${++serial}`,
    fetcher: async (_, options) => { const data = JSON.parse(options.body); calls.push(data);
      return { ok: true, json: async () => ({ ok: true, batch_id: data.batch_id }) }; }, ...overrides });
  return { collector, memory, storage, calls, tick: ms => { millis += ms; }, latest: () => JSON.parse([...memory.values()].at(-1)) };
}
test('summaries retain initial puzzle and counters without a move log; newer snapshots replace old ones', async () => {
  const s = setup(), a = s.collector;
  a.start(clues, false); s.tick(1000); a.count('entries'); a.count('unexpected'); a.progress(3);
  a.checkpoint({ filled: 2, elapsed_ms: 1000 });
  assert.equal(s.memory.size, 1);
  const record = s.latest();
  assert.equal(record.initial_clues, clues.join('')); assert.equal(record.peak_filled, 3);
  assert.equal(record.counters.entries, 1); assert.equal(record.counters.unexpected, undefined);
  assert.equal(record.events, undefined); assert.equal(record.board, undefined);
  assert.equal(record.check_conflicts, false); assert.equal(record.environment, 'development');
  a.finish('completed', { filled: 51, elapsed_ms: 1000 });
  assert.equal(a.active, false); assert.equal(s.latest().outcome, 'completed');
  assert.equal(await a.flush(), true); assert.equal(s.memory.size, 0);
});
test('foreground time excludes hidden time; wall and game timers can continue', () => {
  const s = setup(), a = s.collector;
  a.start(clues, true); s.tick(1000); a.visibility(false); s.tick(5000); a.visibility(true); s.tick(2000);
  a.checkpoint({ filled: 1, elapsed_ms: 8000 });
  assert.equal(s.latest().foreground_ms, 3000); assert.equal(s.latest().wall_elapsed_ms, 8000);
});
test('failed/unacknowledged reports survive reload and newer in-flight revisions survive old acknowledgements', async () => {
  let resolve, calls = 0;
  const s = setup({ fetcher: async (_, options) => {
    calls++; const body = JSON.parse(options.body);
    if (calls === 1) return { ok: true, json: async () => ({ ok: false }) };
    await new Promise(r => { resolve = r; });
    return { ok: true, json: async () => ({ ok: true, batch_id: body.batch_id }) };
  } });
  s.collector.start(clues, true); assert.equal(await s.collector.flush(), false); assert.equal(s.memory.size, 1);
  const request = s.collector.flush({ force: true });
  s.tick(1000); s.collector.checkpoint({ filled: 1, elapsed_ms: 1000 }); resolve(); await request;
  assert.equal(s.memory.size, 1); assert.equal(s.latest().revision, 2);
  const reloaded = setup({ storage: s.storage });
  assert.equal(await reloaded.collector.flush(), true); assert.equal(s.memory.size, 0);
});
test('unconfigured analytics and unavailable storage never prevent play', async () => {
  const a = createRunAnalytics({ storage: { list() { throw Error('denied'); }, set() { throw Error('denied'); } } });
  a.start(clues, true); a.count('entries'); a.finish('completed', {});
  assert.equal(a.active, false); assert.equal(await a.flush(), false);
  const s = setup({ storage: { list() { throw Error('denied'); }, set() { throw Error('denied'); } } });
  s.collector.start(clues, true); s.collector.checkpoint(); assert.equal(s.collector.active, true);
});
test('independent tabs preserve each other’s queued reports and storage is bounded', () => {
  const s = setup(); s.collector.start(clues, true);
  const other = setup({ storage: s.storage, id: () => 'other-tab' }); other.collector.start(clues, true);
  assert.equal(s.memory.size, 2);
  for (let i = 0; i < 120; i++) { s.collector.finish('restarted', {}); s.tick(1); s.collector.start(clues, true); }
  assert.ok(s.memory.size <= 100);
});

test('manual runs are identified without persisting a mode preference', () => {
  const s = setup(); s.collector.start(clues, false, true);
  assert.equal(s.latest().manual_mode, true); assert.equal(s.latest().check_conflicts, false);
  s.collector.finish('settings_changed', {}); s.collector.start(clues, true);
  assert.equal(s.latest().manual_mode, false);
});

test('requested and given difficulty plus generation and serve time remain separate across snapshots', () => {
  const s=setup();
  s.collector.start(clues,true,false,{requestedDifficulty:'hard',givenDifficulty:'medium',generationMs:721,serveMs:2034,generatorVersion:'guided-v1'});
  const initial=s.latest();
  assert.equal(initial.game_version,'beta-5.3'); assert.equal(initial.generator_version,'guided-v1');
  assert.equal(initial.requested_difficulty,'hard'); assert.equal(initial.given_difficulty,'medium');
  assert.equal(initial.puzzle_generation_ms,721);assert.equal(initial.puzzle_serve_ms,2034);
  s.tick(1000);s.collector.checkpoint({elapsed_ms:1000});
  assert.equal(s.latest().puzzle_generation_ms,721);assert.equal(s.latest().puzzle_serve_ms,2034);
  s.collector.finish('restarted',{});
  s.collector.start(clues,true,false,{requestedDifficulty:'easy',givenDifficulty:'easy',generationMs:932,serveMs:0,generatorVersion:'guided-v1'});
  assert.equal(s.latest().puzzle_serve_ms,0); assert.equal(s.latest().puzzle_generation_ms,932);
});
test('Novice delivery metadata is retained in analytics', () => {
 const s=setup();s.collector.start(clues,true,false,{requestedDifficulty:'novice',givenDifficulty:'novice',generationMs:15,serveMs:0,generatorVersion:'guided-v2',difficultyVersion:'logic-v2'});
 const run=s.latest();assert.equal(run.requested_difficulty,'novice');assert.equal(run.given_difficulty,'novice');assert.equal(run.difficulty_version,'logic-v2');
});
