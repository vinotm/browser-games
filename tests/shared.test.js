import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock, formatDuration } from '../shared/js/clock.js';
import { createStorage } from '../shared/js/storage.js';
import { createFrameScheduler } from '../shared/js/animation.js';
import { createTheme } from '../shared/js/theme.js';
import { bindSwipe, bindDirectionButtons } from '../shared/js/input.js';

test('direction buttons act on press and ignore the release click', () => {
  const element = new EventTarget();
  const classes = new Set();
  const button = {
    dataset: { direction: 'up' }, disabled: false,
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    setPointerCapture() {},
  };
  element.contains = candidate => candidate === button;
  const moves = [];
  const unbind = bindDirectionButtons(element, direction => moves.push(direction));
  function send(type, detail = 0) {
    const event = new Event(type);
    Object.assign(event, { detail, pointerId: 1, pointerType: 'touch' });
    Object.defineProperty(event, 'target', { value: { closest: () => button } });
    element.dispatchEvent(event);
  }
  send('pointerdown');
  assert.deepEqual(moves, ['up']); // Must happen before release.
  assert.equal(classes.has('is-pressed'), true);
  send('pointerup');
  send('click', 1);
  assert.deepEqual(moves, ['up']); // No second turn on release.
  assert.equal(classes.has('is-pressed'), false);
  send('click', 0); // Keyboard/assistive activation remains supported.
  assert.deepEqual(moves, ['up', 'up']);
  button.disabled = true;
  send('pointerdown');
  assert.deepEqual(moves, ['up', 'up']);
  unbind();
});

test('theme migrates the legacy preference and shares it across games', () => {
  const values = new Map([['snake-theme', 'dark']]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.document = { documentElement: { dataset: {} } };
  const button = new EventTarget();
  button.setAttribute = (name, value) => { button[name] = value; };
  const changes = [];
  const theme = createTheme({ button, legacyStorage: createStorage('snake'), onChange: dark => changes.push(dark) });
  theme.apply();
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(values.get('browser-games-theme'), 'dark');
  button.dispatchEvent(new Event('click'));
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(button['aria-label'], 'Switch to dark mode');
  // The old Snake preference must not override the newer collection preference.
  const nextGame = createTheme({ legacyStorage: createStorage('snake') });
  nextGame.apply();
  assert.equal(document.documentElement.dataset.theme, 'light');
  theme.dispose();
  button.dispatchEvent(new Event('click'));
  assert.deepEqual(changes, [true, false]);
  delete globalThis.localStorage;
  delete globalThis.matchMedia;
  delete globalThis.document;
});

test('swipes reject taps, cancelled gestures, and unrelated pointers', () => {
  const element = new EventTarget();
  element.setPointerCapture = () => {};
  const directions = [];
  const unbind = bindSwipe(element, direction => directions.push(direction));
  function send(type, x, y, id = 1) {
    const event = new Event(type);
    Object.assign(event, { clientX: x, clientY: y, pointerId: id, isPrimary: true, pointerType: 'touch' });
    element.dispatchEvent(event);
  }
  send('pointerdown', 10, 10);
  send('pointerup', 15, 11); // Below the movement threshold.
  send('pointerdown', 10, 10);
  send('pointerup', 100, 10, 2); // Another finger must not resolve this swipe.
  send('pointerup', 10, 50);
  send('pointerdown', 50, 10);
  send('pointercancel', 50, 10);
  send('pointerup', 0, 10);
  send('pointerdown', 50, 10);
  send('pointerup', 0, 10);
  assert.deepEqual(directions, ['down', 'left']);
  send('pointerdown', 20, 60);
  send('pointermove', 20, 10, 2); // Unrelated pointer must not trigger a move.
  send('pointermove', 20, 55); // Small jitter is ignored.
  assert.deepEqual(directions, ['down', 'left']);
  send('pointermove', 20, 40); // Turn while the finger is still held.
  assert.deepEqual(directions, ['down', 'left', 'up']);
  send('pointermove', 100, 40); // One gesture cannot queue extra turns.
  send('pointerup', 100, 40);
  assert.deepEqual(directions, ['down', 'left', 'up']);
  unbind();
  send('pointerdown', 0, 0);
  send('pointerup', 100, 0);
  assert.deepEqual(directions, ['down', 'left', 'up']);
});

test('active-play clock excludes pause time and resets cleanly', () => {
  let now = 100;
  const clock = createClock(() => now);
  assert.equal(clock.value(), 0);
  clock.start();
  now = 1200;
  clock.start(); // Repeated start must not lose elapsed time.
  assert.equal(clock.value(), 1100);
  clock.pause();
  now = 5000;
  assert.equal(clock.value(), 1100);
  clock.start();
  now = 5900;
  assert.equal(clock.value(), 2000);
  clock.reset();
  assert.equal(clock.value(), 0);
  assert.equal(formatDuration(61000), '1:01');
});

test('storage isolates games, preserves old keys, and tolerates denied storage', () => {
  const values = new Map([['snake-best', '42']]);
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const snake = createStorage('snake');
  const sos = createStorage('sos');
  assert.equal(snake.number('best'), 42);
  assert.equal(sos.number('best'), 0);
  sos.set('best', 7);
  assert.equal(snake.number('best'), 42);
  values.set('snake-best', 'Infinity');
  assert.equal(snake.number('best'), 0);
  globalThis.localStorage = {
    getItem() { throw new Error('Access denied'); },
    setItem() { throw new Error('Access denied'); },
  };
  assert.equal(snake.get('theme', 'light'), 'light');
  assert.equal(snake.set('best', 100), false);
  delete globalThis.localStorage;
});

test('frame scheduler deduplicates, cancels, and can reschedule inside callback', () => {
  const queue = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = fn => { queue.set(++id, fn); return id; };
  globalThis.cancelAnimationFrame = id => queue.delete(id);
  const times = [];
  const scheduler = createFrameScheduler(time => { times.push(time); scheduler.request(); });
  scheduler.request();
  scheduler.request();
  assert.equal(queue.size, 1);
  const [firstId, fn] = [...queue.entries()][0];
  queue.delete(firstId);
  fn(123);
  assert.deepEqual(times, [123]);
  assert.equal(queue.size, 1);
  scheduler.cancel();
  assert.equal(queue.size, 0);
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
});
