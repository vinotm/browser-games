import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDevice, describeDevice } from '../shared/js/device.js';

test('desktop classification does not change just because its window is narrow', () => {
  assert.deepEqual(classifyDevice({ fine: true, width: 390, height: 800 }),
    { category: 'desktop', input: 'mouse', viewport: 'small' });
  assert.equal(classifyDevice({ fine: true, touchPoints: 10, width: 1280, height: 800 }).input, 'mixed');
  assert.equal(classifyDevice({ mobile: false, width: 1280, height: 800 }).category, 'desktop');
});

test('touch phones and tablets retain broad categories across orientation changes', () => {
  for (const [width, height] of [[390, 844], [844, 390]])
    assert.equal(classifyDevice({ coarse: true, touchPoints: 5, width, height }).category, 'mobile');
  assert.equal(classifyDevice({ coarse: true, touchPoints: 5, width: 1024, height: 768 }).category, 'tablet');
  assert.equal(classifyDevice({ mobile: true, fine: true, width: 900, height: 1200 }).category, 'mobile');
});

test('device metadata contains coarse fields only, with safe unknown fallbacks', () => {
  assert.deepEqual(describeDevice({}), { category: 'unknown', input: 'unknown', viewport: 'unknown' });
  const result = describeDevice({ navigator: { maxTouchPoints: 5 }, innerWidth: 390, innerHeight: 844,
    matchMedia: (query) => ({ matches: query.includes('coarse') }) });
  assert.deepEqual(result, { category: 'mobile', input: 'touch', viewport: 'small' });
});
