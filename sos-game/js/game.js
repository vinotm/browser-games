import { createPageShell, createConfirmationDialog } from '../../shared/js/page-shell.js';
import { createGame, play, allowedLetters } from './rules.js';
import { measuredComputerMove } from './difficulty.js';
import { createRunAnalytics } from './analytics.js';
import { loadDeploymentConfig } from '../../shared/js/config.js';
import { describeDevice } from '../../shared/js/device.js';
import { enhanceSelect } from '../../shared/js/select.js';
import { createStorage } from '../../shared/js/storage.js';
import { limitName, setupNameInput } from './player-names.js';
import { createBoardSettings } from './board-settings.js';
import { createBoardNavigation } from '../../shared/js/board-navigation.js';

const $ = selector => document.querySelector(selector);
const analyticsConfig = loadDeploymentConfig(new URL('../analytics-config.json', import.meta.url));
let analytics = createRunAnalytics();
const settingsStorage = createStorage('sos');
let saved = {};
try {
  saved = JSON.parse(settingsStorage.get('settings', '{}')) || {};
  for (const id of ['mode', 'size', 'difficulty']) {
    const select = $(`#${id}`);
    const value = String(saved?.[id]);
    if ([...select.options].some(option => option.value === value)) select.value = value;
  }
  for (const [index, id] of ['name-one', 'name-two'].entries()) {
    if (typeof saved?.names?.[index] === 'string') $(`#${id}`).value = limitName(saved.names[index].trim()) || `P${index + 1}`;
  }
} catch { /* Invalid or unavailable storage leaves the built-in defaults intact. */ }
document.querySelectorAll('#setup select').forEach(enhanceSelect);
const boardSettings = createBoardSettings($('#size'), saved);
function configuredGame() { const { rows, columns } = boardSettings.dimensions(); return createGame(rows, columns); }
document.querySelectorAll('.name-input').forEach(input => setupNameInput(input, count => {
  const counter = $(`#${input.id}-count`);
  counter.textContent = `${count}/20`;
  counter.hidden = count < 12;
  $(`#${input.id}-warning`).hidden = count <= 20;
  input.closest('.name-field').classList.toggle('is-over-limit', count > 20);
}));
$('#setup').addEventListener('pointerdown', event => {
  if (event.target === event.currentTarget && document.activeElement?.matches('.name-input')) {
    document.activeElement.blur();
  }
});
document.querySelectorAll('.name-input').forEach(input => input.addEventListener('keydown', event => {
  if (event.key === 'Escape') input.blur();
}));
let state = configuredGame(), started = false, mode = $('#mode').value,
  difficulty = $('#difficulty').value, selected = null, thinking = false, requestId = 0;
