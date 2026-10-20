import test from 'node:test';
import assert from 'node:assert/strict';
import { createScreenAwake } from '../shared/js/screen-awake.js';
const settle = () => new Promise(resolve => setImmediate(resolve));
test('awake window expires after five idle minutes; interaction renews it; hidden and completed games release', async () => {
  let now = 0, alarm, requests = 0, releases = 0;
  const awake = createScreenAwake({ clock: () => now, schedule: cb => { alarm = cb; return 1; }, cancel() {},
    wakeLock: { async request() { requests++; return { addEventListener() {}, async release() { releases++; } }; } } });
  awake.setActive(true); await settle(); assert.equal(requests, 1);
  now = 240000; awake.activity(); now = 300000; alarm(); await settle(); assert.equal(releases, 0);
  now = 540000; alarm(); await settle(); assert.equal(releases, 1);
  awake.setVisible(false); awake.setVisible(true); await settle(); assert.equal(requests, 1);
  awake.activity(); await settle(); assert.equal(requests, 2);
  awake.setVisible(false); await settle(); assert.equal(releases, 2);
  awake.setVisible(true); await settle(); assert.equal(requests, 3);
  awake.setActive(false); await settle(); assert.equal(releases, 3);
});
test('a late wake-lock grant is released if the game ends while requesting; refusal is harmless', async () => {
  let resolve, releases = 0;
  const awake = createScreenAwake({ schedule: () => 1, cancel() {}, wakeLock: { request: () => new Promise(r => { resolve = r; }) } });
  awake.setActive(true); awake.setActive(false);
  resolve({ async release() { releases++; } }); await settle(); assert.equal(releases, 1);
  const denied = createScreenAwake({ schedule: () => 1, cancel() {}, wakeLock: { async request() { throw Error('Denied'); } } });
  denied.setActive(true); await settle(); denied.setActive(false);
});
