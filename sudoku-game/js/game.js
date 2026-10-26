import { tutorialPages } from './tutorial.js';
import { formatDuration } from '../../shared/js/clock.js';
import { createScreenAwake } from '../../shared/js/screen-awake.js';
import { createRunAnalytics } from './analytics.js';
import { loadDeploymentConfig } from '../../shared/js/config.js';
import { describeDevice } from '../../shared/js/device.js';
import { createPuzzleClient } from './puzzle-client.js';
import { createPageShell } from '../../shared/js/page-shell.js';
import { createStorage } from '../../shared/js/storage.js';
import { conflicts, solve, enteredValue } from './puzzle.js';
const analyticsConfig = loadDeploymentConfig(new URL('../analytics-config.json', import.meta.url));
let analytics = createRunAnalytics();
const grid = document.querySelector('.grid');
const status = document.querySelector('#status');
const dialog = document.querySelector('#confirm');
const solveButton = document.querySelector('#solve');
const newButton = document.querySelector('#new');
const checkToggle = document.querySelector('#check-conflicts');
const manualToggle = document.querySelector('#manual-mode');
let manualMode = false, pendingManual = false;
const checksActive = () => checkEnabled && !manualMode;
const completion = document.querySelector('#completion');
const menu = document.querySelector('#game-menu');
const menuToggle = document.querySelector('#menu-toggle');
function closeMenu() { menuToggle.setAttribute('aria-expanded', 'false'); menu.classList.remove('open'); menu.inert = true; }
menuToggle.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') !== 'true';
  closeCheckpoint();
  menuToggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('open', open); menu.inert = !open;
});
const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const saveButton = document.querySelector('#save'), loadButton = document.querySelector('#load');
saveButton.innerHTML = icon('<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>');
loadButton.innerHTML = icon('<path d="M4 9V4m0 5h5M4 9a8 8 0 1 1-1 7"/>');
const undoButton = document.querySelector('#undo'), redoButton = document.querySelector('#redo');
undoButton.innerHTML = icon('<path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" transform="translate(0 -2)"/>');
redoButton.innerHTML = icon('<path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>');
let undoHistory = [], redoHistory = [];
function snapshot() { return { board: [...board], notes: notes.map(values => [...values]) }; }
function recordChange(previous) {
  if (manualMode || JSON.stringify(previous) === JSON.stringify(snapshot())) return;
  undoHistory.push(previous); redoHistory = [];
}
function historyMove(redo = false) {
  if (page.isConfirming() || manualMode || !started || busy || finished || dialog.open || !checkpointPanel.hidden || !completion.hidden) return;
  const from = redo ? redoHistory : undoHistory, to = redo ? undoHistory : redoHistory;
  if (!from.length) return;
  to.push(snapshot()); const state = from.pop();
  board = [...state.board]; notes = state.notes.map(values => [...values]);
  analytics.count(redo ? 'redos' : 'undos'); trackProgress();
  closeMenu(); render(); status.textContent = redo ? 'Move redone' : 'Move undone';
}
undoButton.addEventListener('click', () => historyMove());
redoButton.addEventListener('click', () => historyMove(true));
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  event.preventDefault(); historyMove(key === 'y' || event.shiftKey);
});
const checkpointPanel = document.querySelector('#checkpoint-confirm');
let notes = Array.from({ length: 81 }, () => []), pencil = false, checkpoint = null, checkpointAction;
const checkpointFeedback = document.querySelector('#checkpoint-feedback');
let checkpointFeedbackTimer;
function showCheckpointFeedback(message) {
  clearTimeout(checkpointFeedbackTimer);
  checkpointFeedback.textContent = message;
  checkpointFeedback.classList.remove('visible');
  void checkpointFeedback.offsetWidth;
  checkpointFeedback.classList.add('visible');
  checkpointFeedbackTimer = setTimeout(() => checkpointFeedback.classList.remove('visible'), 1500);
}
function closeCheckpoint() { checkpointPanel.hidden = true; }
function checkpointRequest(action) {
  if (page.isConfirming() || manualMode || !started || busy || finished || (action === 'load' && !checkpoint)) return;
  closeMenu();
  clearTimeout(checkpointFeedbackTimer);
  checkpointFeedback.classList.remove('visible');
  if (action === 'save' && !checkpoint) { saveCheckpoint(); return; }
  checkpointAction = action;
  document.querySelector('#checkpoint-title').textContent = action === 'save' ? 'Overwrite existing checkpoint?' : 'Restore saved checkpoint?';
  document.querySelector('#checkpoint-detail').hidden = action !== 'load';
  document.querySelector('#checkpoint-accept').textContent = action === 'save' ? 'Overwrite' : 'Restore';
  checkpointPanel.hidden = false;
}
function saveCheckpoint() {
  if (manualMode) return;
  checkpoint = { board: [...board], notes: notes.map(values => [...values]) };
  analytics.count('checkpoint_saves');
  status.textContent = 'Checkpoint saved';
  showCheckpointFeedback('Checkpoint saved');
  saveButton.classList.remove('saved'); void saveButton.offsetWidth; saveButton.classList.add('saved');
  setTimeout(() => saveButton.classList.remove('saved'), 450); render();
}
saveButton.addEventListener('animationend', () => saveButton.classList.remove('saved'));
saveButton.addEventListener('click', () => checkpointRequest('save'));
loadButton.addEventListener('click', () => checkpointRequest('load'));
document.querySelector('#checkpoint-cancel').addEventListener('click', closeCheckpoint);
document.querySelector('#checkpoint-accept').addEventListener('click', () => {
  if (manualMode) { closeCheckpoint(); return; }
  if (checkpointAction === 'save') saveCheckpoint();
  else { const previous = snapshot(); board = [...checkpoint.board]; notes = checkpoint.notes.map(values => [...values]); recordChange(previous); analytics.count('checkpoint_restores'); trackProgress(); render(); status.textContent = 'Checkpoint restored'; showCheckpointFeedback('Checkpoint restored'); }
  closeCheckpoint();
});
let completionTimeout;
let pendingAction = 'solve';
const preferences = createStorage('sudoku');
let checkEnabled = preferences.get('check-conflicts', 'true') !== 'false';
let pendingCheck = checkEnabled;
function applyConflictPreference() {
  checkEnabled = pendingCheck;
  preferences.set('check-conflicts', checkEnabled);
}
checkToggle.addEventListener('change', () => {
  if (manualMode) { render(); return; }
  pendingCheck = checkToggle.checked;
  if (!started || finished) {
    applyConflictPreference();
    render();
    return;
  }
  checkToggle.checked = checkEnabled;
  confirmAction('checks');
});
manualToggle.addEventListener('change', () => {
  if (busy) { render(); return; }
  pendingManual = manualToggle.checked;
  manualToggle.checked = manualMode;
  confirmAction('manual');
});
function applyManualMode() {
  manualMode = pendingManual;
  undoHistory = []; redoHistory = []; checkpoint = null;
  matchSource = -1;
  closeCheckpoint();
  clearTimeout(checkpointFeedbackTimer); checkpointFeedback.classList.remove('visible');
  // Preserve the conflict-check preference; Manual mode only temporarily suppresses it.
  render();
}
let clues = Array(81).fill(0), board = [...clues], selected = -1, matchSource = -1, busy = false, finished = false, started = false, startedAt = 0, elapsed = 0;
const page = createPageShell({ tutorial: { host: document.querySelector('.game-screen'), pages: tutorialPages }, homeUrl: '../', ready: false, isActive: () => started && !finished });
const screenAwake = createScreenAwake();
for (const event of ['pointerdown', 'keydown']) document.addEventListener(event, () => screenAwake.activity(), { passive: true });
const noteLayer = document.createElement('div');
noteLayer.className = 'note-layer';
document.querySelector('.game-screen').append(noteLayer);
const noteCells = Array.from({ length: 81 }, () => { const el = document.createElement('div'); el.className = 'cell-notes'; noteLayer.append(el); return el; });
const cells = Array.from({ length: 81 }, (_, i) => {
  const cell = document.createElement('input');
  cell.className = 'cell';
  cell.type = 'text'; cell.inputMode = 'none'; cell.autocomplete = 'off';
  cell.maxLength = 1;
  cell.setAttribute('aria-label', `Row ${Math.floor(i / 9) + 1}, column ${i % 9 + 1}`);
  function selectCell() {
    matchSource = started && !busy && !finished ? i : -1;
    selected = matchSource >= 0 && !clues[i] ? i : -1;
    render();
  }
  cell.addEventListener('focus', selectCell);
  cell.addEventListener('click', selectCell);
  cell.addEventListener('input', () => enter(Number(cell.value.replace(/[^1-9]/g, '').slice(-1))));
  cell.addEventListener('keydown', event => {
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key)); }
    else if (['Backspace', 'Delete', '0'].includes(event.key)) { event.preventDefault(); enter(0); }
    else {
      const offsets = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 };
      if (event.key in offsets) {
        event.preventDefault(); cells[Math.max(0, Math.min(80, i + offsets[event.key]))].focus();
      }
    }
  });
  grid.append(cell); return cell;
});
document.addEventListener('pointerdown', event => {
  if (!event.target.closest('.menu-anchor')) closeMenu();
  if (!event.target.closest('.checkpoint-tools, .checkpoint-confirm')) closeCheckpoint();
  // Game controls preserve the selected cell.
  if (page.isConfirming() || dialog.open || grid.contains(event.target) ||
      event.target.closest('.number-pad, #theme, .toolbar, .page-home, .leave-dialog')) return;
  if (selected < 0 && matchSource < 0) return;
  selected = -1; matchSource = -1;
  if (grid.contains(document.activeElement)) document.activeElement.blur();
  render();
});
function updateTimer() {
  const ms = started && !finished && !busy ? performance.now() - startedAt + elapsed : elapsed;
  document.querySelector('#timer').textContent = formatDuration(ms);
}
setInterval(updateTimer, 250);
const keys = Array.from({ length: 11 }, (_, i) => {
  const button = document.createElement('button');
  const n = i >= 9 ? 0 : i + 1;
  button.type = 'button'; button.textContent = n || '';
  if (i === 9) button.innerHTML = icon('<path d="M9 5h13v14H9l-7-7 7-7Z"/><path d="m12 9 6 6m0-6-6 6"/>');
  if (i === 10) { button.className = 'pencil'; button.innerHTML = icon('<path d="m16 3 5 5-12 12-6 1 1-6L16 3Z"/><path d="m13 6 5 5"/>'); }
  if (n) {
    const dots = document.createElement('span');
    dots.className = 'digit-progress'; dots.hidden = true; dots.setAttribute('aria-hidden', 'true');
    dots.append(...Array.from({ length: 9 }, () => {
      const dot = document.createElement('span'); dot.className = 'digit-dot'; return dot;
    }));
    button.append(dots);
  }
  if (i === 9) button.className = 'erase';
  button.addEventListener('click', () => i === 10 ? togglePencil() : enter(n));
  document.querySelector('.number-pad').append(button);
  return button;
});
function render(active = -1) {
  page.refresh();
  screenAwake.setActive(started && !finished && !busy);
  const difficultyLabel = document.querySelector('#difficulty-label');
  const level = puzzleDelivery?.requestedDifficulty;
  difficultyLabel.textContent = started && level ? level[0].toUpperCase() + level.slice(1) : '';
  const invalid = conflicts(board);
  const matchingDigit = !manualMode && started && !busy && matchSource >= 0 ? board[matchSource] : 0;
  cells.forEach((cell, i) => {
    cell.value = started ? board[i] || '' : '';
    noteCells[i].replaceChildren(...Array.from({length: 9}, (_, n) => { const span = document.createElement('span'); span.textContent = started && !board[i] && notes[i].includes(n + 1) ? n + 1 : ''; return span; }));
    cell.readOnly = !started || busy || finished || Boolean(clues[i]);
    cell.tabIndex = started ? 0 : -1;
    cell.classList.toggle('given', started && Boolean(clues[i]));
    cell.classList.toggle('matching', Boolean(matchingDigit) && board[i] === matchingDigit && i !== selected);
    cell.classList.toggle('selected', i === selected);
    cell.classList.toggle('invalid', checksActive() && invalid[i]);
    cell.classList.toggle('current', i === active);
    cell.setAttribute('aria-invalid', String(checksActive() && invalid[i]));
  });
  keys.forEach((key, i) => {
    const digit = i + 1;
    const positions = board.flatMap((n, index) => n === digit ? [index] : []);
    const complete = digit <= 9 && positions.length === 9 && positions.every(index => !invalid[index]);
    const dots = key.querySelector('.digit-progress');
    const count = Math.min(9, positions.length);
    if (dots) {
      dots.hidden = manualMode || !started;
      [...dots.children].forEach((dot, index) => dot.classList.toggle('filled', index < count));
    }
    key.classList.toggle('complete', complete);
    key.setAttribute('aria-label', i === 10 ? 'Pencil notes (P)' : i === 9 ? 'Delete' : `${digit}${started && !manualMode ? `, ${count} of 9 placed` : ''}${complete ? ', complete' : ''}`);
    if (i === 10) { key.classList.toggle('active', pencil); key.setAttribute('aria-pressed', String(pencil)); }
    key.disabled = !started || busy || finished || complete;
  });
  undoButton.disabled = manualMode || !started || busy || finished || !undoHistory.length;
  redoButton.disabled = manualMode || !started || busy || finished || !redoHistory.length;
  saveButton.disabled = manualMode || !started || busy || finished;
  loadButton.disabled = manualMode || !checkpoint || !started || busy || finished;
  checkToggle.disabled = busy || manualMode;
  checkToggle.checked = checksActive();
  menuToggle.disabled = busy;
  manualToggle.disabled = busy; manualToggle.checked = manualMode;
  document.querySelector('#manual-label').hidden = !manualMode;
  solveButton.disabled = !started || busy || finished; newButton.disabled = !started || busy;
  updateTimer();
}
function togglePencil() { if (!started || busy || finished) return; pencil = !pencil; analytics.count('pencil_toggles'); render(); }
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') { closeMenu(); closeCheckpoint(); return; }
  if (page.isConfirming() || dialog.open || !checkpointPanel.hidden || !completion.hidden) return;
  const action = { p: togglePencil, s: () => checkpointRequest('save'), l: () => checkpointRequest('load') }[event.key.toLowerCase()];
  if (action) { event.preventDefault(); action(); }
});
function enter(n) {
  if (page.isConfirming() || dialog.open || !checkpointPanel.hidden || !started || busy || finished || selected < 0 || clues[selected]) { render(); return; }
  const previous = snapshot();
  if (pencil && n) {
    if (!board[selected]) { const values = notes[selected]; notes[selected] = values.includes(n) ? values.filter(value => value !== n) : [...values, n].sort(); }
    if (JSON.stringify(previous) !== JSON.stringify(snapshot())) analytics.count('note_edits');
    recordChange(previous); render(); return;
  }
  notes[selected] = [];
  board[selected] = enteredValue(board, selected, n, checksActive());
  if (JSON.stringify(previous) !== JSON.stringify(snapshot())) {
    analytics.count(board[selected] ? 'entries' : 'erases');
    if (n && checksActive() && conflicts(board)[selected]) analytics.count('conflict_entries');
  }
  recordChange(previous); trackProgress();
  const invalid = conflicts(board).some(Boolean);
  const complete = board.every(Boolean) && !invalid;
  if (complete) elapsed += performance.now() - startedAt;
  finished = complete;
  status.textContent = finished ? 'Puzzle complete!' : '';
  grid.classList.toggle('won', finished);
  render();
  if (finished) { analytics.finish('completed', analyticsProgress()); analytics.flush({ force: true }); showCompletion(false); }
}
function showCompletion(revealed) {
  clearTimeout(completionTimeout);
  const time = formatDuration(elapsed, { padMinutes: true });
  document.querySelector('#completion-title').textContent = revealed ? 'Puzzle solved' : 'Puzzle Completed!';
  document.querySelector('#completion-detail').textContent = revealed ? 'Solution revealed' : `Time ${time}`;
  grid.classList.toggle('won', !revealed);
  const delay = revealed || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 720;
  completionTimeout = setTimeout(() => { completion.hidden = false; }, delay);
}
function dismissCompletion(event) {
  if (completion.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  completion.hidden = true;
}
document.addEventListener('click', dismissCompletion, true);
document.addEventListener('keydown', event => {
  if (['Escape', 'Enter', ' '].includes(event.key)) dismissCompletion(event);
}, true);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const puzzleClient = createPuzzleClient();
puzzleClient.setVisible(!document.hidden);
puzzleClient.warmup();
let requestedDifficulty = 'easy', chosenDifficulty = null, puzzleDelivery = null;
const difficultyPlay = document.querySelector('#difficulty-play');
const difficultyScreen = document.querySelector('#difficulty-screen');
const boardLoader = document.querySelector('#board-loading');
function chooseDifficulty(reason = 'restarted') {
  if (busy) return;
  if (analytics.active) { analytics.finish(reason, analyticsProgress()); analytics.flush({ force: true }); }
  started = false; finished = false; elapsed = 0;
  selected = -1; matchSource = -1; puzzleDelivery = null;
  clues = Array(81).fill(0); board = [...clues];
  notes = Array.from({length:81}, () => []); checkpoint = null; pencil = false;
  undoHistory = []; redoHistory = [];
  clearTimeout(completionTimeout); completion.hidden = true;
  clearTimeout(checkpointFeedbackTimer); checkpointFeedback.classList.remove('visible');
  closeMenu(); closeCheckpoint();
  privacy.hidden = true; document.querySelector('#start-screen').hidden = true;
  boardLoader.hidden = true; document.querySelector('.game-screen').classList.remove('awaiting-puzzle');
  grid.classList.remove('won'); grid.removeAttribute('aria-busy'); status.textContent = '';
  chosenDifficulty = null; difficultyPlay.hidden = true;
  difficultyScreen.querySelectorAll('[data-level]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  difficultyScreen.hidden = false; render();
  difficultyScreen.querySelector(`[data-level="${requestedDifficulty}"]`).focus({ preventScroll: true });
}
document.querySelectorAll('#difficulty-start [data-level]').forEach(button => button.addEventListener('click', () => {
  chosenDifficulty = button.dataset.level;
  difficultyScreen.querySelectorAll('[data-level]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  difficultyPlay.hidden = false;
}));
difficultyPlay.addEventListener('click', () => {
  if (!chosenDifficulty || busy || difficultyScreen.hidden) return;
  requestedDifficulty = chosenDifficulty; newPuzzle();
});
async function newPuzzle(autoStart = true, reason = 'restarted') {
  if (busy) return;
  if (analytics.active) { analytics.finish(reason, analyticsProgress()); analytics.flush({ force: true }); }
  busy = true; started = false; elapsed = 0;
  difficultyScreen.hidden = true;
  clearTimeout(completionTimeout); completion.hidden = true;
  privacy.hidden = true; document.querySelector('#start-screen').hidden = true;
  clearTimeout(checkpointFeedbackTimer); checkpointFeedback.classList.remove('visible');
  closeMenu(); closeCheckpoint();
  const screen = document.querySelector('.game-screen');
  screen.classList.add('awaiting-puzzle'); grid.setAttribute('aria-busy', 'true');
  boardLoader.classList.remove('is-leaving'); boardLoader.hidden = false;
  boardLoader.querySelector('p').textContent = 'Loading Sudoku…';
  document.querySelector('#puzzle-retry').hidden = true;
  render();
  const loadingDeadline = performance.now() + 500 + Math.random() * 500;
  try {
    puzzleDelivery = await puzzleClient.take(requestedDifficulty);
    await wait(Math.max(0, loadingDeadline - performance.now()));
    boardLoader.classList.add('is-leaving');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await wait(180);
    clues = [...puzzleDelivery.puzzle]; board = [...clues];
    undoHistory = []; redoHistory = [];
    notes = Array.from({length:81}, () => []); checkpoint = null; pencil = false;
    selected = -1; matchSource = -1; finished = false; elapsed = 0; status.textContent = '';
    grid.classList.remove('won');
    boardLoader.hidden = true; screen.classList.remove('awaiting-puzzle');
    grid.removeAttribute('aria-busy'); busy = false;
    if (autoStart) startGame(); else { document.querySelector('#start-screen').hidden = false; render(); }
  } catch (error) {
    boardLoader.classList.remove('is-leaving'); boardLoader.hidden = false;
    boardLoader.querySelector('p').textContent = 'Could not load a puzzle. Please try again.';
    document.querySelector('#puzzle-retry').hidden = false;
    grid.removeAttribute('aria-busy'); busy = false; render();
    console.error(error);
  }
}
document.querySelector('#puzzle-retry').addEventListener('click', () => newPuzzle());
function startGame() {
  if (started || busy) return;
  analytics.start(clues, checksActive(), manualMode, puzzleDelivery);
  analytics.visibility(!document.hidden);
  analytics.flush();
  started = true; startedAt = performance.now();
  document.querySelector('#start-screen').hidden = true; render();
}
document.querySelector('#start').addEventListener('click', () => chooseDifficulty());
function confirmAction(action) {
  closeMenu(); closeCheckpoint();
  pendingAction = action;
  const completedNew = action === 'new' && finished;
  const activeGame = started && !finished;
  document.querySelector('#confirm-consequence').hidden = true;
  document.querySelector('#confirm-features').hidden = true;
  dialog.classList.toggle('completed-new', completedNew);
  dialog.classList.toggle('new-puzzle', (action === 'new' && !finished) || action === 'checks' || action === 'manual');
  document.querySelector('#cancel').textContent = completedNew ? 'Cancel' : 'Keep playing';
  document.querySelector('#confirm-detail').hidden = completedNew;
  if (completedNew) {
    document.querySelector('#confirm-title').textContent = 'Start a new game?';
    document.querySelector('#confirm-solve').textContent = 'New Game';
    dialog.showModal();
    return;
  }
  if (action === 'manual') {
    document.querySelector('#confirm-title').textContent = pendingManual ? 'Enable manual mode?' : 'Disable manual mode?';
    document.querySelector('#confirm-detail').textContent = pendingManual ? 'Your tools in manual mode:' : 'Your tools in standard mode:';
    const features = document.querySelector('#confirm-features');
    features.hidden = false;
    features.replaceChildren(...[
      ['Pencil notes', true],
      ['Undo / redo', !pendingManual],
      ['Checkpoints (save / restore)', !pendingManual],
      ['Conflict checks', !pendingManual && checkEnabled],
      ['Matching-number highlights', !pendingManual],
      ['Digit progress dots', !pendingManual],
    ].map(([label, enabled]) => {
      const item = document.createElement('li');
      const marker = document.createElement('span');
      marker.className = enabled ? 'feature-on' : 'feature-off';
      marker.innerHTML = icon(enabled ? '<path d="m5 12 4 4L19 6"/>' : '<path d="m6 6 12 12M18 6 6 18"/>');
      const text = document.createElement('span'); text.textContent = label;
      const state = document.createElement('span'); state.className = 'sr-only'; state.textContent = enabled ? ': enabled' : ': disabled';
      item.append(marker, text, state);
      return item;
    }));
    const consequence = document.querySelector('#confirm-consequence');
    consequence.hidden = !activeGame;
    consequence.textContent = 'This starts a new puzzle.\nYour current progress will be lost.';
    document.querySelector('#cancel').textContent = activeGame ? 'Keep playing' : 'Cancel';
    document.querySelector('#confirm-solve').textContent = pendingManual ? 'Enable' : 'Disable';
    dialog.showModal();
    return;
  }
  if (action === 'checks') {
    document.querySelector('#confirm-title').textContent = `Turn conflict checks ${pendingCheck ? 'on' : 'off'}?`;
    document.querySelector('#confirm-detail').textContent = 'This starts a new puzzle. Your current progress will be lost.';
    document.querySelector('#confirm-solve').textContent = 'Start new puzzle';
    dialog.showModal();
    return;
  }
  document.querySelector('#confirm-title').textContent = action === 'new' ? 'Start a new puzzle?' : 'Solve this puzzle?';
  document.querySelector('#confirm-detail').textContent = action === 'new' ? 'Your current progress will be lost.' : 'This will reveal the solution and replace your answers.';
  document.querySelector('#confirm-solve').textContent = action === 'new' ? 'New puzzle' : 'Solve puzzle';
  dialog.showModal();
}
newButton.addEventListener('click', () => confirmAction('new'));
solveButton.addEventListener('click', () => confirmAction('solve'));
function dismissConfirmation() { dialog.close(); }
document.querySelector('#cancel').addEventListener('click', dismissConfirmation);
document.querySelector('#confirm-close').addEventListener('click', dismissConfirmation);
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  dismissConfirmation();
});
function outsideDialog(event) {
  const bounds = dialog.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right ||
    event.clientY < bounds.top || event.clientY > bounds.bottom;
}
let pressedOutside = false;
dialog.addEventListener('pointerdown', event => { pressedOutside = outsideDialog(event); });
dialog.addEventListener('click', event => {
  if (pressedOutside && event.target === dialog && outsideDialog(event)) dismissConfirmation();
  pressedOutside = false;
});
document.querySelector('#confirm-solve').addEventListener('click', async () => {
  dialog.close();
  if (pendingAction === 'manual') {
    const restart = started && !finished;
    applyManualMode();
    if (restart) chooseDifficulty('settings_changed');
    return;
  }
  if (pendingAction === 'checks') { applyConflictPreference(); chooseDifficulty('settings_changed'); return; }
  if (pendingAction === 'new') { chooseDifficulty(); return; }
  analytics.finish('solver_revealed', analyticsProgress()); analytics.flush({ force: true });
  elapsed += performance.now() - startedAt; busy = true; selected = -1; matchSource = -1; board = [...clues]; notes = Array.from({length:81}, () => []);
  status.textContent = ''; grid.setAttribute('aria-busy', 'true'); render();
  const solver = solve(board), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let result;
  try {
    do {
      result = solver.next(); render(result.done || reduced ? -1 : result.value);
      if (!result.done) await new Promise(resolve => setTimeout(resolve, reduced ? 0 : 55));
    } while (!result.done);
    finished = Boolean(result.value);
    status.textContent = finished ? '' : 'No solution';
  } finally { busy = false; grid.removeAttribute('aria-busy'); render(); }
  if (finished) showCompletion(true);
});
function analyticsProgress() {
  return { filled: board?.filter((value, i) => value && !clues[i]).length ?? 0,
    elapsed_ms: Math.round(elapsed + (started && !finished && !busy ? performance.now() - startedAt : 0)) };
}
function trackProgress() { analytics.progress(analyticsProgress().filled); }
function reportProgress(options) {
  analytics.checkpoint(analyticsProgress()); analytics.flush(options);
}
setInterval(() => reportProgress(), 60000);
document.addEventListener('visibilitychange', () => {
  screenAwake.setVisible(!document.hidden);
  analytics.visibility(!document.hidden);
  puzzleClient.setVisible(!document.hidden);
  reportProgress({ keepalive: document.hidden });
});
window.addEventListener('pagehide', () => { screenAwake.setVisible(false); puzzleClient.setVisible(false); reportProgress({ keepalive: true }); });
window.addEventListener('pageshow', () => { screenAwake.setVisible(!document.hidden); puzzleClient.setVisible(!document.hidden); });
window.addEventListener('online', () => reportProgress({ force: true }));
const privacy = document.querySelector('#privacy-view');
function closePrivacy() {
  privacy.hidden = true; document.querySelector('#start-screen').hidden = false;
  document.querySelector('#privacy-open').focus({ preventScroll: true });
}
document.querySelector('#privacy-open').addEventListener('click', () => {
  document.querySelector('#start-screen').hidden = true; privacy.hidden = false;
  document.querySelector('#privacy-title').focus({ preventScroll: true });
});
document.querySelector('#privacy-back').addEventListener('click', closePrivacy);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !privacy.hidden) closePrivacy(); });
analyticsConfig.then(config => {
  analytics = createRunAnalytics({ ...config, endpoint: config.analyticsEndpoint, device: describeDevice });
  if (!analytics.enabled) {
    document.querySelector('#privacy-intro').textContent = 'Analytics are disabled on this site.';
    document.querySelector('#privacy-details').hidden = true;
    document.querySelector('#privacy-local').hidden = false;
  }
  analytics.flush();
});
busy = false; render();
document.querySelector('.game-layout').setAttribute('aria-busy', 'false');
void page.reveal();
