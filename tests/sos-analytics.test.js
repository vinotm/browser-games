import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunAnalytics } from '../sos-game/js/analytics.js';
function setup(overrides = {}) {
  let ms = 1700000000000, serial = 0;
  const memory = new Map(), calls = [];
  const storage = { list: () => [...memory.keys()], get: key => memory.get(key),
    set: (key, value) => memory.set(key, value), remove: key => memory.delete(key) };
  const a = createRunAnalytics({ endpoint: 'https://example.test/exec', environment: 'development',
    storage, now: () => ms, clock: () => ms, id: () => `id-${++serial}`,
    fetcher: async (_, options) => { const batch = JSON.parse(options.body); calls.push({ batch, options });
      return { ok: true, json: async () => ({ ok: true, batch_id: batch.batch_id }) }; }, ...overrides });
  return { a, memory, storage, calls, tick: value => { ms += value; }, latest: () => JSON.parse([...memory.values()].at(-1)) };
}
const settings = { size: 6, mode: 'computer', difficulty: 'hard', firstPlayer: 1, names: ['secret'] };
test('compact moves, AI work and terminal outcomes exclude names and streak summaries', async () => {
  const s = setup(); s.a.start(settings); s.tick(1000);
  s.a.move(2, 'S', { search_ms: 12.4, nodes: 500, budget_hit: true });
  s.tick(2000); s.a.move(3, 'O'); s.a.finish('restarted');
  const run = s.latest(); assert.deepEqual(run.moves, [[2, 0, 1000], [3, 1, 3000]]);
  assert.equal(run.game_version, 'beta-3'); assert.equal(run.elapsed_ms, 3000);
  assert.equal(run.ai.decisions, 1); assert.equal(run.ai.search_ms, 12); assert.equal(run.ai.budget_hits, 1);
  assert.equal(run.ended_at, run.updated_at); assert.equal(run.outcome, 'restarted');
  assert.equal(s.a.active, false); assert.ok(!JSON.stringify(run).includes('secret'));
  assert.equal(run.streaks, undefined); assert.equal(run.scores, undefined);
  assert.equal(await s.a.flush(), true); assert.equal(s.memory.size, 0);
});
test('foreground excludes hidden intervals and local matches omit computer difficulty', () => {
  const s = setup(); s.a.start({ ...settings, mode: 'local' }); s.tick(1000);
  s.a.visibility(false); s.tick(5000); s.a.visibility(true); s.tick(2000); s.a.checkpoint();
  assert.equal(s.latest().foreground_ms, 3000); assert.equal(s.latest().elapsed_ms, 8000);
  assert.equal(s.latest().difficulty, null);
});
test('failed requests persist across reload and old acknowledgements preserve new revisions', async () => {
  let resolve;
  const s = setup({ fetcher: async (_, options) => {
    const batch = JSON.parse(options.body); await new Promise(r => { resolve = r; });
    return { ok: true, json: async () => ({ ok: true, batch_id: batch.batch_id }) };
  } });
  s.a.start(settings); const pending = s.a.flush(); s.tick(100); s.a.move(1, 'O'); resolve(); await pending;
  assert.equal(s.memory.size, 1); assert.equal(s.latest().revision, 2);
  const bad = setup({ storage: s.storage, fetcher: async () => { throw Error('offline'); } });
  assert.equal(await bad.a.flush(), false); assert.equal(s.memory.size, 1);
  const reloaded = setup({ storage: s.storage }); assert.equal(await reloaded.a.flush(), true);
  assert.equal(s.memory.size, 0);
});
test('disabled analytics and storage denial never affect play; corrupt entries do not block valid reports', async () => {
  const disabled = createRunAnalytics({ id: () => { throw Error('must not create ID'); } });
  disabled.start(settings); disabled.move(1, 'S'); disabled.finish('completed'); assert.equal(disabled.active, false);
  const denied = setup({ storage: { list() { throw Error('denied'); }, set() { throw Error('denied'); } } });
  denied.a.start(settings); denied.a.move(1, 'S'); denied.a.checkpoint();
  const s = setup(); s.memory.set('sos-report-v1-broken', '{'); s.a.start(settings);
  assert.equal(await s.a.flush(), true); assert.equal(s.calls[0].batch.runs.length, 1);
});
test('queue and UTF-8 upload bodies remain bounded and tabs keep separate reports', async () => {
  const s = setup(); s.a.start(settings);
  const other = setup({ storage: s.storage, id: () => 'other-tab' }); other.a.start(settings);
  assert.equal(s.memory.size, 2);
  const sample = s.latest();
  sample.moves = Array.from({ length: 100 }, (_, i) => [i, i % 2, 100000000 + i]);
  for (let i = 0; i < 110; i++) {
    const run = { ...sample, run_id: `backlog-${i}` };
    s.memory.set(`sos-report-v1-${run.run_id}`, JSON.stringify(run));
  }
  s.a.checkpoint();
  assert.ok(s.memory.size <= 100);
  assert.ok([...s.memory.values()].reduce((n, v) => n + Buffer.byteLength(v), 0) <= 200000);
  await s.a.flush({ keepalive: true }); assert.ok(Buffer.byteLength(s.calls[0].options.body) <= 60000);
  assert.equal(s.calls[0].options.credentials, 'omit');
});

test('AI telemetry preserves move choice and measures actual search work', async () => {
  const { chooseMove } = await import('../sos-game/js/opponent.js');
  const { createGame } = await import('../sos-game/js/rules.js');
  const { computerMove, measuredComputerMove } = await import('../sos-game/js/difficulty.js');
  let stats;
  const state = createGame(4), options = { depth: 2, maxNodes: 500, random: () => .1 };
  const original = chooseMove(state, options);
  assert.deepEqual(chooseMove(state, { ...options, onStats: value => { stats = value; } }), original);
  assert.ok(stats.nodes > 0); assert.equal(typeof stats.budget_hit, 'boolean');
  computerMove(state, 'easy', () => .1, value => { stats = value; });
  assert.equal(stats.random, true); assert.equal(stats.nodes, 0);
  const measured = measuredComputerMove(state, 'medium');
  assert.ok(measured.stats.nodes > 0); assert.ok(measured.stats.search_ms >= 0);
});
