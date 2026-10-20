import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaveGuard } from '../shared/js/leave-guard.js';

function setup() {
  const target = new EventTarget();
  let active = false, allow = false, prompts = 0, restored = 0;
  const visits = [];
  const guard = createLeaveGuard({ target, isActive: () => active,
    confirmLeave: async () => { prompts++; return allow; },
    onPrompt: () => () => { restored++; }, navigate: url => visits.push(url) });
  const unload = () => { const e = new Event('beforeunload', { cancelable: true }); Object.defineProperty(e, 'returnValue', { value: '', writable: true }); target.dispatchEvent(e); return e.defaultPrevented; };
  return { guard, target, visits, unload, setActive(value) { active = value; guard.refresh(); },
    allow(value) { allow = value; }, prompts: () => prompts, restored: () => restored };
}

test('unstarted and completed games navigate without confirmation; active and paused games warn', async () => {
  const s = setup();
  assert.equal(s.unload(), false);
  assert.equal(await s.guard.request('/'), true);
  assert.equal(s.prompts(), 0);
  s.setActive(true);
  assert.equal(s.unload(), true);
  assert.equal(await s.guard.request('/'), false);
  assert.equal(s.restored(), 1);
  assert.equal(s.unload(), true);
  s.setActive(false);
  assert.equal(s.unload(), false);
  s.guard.dispose();
});

test('confirmed navigation bypasses duplicate native warning; returning restores protection', async () => {
  const s = setup(); s.setActive(true); s.allow(true);
  assert.equal(await s.guard.request('/'), true);
  assert.equal(s.unload(), false);
  assert.deepEqual(s.visits, ['/']);
  assert.equal(s.restored(), 0);
  s.target.dispatchEvent(new Event('pageshow'));
  assert.equal(s.unload(), true);
  s.guard.dispose(); assert.equal(s.unload(), false);
});

test('a pending confirmation ignores repeated navigation attempts', async () => {
  let resolve;
  const visits = [];
  const guard = createLeaveGuard({ target: new EventTarget(), isActive: () => true,
    confirmLeave: () => new Promise(done => { resolve = done; }), navigate: url => visits.push(url) });
  const first = guard.request('/first');
  assert.equal(await guard.request('/second'), false);
  resolve(true); await first;
  assert.deepEqual(visits, ['/first']); guard.dispose();
});
