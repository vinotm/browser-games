import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../shared/js/analytics.js';

function setup({ fetcher, storage, now } = {}) {
  let seq = 0;
  const memory = new Map();
  const saved = storage ?? { get: (key, fallback) => memory.get(key) ?? fallback,
    set: (key, value) => memory.set(key, value) };
  const calls = [];
  const telemetry = createAnalytics({ endpoint: 'https://example.test/exec', game: 'snake', version: 'test',
    device: () => ({ category: 'mobile', input: 'touch', viewport: 'small' }),
    storage: saved, now: now ?? (() => 1700000000000), id: () => `id-${++seq}`,
    fetcher: fetcher ?? (async (_, options) => {
      const batch = JSON.parse(options.body); calls.push(batch);
      return { ok: true, json: async () => ({ ok: true, batch_id: batch.batch_id }) };
    }) });
  return { telemetry, calls, saved };
}

test('completed runs upload with device, UTC timestamps and joined object lifecycles', async () => {
  const { telemetry: a, calls } = setup();
  a.start(0);
  a.record('item_spawned', 100, { kind: 'normal_food' }, 'food-1');
  a.record('item_eaten', 500, { points: 2, score: 2 }, 'food-1');
  a.finish('completed', 1200, { score: 2 });
  assert.equal(a.pending, 1);
  assert.equal(await a.flush(), true);
  assert.equal(a.pending, 0);
  const run = calls[0].runs[0];
  assert.equal(run.device.category, 'mobile');
  assert.equal(run.status, 'completed');
  assert.equal(run.summary.score, 2);
  assert.deepEqual(run.events.map((e) => e.seq), [0, 1, 2, 3]);
  assert.equal(calls[0].schema_version, 2);
  assert.ok(run.started_at.endsWith('Z'));
  assert.ok(run.events.every((e) => Number.isSafeInteger(e.elapsed_ms) && !('occurred_at' in e)));
  assert.deepEqual(run.events.slice(1, 3).map((e) => e.object_id), ['food-1', 'food-1']);
});

test('build and environment remain attached across chunks, reload and queued uploads', async () => {
  const { telemetry: a, calls, saved } = setup();
  const metadata = { environment: 'development', build_id: 'sha256-1234567890abcdef' };
  a.start(0, metadata);
  a.checkpoint();
  a.finish('completed', 1000, { death_cause: 'wall', wall_id: 'wall-7', wall_source: 'expired_food',
    collision_cell: { x: 4, y: 5 } });
  await a.flush();
  assert.equal(calls.length, 2);
  for (const batch of calls) {
    assert.equal(batch.runs[0].summary.environment, metadata.environment);
    assert.equal(batch.runs[0].summary.build_id, metadata.build_id);
  }
  assert.equal(calls[1].runs[0].summary.wall_id, 'wall-7');
  assert.deepEqual(calls[1].runs[0].events.at(-1).details.collision_cell, { x: 4, y: 5 });
  a.start(0, metadata);
  createAnalytics({ endpoint: 'https://example.test/exec', game: 'snake', version: 'new-version',
    storage: saved, now: () => 1700000002000, id: () => 'reloaded-batch' });
  const recovered = JSON.parse(saved.get('queue')).queue[0];
  assert.equal(recovered.game_version, 'test');
  assert.equal(recovered.runs[0].summary.environment, 'development');
  assert.equal(recovered.runs[0].summary.build_id, metadata.build_id);
});

test('failed or unacknowledged uploads retain the exact batch for later retry', async () => {
  let attempts = 0, clock = 100000;
  const batches = [];
  const { telemetry: a } = setup({ now: () => clock, fetcher: async (_, options) => {
    const batch = JSON.parse(options.body); batches.push(batch);
    if (++attempts === 1) throw new Error('offline');
    return { ok: true, json: async () => ({ ok: true, batch_id: attempts === 2 ? 'wrong-id' : batch.batch_id }) };
  } });
  a.start(); a.finish('completed', 10);
  assert.equal(await a.flush(), false);
  assert.equal(a.pending, 1);
  await a.flush(); assert.equal(attempts, 1);
  clock += 10000;
  assert.equal(await a.flush(), false);
  assert.equal(a.pending, 1);
  assert.equal(await a.flush({ force: true }), true);
  assert.equal(a.pending, 0);
  assert.deepEqual(batches[0], batches[2]);
});

