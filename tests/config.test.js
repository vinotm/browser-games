import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDeploymentConfig } from '../shared/js/config.js';
import { createAnalytics } from '../shared/js/analytics.js';

test('public deployment configuration defaults to disabled when unavailable or invalid', async () => {
  for (const value of [null, {}, { analyticsEndpoint: 42 }, { analyticsEndpoint: '' },
    { analyticsEndpoint: 'http://example.test/exec' },
    { analyticsEndpoint: 'https://user:password@example.test/exec' },
    { analyticsEndpoint: 'https://example.test/exec#fragment' },
    { analyticsEndpoint: 'not-a-url' }]) {
    assert.deepEqual(await loadDeploymentConfig('test', async () => ({ ok: true, json: async () => value })),
      { analyticsEndpoint: '' });
  }
  assert.deepEqual(await loadDeploymentConfig('test', async () => { throw new Error('offline'); }),
    { analyticsEndpoint: '' });
  assert.deepEqual(await loadDeploymentConfig('test', async () => ({ ok: false })),
    { analyticsEndpoint: '' });
});

test('deployment configuration accepts a public HTTPS endpoint and drops other settings', async () => {
  const result = await loadDeploymentConfig('test', async (_, options) => {
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    return { ok: true, json: async () => ({ analyticsEndpoint: 'https://example.test/exec', ignored: 'unused' }) };
  });
  assert.deepEqual(result, { analyticsEndpoint: 'https://example.test/exec' });
});

test('disabled analytics neither reads local data nor records or uploads a session', async () => {
  const unexpected = () => { assert.fail('Disabled analytics must not access storage or the network'); };
  const analytics = createAnalytics({ endpoint: '', storage: { get: unexpected, set: unexpected }, fetcher: unexpected });
  analytics.start();
  analytics.record('item_spawned', 100, {}, 'food-1');
  analytics.checkpoint();
  analytics.finish('completed', 200);
  assert.equal(analytics.active, false);
  assert.equal(analytics.pending, 0);
  assert.equal(await analytics.flush(), false);
});
