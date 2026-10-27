import { createBoardNavigation } from '../../shared/js/board-navigation.js';
import { createRunAnalytics } from './analytics.js';
import { loadDeploymentConfig } from '../../shared/js/config.js';
import { describeDevice } from '../../shared/js/device.js';
import { createPageShell, createConfirmationDialog } from '../../shared/js/page-shell.js';
import { createClock, formatDuration } from '../../shared/js/clock.js';
import { createMemoryGame } from './engine.js';
import { enhanceSelect } from '../../shared/js/select.js';
import { setupBoardMenu } from './menu.js';
import { createShape } from './shapes.js';

const $ = selector => document.querySelector(selector);
const board = $('#board');
const clock = createClock();
const analyticsConfig = loadDeploymentConfig(new URL('../analytics-config.json', import.meta.url));
let analytics = createRunAnalytics();
let game = null;
let flips = 0, earlyCloses = 0;
let seen = new Set();
let started = false;
let finished = false;
let concealTimer;
let completionTimer;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const page = createPageShell({ homeUrl: '../', ready: false, isActive: () => started && !finished });
const restart = createConfirmationDialog({ id: 'restart', title: 'Start a new game?',
  detail: 'Your current progress will be lost.', confirmLabel: 'New game' });
const selection = setupBoardMenu();
enhanceSelect($('#board-size'));
let cards = [];
let dimensions = { rows: 4, columns: 4 };
const boardNavigation = createBoardNavigation({
  viewport: $('#board-viewport'), stage: board, host: $('.game-screen'),
  geometry: () => {
    const viewport = $('#board-viewport');
    const count = Math.max(dimensions.rows, dimensions.columns);
    const style = getComputedStyle(board);
    const padding = parseFloat(style.paddingLeft), gap = parseFloat(style.columnGap);
    const cell = (Math.min(viewport.clientWidth, viewport.clientHeight) - padding * 2 + gap) / (count > 10 ? 10.5 : count);
    return { width: cell * dimensions.columns - gap + padding * 2,
      height: cell * dimensions.rows - gap + padding * 2 };
  },
  canExplore: () => started && !finished && !page.isConfirming() && !restart.isOpen(),
  onSelect: flip, onNavigate: () => {},
});
function createCards(rows, columns) {
  cards.forEach(button => button.clearShape());
  board.replaceChildren();
  board.style.setProperty('--columns', columns);
  board.style.setProperty('--rows', rows);
  dimensions = { rows, columns };
  cards = Array.from({ length: rows * columns }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'card'; button.dataset.index = index;
  button.setAttribute('aria-label', `Card ${index + 1}, face down`);
  button.disabled = true;
  const flipper = document.createElement('span'); flipper.className = 'card-flipper';
  const back = document.createElement('span'); back.className = 'card-face card-back';
  const front = document.createElement('span'); front.className = 'card-face card-front';
  flipper.setAttribute('aria-hidden', 'true'); flipper.append(back, front); button.append(flipper);
  let discardTimer;
  button.showShape = shape => {
    clearTimeout(discardTimer);
    if (shape) {
      if (!front.firstElementChild) front.append(createShape(shape));
    } else if (front.firstElementChild) {
      // Keep the artwork only until the front rotates out of view.
      if (reducedMotion.matches) front.replaceChildren();
      else discardTimer = setTimeout(() => front.replaceChildren(), 140);
    }
  };
  button.clearShape = () => { clearTimeout(discardTimer); front.replaceChildren(); };
  // Only the position is captured here. No identity is bound to a card element.
  button.addEventListener('click', event => { if (event.detail === 0) void boardNavigation.select(index); });
  board.append(button);
  return button;
  });
  boardNavigation.reset();
}
createCards(4, 4);