test('partial chunks share a run and increasing sequences, and reload recovers abandonment', () => {
  const { telemetry: a, saved } = setup();
  a.start(); a.record('paused', 100); a.checkpoint();
  a.record('resumed', 100);
  // Use distinct IDs, as crypto.randomUUID does across real page loads.
  let n = 100;
  const b = createAnalytics({ endpoint: 'https://example.test/exec', game: 'snake', version: 'test', storage: saved,
    device: {}, id: () => `id-${++n}`, now: () => 1700000001000 });
  assert.equal(b.active, false);
  const state = JSON.parse(saved.get('queue'));
  assert.equal(state.queue.length, 2);
  const runs = state.queue.map((batch) => batch.runs[0]);
  assert.equal(runs[0].run_id, runs[1].run_id);
  assert.equal(runs[0].status, 'partial');
  assert.equal(runs[1].status, 'abandoned');
  assert.deepEqual(runs.flatMap((r) => r.events.map((e) => e.seq)), [0, 1, 2, 3]);
});

test('long runs split into small chunks, denied storage does not stop gameplay', () => {
  const { telemetry: a } = setup({ storage: { get() { throw new Error('denied'); },
    set() { throw new Error('denied'); } } });
  a.start();
  for (let i = 0; i < 160; i++) a.record('item_spawned', i, { kind: 'food' }, `food-${i}`);
  assert.equal(a.pending, 1);
  a.finish('completed', 200);
  assert.equal(a.pending, 2);
});


test('schema 2 snapshots details, reduces precision and records wall time separately from active time', async () => {
  let clock = 1700000000000;
  const { telemetry: a, calls } = setup({ now: () => clock });
  const summary = { score: 0, base_step_ms: 80 };
  a.start(0, summary);
  a.record('item_spawned', 100, { x: 8.166666666666, warning_at_ms: 695.987 }, 'food-1');
  clock += 3000;
  a.record('paused', 3000);
  clock += 5000;
  a.record('resumed', 3000);
  a.record('combo_increased', 3000, { count: 4 });
  a.record('combo_ended', 3000, { count: 4 });
  a.record('item_eaten', 3000, { score: 5, combo: 4 }, 'food-1');
  summary.score = 999;
  a.finish('completed', 3000, { score: 5 });
  await a.flush();
  const run = calls[0].runs[0];
  assert.equal(run.summary.max_combo, 4);
  assert.equal(run.events[0].details.score, 0);
  assert.equal(run.events[1].details.x, 8.17);
  assert.equal(run.events[1].details.warning_at_ms, 696);
  const resume = run.events.find((e) => e.type === 'resumed');
  assert.equal(resume.elapsed_ms, 8000);
  assert.equal(resume.active_ms, 3000);
  assert.equal('details' in resume, false);
  assert.equal('object_id' in resume, false);
  assert.equal(run.events.some((e) => e.type.startsWith('combo_')), false);
});

test('older queued batches and unfinished runs retain schema 1 on upgrade', async () => {
  const { saved } = setup();
  saved.set('queue', JSON.stringify({ queue: [{ schema_version: 1, batch_id: 'legacy-batch', runs: [] }],
    current: { run_id: 'legacy-run', started_at: '2023-11-14T22:13:20.000Z', next_seq: 1,
      last_active_ms: 100, summary: {}, events: [
        { seq: 0, type: 'run_started', occurred_at: '2023-11-14T22:13:20.000Z', active_ms: 0 }], version: 'old' } }));
  const { telemetry: a, calls } = setup({ storage: saved });
  await a.flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].batch_id, 'legacy-batch');
  assert.equal(calls[1].schema_version, 1);
  assert.ok(calls[1].runs[0].events.at(-1).occurred_at.endsWith('Z'));
  a.start(); a.finish('completed', 0); await a.flush();
  assert.equal(calls[2].schema_version, 2);
});
