import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunAnalytics } from '../memory-game/js/analytics.js';
import { createMemoryGame } from '../memory-game/js/engine.js';
function setup(options = {}) {
  const records = new Map(); let wall = Date.parse('2026-10-27T00:00:00Z'), time = 0;
  const storage = { list: () => [...records.keys()], get: key => records.get(key), set: (k,v) => records.set(k,v), remove: key => records.delete(key) };
  const client = createRunAnalytics({ endpoint: 'https://example.test/exec', storage,
    now: () => wall, clock: () => time, id: () => 'test-id', ...options });
  return { client, records, read: () => JSON.parse([...records.values()][0]),
    advance(ms) { wall += ms; time += ms; } };
}
test('Memory summaries contain only aggregate progress and foreground timing', () => {
  const h = setup(); h.client.start(createMemoryGame().view());
  h.advance(1000); h.client.visibility(false); h.advance(2000);
  h.client.checkpoint({ moves: 1, pairs_found: 0, flips: 2, mismatches: 1, unique_positions: 2, early_closes: 0 });
  const run = h.read(); assert.equal(run.elapsed_ms, 3000); assert.equal(run.foreground_ms, 1000);
  assert.equal(run.moves, 1); assert.equal(run.pairs_total, 8);
  for (const field of ['layout', 'deck', 'cards', 'positions', 'events', 'flips_history', 'visitor_id']) assert.equal(field in run, false);
  h.client.finish('restarted'); assert.equal(h.read().outcome, 'restarted'); assert.equal(h.client.active, false);
});
test('Memory uploads preserve newer revisions until acknowledged and retry failures', async () => {
  let release, sent;
  const h = setup({ fetcher: async (_, options) => { sent = JSON.parse(options.body); await new Promise(resolve => release = resolve);
    return { ok: true, json: async () => ({ ok: true, batch_id: sent.batch_id }) }; } });
  h.client.start(createMemoryGame().view()); const upload = h.client.flush();
  h.advance(100); h.client.checkpoint({ flips: 1, unique_positions: 1 }); release();
  assert.equal(await upload, true); assert.equal(h.records.size, 1); assert.equal(h.read().flips, 1);
  const fail = setup({ fetcher: async () => { throw Error('offline'); } });
  fail.client.start(createMemoryGame().view()); assert.equal(await fail.client.flush(), false); assert.equal(fail.records.size, 1);
});
test('Memory disabled collection and denied storage never block gameplay', () => {
  const disabled = setup({ endpoint: '' }); disabled.client.start(createMemoryGame().view());
  disabled.client.checkpoint(); assert.equal(disabled.records.size, 0);
  const denied = setup({ storage: { list() { throw Error('denied'); }, set() { throw Error('denied'); } } });
  assert.doesNotThrow(() => { denied.client.start(createMemoryGame().view()); denied.client.finish('restarted'); });
});