function render() {
  const view = game.view();
  $('#moves').textContent = view.moves;
  view.cards.forEach(({ index, shape, matched, blocked }) => {
    const button = cards[index];
    const open = shape !== null;
    button.showShape(shape);
    button.classList.toggle('is-open', open);
    button.classList.toggle('is-matched', matched);
    button.classList.toggle('is-blocked', blocked);
    button.setAttribute('aria-label', blocked ? 'Blocked cell' : `Card ${index + 1}, ${matched ? 'matched ' : ''}${shape?.replaceAll(':', ' ') ?? 'face down'}`);
    button.setAttribute('aria-disabled', String(open || finished));
    button.disabled = blocked; // Keep every playable position reachable by keyboard.
  });
  boardNavigation.update();
}
function start() {
  clearTimeout(concealTimer); clearTimeout(completionTimer);
  cards.forEach(button => { button.clearShape(); button.classList.remove('is-open', 'is-matched'); });
  board.classList.remove('won');
  const selectedSize = selection.value();
  createCards(selectedSize.rows, selectedSize.columns);
  game = createMemoryGame(Math.random, selectedSize); started = true; finished = false;
  flips = 0; earlyCloses = 0; seen = new Set();
  clock.reset(); clock.start();
  analytics.start(game.view()); analytics.visibility(!document.hidden); void analytics.flush();
  $('#start-view').hidden = true; $('#result').hidden = true;
  $('#new-game').disabled = false;
  $('#status').textContent = 'Find matching pairs.';
  render(); updateTime(); page.refresh(); cards.find(card => !card.disabled)?.focus({ preventScroll: true });
}
function flip(index) {
  if (!started || finished || page.isConfirming() || restart.isOpen() || !$('#privacy-view').hidden) return;
  const previous = game.view();
  if (!game.flip(index)) return;
  flips++; seen.add(index); if (previous.pending) earlyCloses++;
  clearTimeout(concealTimer);
  const view = game.view();
  render();
  $('#status').textContent = view.pairs > previous.pairs
    ? `Pair found. ${view.pairs} of ${view.totalPairs} pairs.` : `Card ${index + 1}, ${view.cards[index].shape}.`;
  if (view.complete) {
    finished = true; clock.pause(); updateTime(); page.refresh();
    analytics.finish('completed', reportProgress()); void analytics.flush({ force: true });
    $('#result-time').textContent = `Time ${formatDuration(clock.value(), { padMinutes: true })}`;
    $('#result-moves').textContent = `Moves ${view.moves}`;
    $('#status').textContent = `Game Completed! ${$('#result-time').textContent}. ${$('#result-moves').textContent}.`;
    board.classList.add('won');
    completionTimer = setTimeout(() => {
      $('#result').hidden = false; $('#result').focus({ preventScroll: true });
    }, reducedMotion.matches ? 0 : 720);
    render();
  } else if (view.pending) {
    concealTimer = setTimeout(() => {
      game.conceal(); render(); $('#status').textContent = 'Cards turned face down.';
    }, 750);
  }
}
function dismissCompletion(event) {
  if ($('#result').hidden) return;
  event.preventDefault(); event.stopImmediatePropagation();
  $('#result').hidden = true; $('#new-game').focus({ preventScroll: true });
}
document.addEventListener('click', dismissCompletion, true);
document.addEventListener('keydown', event => {
  if (['Escape', 'Enter', ' '].includes(event.key)) dismissCompletion(event);
}, true);
function updateTime() { $('#timer').textContent = formatDuration(clock.value()); }
// Like Sudoku, elapsed time continues during confirmations and hidden-tab thinking.
setInterval(() => { if (started && !finished) updateTime(); }, 250);
$('#start').addEventListener('click', start);
$('#new-game').addEventListener('click', async () => {
  if (restart.isOpen() || page.isConfirming()) return;
  if (!finished && !await restart.confirm()) return;
  if (analytics.active) { analytics.finish('restarted', reportProgress()); void analytics.flush({ force: true }); }
  started = false; finished = false; clock.reset(); updateTime();
  clearTimeout(concealTimer); clearTimeout(completionTimer);
  $('#result').hidden = true; $('#start-view').hidden = false;
  $('#new-game').disabled = true; board.classList.remove('won');
  createCards(4, 4); $('#moves').textContent = '0'; page.refresh();
});
$('#privacy-open').addEventListener('click', () => {
  $('#start-view').hidden = true; $('#privacy-view').hidden = false; $('#privacy-title').focus();
});
function closePrivacy() {
  $('#privacy-view').hidden = true; $('#start-view').hidden = false; $('#privacy-open').focus();
}
$('#privacy-back').addEventListener('click', closePrivacy);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#privacy-view').hidden) closePrivacy();
});
function reportProgress() {
  const view = game?.view();
  return { elapsed_ms: Math.round(clock.value()), moves: view?.moves ?? 0,
    pairs_found: view?.pairs ?? 0, flips, mismatches: (view?.moves ?? 0) - (view?.pairs ?? 0),
    unique_positions: seen.size, early_closes: earlyCloses };
}
function report(options = {}) { analytics.checkpoint(reportProgress()); void analytics.flush(options); }
setInterval(() => report(), 15000);
document.addEventListener('visibilitychange', () => {
  analytics.visibility(!document.hidden); report({ keepalive: document.hidden });
});
window.addEventListener('pagehide', () => { analytics.visibility(false); report({ keepalive: true }); });
window.addEventListener('pageshow', () => analytics.visibility(!document.hidden));
window.addEventListener('online', () => { void analytics.flush({ force: true }); });
const config = await analyticsConfig;
analytics = createRunAnalytics({ ...config, endpoint: config.analyticsEndpoint, device: describeDevice });
if (analytics.enabled) {
  $('#privacy-intro').textContent = 'This game sends anonymous play reports for game improvement.';
  $('#privacy-details').hidden = false; $('#privacy-local').hidden = true;
}
void analytics.flush();
void page.reveal();