let resultTimer;
let lastFilled = -1;
let playerNames = [$('#name-one').value, $('#name-two').value];
let computerReadyAt = 0;
let worker;
try {
  worker = new Worker(new URL('./opponent-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId || !thinking) return;
    deliverMove(data.id, data.move, data.stats);
  };
  worker.onerror = event => {
    event.preventDefault(); worker.terminate(); worker = null;
    if (thinking) {
      const { move, stats } = measuredComputerMove(state, difficulty);
      deliverMove(requestId, move, stats);
    }
  };
} catch { worker = null; }
const page = createPageShell({ homeUrl: '../', ready: false, isActive: () => started && !state.finished });
const newGameDialog = createConfirmationDialog({ id: 'new-game', title: 'Start a new game?',
  detail: 'Your current progress will be lost.', confirmLabel: 'New game' });
const isConfirming = () => page.isConfirming() || newGameDialog.isOpen() || boardSettings.isOpen();
$('#new-game').addEventListener('click', async () => {
  if (isConfirming()) return;
  if (started && !state.finished && !await newGameDialog.confirm()) {
    $('#new-game').focus({ preventScroll: true }); return;
  }
  showSetup();
});
function name(player) { return mode === 'computer' && player === 1 ? 'Computer' : playerNames[player]; }
function fitPlayerNames() {
  for (const label of document.querySelectorAll('.player-name')) {
    label.style.removeProperty('font-size');
    // Keep full Unicode names on at most two lines, without ellipsis.
    const text = document.createElement('span');
    text.textContent = label.textContent; text.style.display = 'block';
    // Short labels such as Computer should shrink onto one line, not split off a letter.
    const singleLine = [...text.textContent].length <= 10;
    if (singleLine) text.style.whiteSpace = 'nowrap';
    label.replaceChildren(text);
    let size = parseFloat(getComputedStyle(label).fontSize);
    while ((singleLine ? text.scrollWidth > label.clientWidth :
      text.getBoundingClientRect().height > 2 * parseFloat(getComputedStyle(label).lineHeight) + .5) && size > 8) {
      size -= .5; label.style.fontSize = `${size}px`;
    }
  }
}
const boardNavigation = createBoardNavigation({
  viewport: $('#board-viewport'), stage: $('#board-stage'), host: $('.game-screen'),
  geometry: () => {
    const cell = ($('#board-viewport').clientWidth - 8) / (Math.max(state.rows, state.columns) > 10 ? 10.5 : Math.max(state.rows, state.columns));
    return { width: cell * state.columns, height: cell * state.rows };
  },
  canExplore: () => started && !state.finished && !isConfirming(),
  onSelect: selectCell, onNavigate: () => closePicker(false),
});
function render() {
  $('#game-difficulty').hidden = !started || mode !== 'computer';
  $('#game-difficulty').textContent = difficulty[0].toUpperCase() + difficulty.slice(1);
  $('#new-game').disabled = !started;
  $('.board-actions').hidden = !started || state.finished;
  $('.scoreboard').classList.toggle('is-waiting', !started);
  $('.scoreboard').classList.toggle('is-playing', started && !state.finished);
  const letters = allowedLetters(state);
  for (const button of document.querySelectorAll('[data-letter]')) {
    button.disabled = !letters.includes(button.dataset.letter);
    button.setAttribute('aria-label', button.disabled ? `${button.dataset.letter} unavailable: two consecutive placements` : `Place ${button.dataset.letter}`);
  }
  const board = $('#board');
  board.style.setProperty('--size', state.columns);
  board.style.setProperty('--rows', state.rows);
  boardNavigation.layout();
  // Preserve placed glyphs across turn/status renders so their entrance finishes.
  if (board.children.length !== state.cells.length) {
    board.replaceChildren(...state.cells.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.index = index;
      // Pointer selection happens on release; keyboard/assistive clicks act here.
      button.addEventListener('click', event => { if (event.detail === 0) void boardNavigation.select(index); });
      return button;
    }));
  }
  state.cells.forEach((cell, index) => {
    const button = board.children[index];
    if (button.dataset.value !== cell) {
      button.dataset.value = cell;
      button.replaceChildren();
      if (cell) {
        const glyph = document.createElement('span');
        glyph.className = 'board-letter'; glyph.textContent = cell;
        button.append(glyph);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
          glyph.animate([{ transform: 'scale(.45)', opacity: .2 }, { transform: 'scale(1)', opacity: 1 }],
            { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
      }
    }
    button.setAttribute('aria-label', `Row ${Math.floor(index / state.columns) + 1}, column ${index % state.columns + 1}${cell ? `: ${cell}` : ': empty'}${index === lastFilled ? ', latest placement' : ''}`);
    button.disabled = !started || state.finished || thinking;
    button.tabIndex = cell ? -1 : 0;
    if (cell) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    button.classList.toggle('last', index === lastFilled);
    button.classList.toggle('letter-s', cell === 'S');
    button.classList.toggle('letter-o', cell === 'O');
  });
  const svg = $('#lines'); svg.setAttribute('viewBox', `0 0 ${state.columns} ${state.rows}`);
  if (!state.lines.length) svg.replaceChildren();
  const existing = new Set([...svg.children].map(line => line.dataset.key));
  let newLines = 0;
  for (const { indices, player } of state.lines) {
    const key = indices.join(',');
    if (existing.has(key)) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const first = indices[0], last = indices[2];
    for (const [key, value] of Object.entries({ x1: first % state.columns + .5, y1: Math.floor(first / state.columns) + .5, x2: last % state.columns + .5, y2: Math.floor(last / state.columns) + .5 })) line.setAttribute(key, value);
    line.dataset.key = key;
    line.classList.add(`player-${player}`);
    line.setAttribute('pathLength', '1');
    line.style.strokeDasharray = '1';
    svg.append(line);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      line.animate([{ strokeDashoffset: '1', opacity: 1 }, { strokeDashoffset: '0', opacity: 1, offset: .82 },
        { strokeDashoffset: '0', opacity: .9 }],
        { duration: 320, easing: 'cubic-bezier(.3,.1,.2,1)' });
    }
    newLines++;
  }
  for (let player = 0; player < 2; player++) {
    const streak = state.letterStreaks[player];
    const indicator = $(player ? '#streak-two' : '#streak-one');
    indicator.classList.toggle('is-empty', !streak.count);
    indicator.classList.toggle('is-full', streak.count === 2);
    indicator.classList.toggle('letter-s', streak.letter === 'S');
    indicator.classList.toggle('letter-o', streak.letter === 'O');
    indicator.replaceChildren(...[0, 1].map(index => {
      const cell = document.createElement('span');
      cell.className = `streak-cell${index < streak.count ? ' is-filled' : ''}`;
      cell.setAttribute('aria-hidden', 'true');
      cell.textContent = index < streak.count ? streak.letter : '';
      return cell;
    }));
    const description = `${name(player)}: ${streak.count ? `${streak.count} consecutive ${streak.letter}` : 'no letters placed'}${streak.count === 2 ? `; play ${streak.letter === 'S' ? 'O' : 'S'} next` : ''}`;
    indicator.setAttribute('aria-label', description);
    indicator.title = description;
    const label = $(player ? '#player-two' : '#player-one');
    label.textContent = name(player);
    label.title = name(player);
    label.closest('.player-side').classList.toggle('is-current', started && !state.finished && state.player === player);
    label.classList.toggle('current', started && !state.finished && state.player === player);
    if (started && !state.finished && state.player === player) label.setAttribute('aria-current', 'true');
    else label.removeAttribute('aria-current');
    const score = $(player ? '#score-two' : '#score-one');
    const previousScore = Number(score.textContent);
    score.textContent = state.scores[player];
    score.classList.toggle('current', started && !state.finished && state.player === player);
    if (state.scores[player] !== previousScore) score.getAnimations().forEach(animation => animation.cancel());
    if (state.scores[player] > previousScore && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      score.animate([{ transform: 'scale(1.32)', offset: 0 }, { transform: 'scale(.98)', offset: .72 },
        { transform: 'scale(1)', offset: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
  }
  fitPlayerNames();
  $('#status').textContent = !started ? '' : thinking ? 'Computer is thinking…' : `${name(state.player)}’s turn`;
  if (state.finished) {
    $('#status').textContent = state.cells.every(Boolean) ? 'Board complete' : 'Game complete';
    const [a, b] = state.scores;
    $('#result-title').textContent = a === b ? 'Draw!' : mode === 'computer' ? a > b ? 'You win!' : 'You lose!' : `${name(a > b ? 0 : 1)} wins!`;
    $('#result-score').textContent = `${a} – ${b}`;
    if (!resultTimer && $('#result').hidden) {
      // Let a final scoring strike finish before covering the board.
      resultTimer = setTimeout(() => {
        resultTimer = null; $('#result').hidden = false;
        if (!isConfirming()) $('#again').focus({ preventScroll: true });
      }, newLines && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 380 : 0);
    }
  }
  page.refresh();
}
function computerTurn(minimumDelay = 0) {
  if (!started || state.finished || mode !== 'computer' || state.player !== 1) return;
  thinking = true; render();
  computerReadyAt = performance.now() + Math.max(minimumDelay, 450 + Math.random() * 200);
  const id = ++requestId;
  if (worker) worker.postMessage({ id, state, difficulty });
  else setTimeout(() => {
    if (id !== requestId) return;
    const { move, stats } = measuredComputerMove(state, difficulty);
    deliverMove(id, move, stats);
  }, 60);
}
function deliverMove(id, move, stats) {
  if (id !== requestId || !thinking) return;
  const remaining = computerReadyAt - performance.now();
  if (remaining > 0) { setTimeout(() => deliverMove(id, move, stats), remaining); return; }
  if (isConfirming()) { setTimeout(() => deliverMove(id, move, stats), 100); return; }
  thinking = false;
  if (move) place(move.index, move.letter, stats);
}
function place(index, value, stats = null) {
  if (!started || thinking || isConfirming()) return;
  const next = play(state, index, value);
  if (!next) return;
  const gained = next.lines.length - state.lines.length;
  analytics.move(index, value, stats);
  if (next.finished) { analytics.finish('completed'); void analytics.flush({ force: true }); }
  const computerPlaced = mode === 'computer' && state.player === 1;
  state = next; lastFilled = index; render();
  if (computerPlaced) revealCell(index);
  if (gained && !state.finished) $('#status').textContent = `${name(state.player)} +${gained} · play again`;
  computerTurn(gained ? 700 : 0);
}
$('#start').addEventListener('click', () => {
  lastFilled = -1; requestId++; state = configuredGame(); mode = $('#mode').value; difficulty = $('#difficulty').value; state.player = Math.random() < .5 ? 0 : 1; started = true;
  playerNames = ['name-one', 'name-two'].map((id, index) => {
    const input = $(`#${id}`);
    input.value = limitName(input.value.trim()) || `P${index + 1}`;
    return input.value;
  });
  settingsStorage.set('settings', JSON.stringify({ mode, size: $('#size').value, difficulty, names: playerNames, ...boardSettings.preferences() }));
  analytics.start({ rows: state.rows, columns: state.columns, mode, difficulty, firstPlayer: state.player });
  analytics.visibility(!document.hidden);
  void analytics.flush();
  $('#setup').hidden = true; $('#result').hidden = true; render();
  boardNavigation.reset();
  computerTurn();
  if (!thinking) $('#board button:enabled')?.focus({ preventScroll: true });
});
function showSetup() {
  if (analytics.active) { analytics.finish('restarted'); void analytics.flush({ force: true }); }
  closePicker(false, true);
  clearTimeout(resultTimer); resultTimer = null;
  lastFilled = -1; started = false; thinking = false; requestId++; state = configuredGame();
  $('#result').hidden = true; $('#setup').hidden = false; boardNavigation.reset(); render(); $('#start').focus();
}
$('#again').addEventListener('click', showSetup);
const picker = $('#letter-picker');
let pickerAnimation, pickerRevision = 0;
function closePicker(restoreFocus = true, immediate = false) {
  const index = selected;
  selected = null;
  $('#board .selected')?.classList.remove('selected');
  if (restoreFocus && index !== null) $(`[data-index="${index}"]`)?.focus({ preventScroll: true });
  if (!picker.open) return;
  const revision = ++pickerRevision;
  const current = getComputedStyle(picker);
  const from = { opacity: current.opacity, transform: current.transform };
  pickerAnimation?.cancel();
  picker.inert = true;
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) { picker.close(); return; }
  pickerAnimation = picker.animate([from, { opacity: 0, transform: 'scale(.35)' }],
    { duration: 130, easing: 'ease-in', fill: 'both' });
  pickerAnimation.finished.then(() => {
    if (revision !== pickerRevision) return;
    picker.close(); pickerAnimation.cancel(); pickerAnimation = null;
  }).catch(() => {});
}
function positionPicker() {
  if (selected === null) return;
  const cell = $(`[data-index="${selected}"]`).getBoundingClientRect();
  const board = $('#board-viewport').getBoundingClientRect();
  const width = picker.offsetWidth, height = picker.offsetHeight;
  const left = Math.max(board.left + 4, Math.min(cell.left + cell.width / 2 - width / 2, board.right - width - 4));
  const preferredTop = cell.bottom + 5 + height <= board.bottom ? cell.bottom + 5 : cell.top - height - 5;
  const top = Math.max(board.top + 4, Math.min(preferredTop, board.bottom - height - 4));
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.style.transformOrigin = `${cell.left + cell.width / 2 - left}px ${cell.top + cell.height / 2 - top}px`;
}
function selectCell(index) {
  if (!started || state.finished || thinking || isConfirming()) return;
  if (state.cells[index]) { closePicker(false); return; }
  if (selected === index) { closePicker(false); return; }
  const previous = selected !== null && picker.open ? picker.getBoundingClientRect() : null;
  pickerRevision++; pickerAnimation?.cancel();
  $('#board .selected')?.classList.remove('selected');
  selected = index; $(`[data-index="${index}"]`).classList.add('selected');
  picker.inert = false;
  if (!picker.open) picker.show();
  positionPicker();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const next = picker.getBoundingClientRect();
    pickerAnimation = picker.animate([
      previous ? { opacity: 1, transform: `translate(${previous.left - next.left}px, ${previous.top - next.top}px)` }
        : { opacity: 0, transform: 'scale(.35)' },
      { opacity: 1, transform: 'none' },
    ], { duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  picker.querySelector('[data-letter]:enabled')?.focus({ preventScroll: true });
}
function commitLetter(value) {
  if (selected === null || !allowedLetters(state).includes(value) || isConfirming()) return;
  const index = selected; closePicker(false); place(index, value);
}
picker.addEventListener('click', event => {
  if (event.target.dataset.letter) commitLetter(event.target.dataset.letter);
});
// Board navigation handles pointer taps, drags and pinch gestures.
document.addEventListener('pointerdown', event => {
  if (selected === null || event.target.closest('#board, #letter-picker')) return;
  if (event.target.closest('button, a, input, select, label, [role="combobox"]')) return;
  closePicker(false);
});
document.addEventListener('keydown', event => {
  if (selected === null || isConfirming() || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape') { event.preventDefault(); closePicker(); }
  else if (['s', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault(); commitLetter(event.key.toUpperCase());
  }
});
function revealCell(index) {
  const viewport = $('#board-viewport'), cell = $(`[data-index="${index}"]`);
  const v = viewport.getBoundingClientRect(), r = cell.getBoundingClientRect();
  if (r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom) return;
  viewport.scrollTo({ left: viewport.scrollLeft + r.left - v.left + r.width / 2 - v.width / 2,
    top: viewport.scrollTop + r.top - v.top + r.height / 2 - v.height / 2,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
new ResizeObserver(positionPicker).observe($('#board-viewport'));
window.addEventListener('resize', positionPicker);
new ResizeObserver(fitPlayerNames).observe($('.scoreboard'));
window.addEventListener('scroll', positionPicker, { passive: true });
function updateModeFields() {
  const local = $('#mode').value === 'local';
  $('#difficulty-label').hidden = local; $('#difficulty-wrap').hidden = local;
  $('#name-two-label').hidden = !local; $('#name-two').hidden = !local;
  $('#name-two-field').hidden = !local;
}
$('#mode').addEventListener('change', updateModeFields);
updateModeFields();
render();

function reportProgress(options) { analytics.checkpoint(); void analytics.flush(options); }
setInterval(() => reportProgress(), 60000);
document.addEventListener('visibilitychange', () => {
  analytics.visibility(!document.hidden); reportProgress({ keepalive: document.hidden });
});
window.addEventListener('pagehide', () => { analytics.visibility(false); reportProgress({ keepalive: true }); });
window.addEventListener('pageshow', () => analytics.visibility(!document.hidden));
window.addEventListener('online', () => reportProgress({ force: true }));
const privacy = $('#privacy-view');
function closePrivacy() {
  privacy.hidden = true; $('#setup').hidden = false;
  $('#privacy-open').focus({ preventScroll: true });
}
$('#privacy-open').addEventListener('click', () => {
  $('#setup').hidden = true; privacy.hidden = false;
  $('#privacy-title').focus({ preventScroll: true });
});
$('#privacy-back').addEventListener('click', closePrivacy);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !privacy.hidden) closePrivacy(); });
// Resolve configuration before revealing Start so a quick start cannot lose its report.
const config = await analyticsConfig;
analytics = createRunAnalytics({ ...config, endpoint: config.analyticsEndpoint, device: describeDevice });
if (!analytics.enabled) {
  $('#privacy-intro').textContent = 'Analytics are disabled on this site.';
  $('#privacy-details').textContent = 'Your game and preferences stay in your browser.';
  $('#privacy-status').hidden = true;
}
void analytics.flush();
void page.reveal();
