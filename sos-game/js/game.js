import { createPageShell } from '../../shared/js/page-shell.js';
import { createGame, play } from './rules.js';
import { computerMove } from './difficulty.js';

const $ = selector => document.querySelector(selector);
let state = createGame(), started = false, mode = 'computer', difficulty = 'medium', selected = null, thinking = false, requestId = 0;
let worker;
try {
  worker = new Worker(new URL('./opponent-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId || !thinking) return;
    deliverMove(data.id, data.move);
  };
  worker.onerror = event => {
    event.preventDefault(); worker.terminate(); worker = null;
    if (thinking) {
      const move = computerMove(state, difficulty);
      deliverMove(requestId, move);
    }
  };
} catch { worker = null; }
const page = createPageShell({ homeUrl: '../', ready: false, isActive: () => started && !state.finished });
function name(player) { return mode === 'local' ? `P${player + 1}` : player === 0 ? 'P1' : 'Computer'; }
function render(last = -1) {
  $('#board').style.setProperty('--size', state.size);
  const focused = document.activeElement?.dataset.index;
  $('#board').replaceChildren(...state.cells.map((cell, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = cell; button.dataset.index = index;
    button.setAttribute('aria-label', `Row ${Math.floor(index / state.size) + 1}, column ${index % state.size + 1}${cell ? `: ${cell}` : ': empty'}`);
    button.disabled = !started || state.finished || thinking || Boolean(cell);
    button.classList.toggle('last', index === last);
    button.addEventListener('click', () => selectCell(index));
    return button;
  }));
  if (focused !== undefined) $('#board').querySelector(`[data-index="${focused}"]:enabled`)?.focus({ preventScroll: true });
  const svg = $('#lines'); svg.setAttribute('viewBox', `0 0 ${state.size} ${state.size}`);
  svg.replaceChildren(...state.lines.map(({ indices, player }) => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const first = indices[0], last = indices[2];
    for (const [key, value] of Object.entries({ x1: first % state.size + .5, y1: Math.floor(first / state.size) + .5, x2: last % state.size + .5, y2: Math.floor(last / state.size) + .5 })) line.setAttribute(key, value);
    line.classList.add(`player-${player}`); return line;
  }));
  for (let player = 0; player < 2; player++) {
    const label = $(player ? '#player-two' : '#player-one');
    label.textContent = name(player);
    label.classList.toggle('current', started && !state.finished && state.player === player);
    $(player ? '#score-two' : '#score-one').textContent = state.scores[player];
  }
  $('#status').textContent = !started ? '' : thinking ? 'Computer is thinking…' : `${name(state.player)}’s turn`;
  if (state.finished) {
    $('#status').textContent = 'Board complete';
    const [a, b] = state.scores;
    $('#result-title').textContent = a === b ? 'A draw!' : mode === 'computer' ? a > b ? 'You win!' : 'Computer wins!' : `${name(a > b ? 0 : 1)} wins!`;
    $('#result-score').textContent = `${a} – ${b}`;
    $('#result').hidden = false; $('#again').focus({ preventScroll: true });
  }
  page.refresh();
}
function computerTurn() {
  if (!started || state.finished || mode !== 'computer' || state.player !== 1) return;
  thinking = true; render();
  const id = ++requestId;
  if (worker) worker.postMessage({ id, state, difficulty });
  else setTimeout(() => {
    if (id !== requestId) return;
    const move = computerMove(state, difficulty);
    deliverMove(id, move);
  }, 60);
}
function deliverMove(id, move) {
  if (id !== requestId || !thinking) return;
  if (page.isConfirming()) { setTimeout(() => deliverMove(id, move), 100); return; }
  thinking = false;
  if (move) place(move.index, move.letter);
}
function place(index, value) {
  if (!started || thinking || page.isConfirming()) return;
  const next = play(state, index, value);
  if (!next) return;
  const gained = next.lines.length - state.lines.length;
  state = next; render(index);
  if (gained && !state.finished) $('#status').textContent = `${name(state.player)} +${gained} · play again`;
  computerTurn();
}
$('#start').addEventListener('click', () => {
  requestId++; state = createGame(Number($('#size').value)); mode = $('#mode').value; difficulty = $('#difficulty').value; state.player = Math.random() < .5 ? 0 : 1; started = true;
  $('#setup').hidden = true; $('#result').hidden = true; render();
  computerTurn();
  if (!thinking) $('#board button:enabled')?.focus({ preventScroll: true });
});
$('#again').addEventListener('click', () => {
  started = false; requestId++; state = createGame(Number($('#size').value));
  $('#result').hidden = true; $('#setup').hidden = false; render(); $('#start').focus();
});
const picker = $('#letter-picker');
function closePicker(restoreFocus = true) {
  const index = selected; selected = null; picker.close();
  $('#board .selected')?.classList.remove('selected');
  if (restoreFocus && index !== null) $(`[data-index="${index}"]`)?.focus({ preventScroll: true });
}
function positionPicker() {
  if (selected === null) return;
  const cell = $(`[data-index="${selected}"]`).getBoundingClientRect();
  const board = $('#board').getBoundingClientRect();
  const width = picker.offsetWidth, height = picker.offsetHeight;
  picker.style.left = `${Math.max(board.left + 4, Math.min(cell.left + cell.width / 2 - width / 2, board.right - width - 4))}px`;
  const top = cell.bottom + 5 + height <= board.bottom ? cell.bottom + 5 : cell.top - height - 5;
  picker.style.top = `${Math.max(board.top + 4, Math.min(top, board.bottom - height - 4))}px`;
}
function selectCell(index) {
  if (!started || state.finished || thinking || state.cells[index] || page.isConfirming()) return;
  selected = index; $(`[data-index="${index}"]`).classList.add('selected');
  picker.showModal(); positionPicker();
}
function commitLetter(value) {
  if (selected === null) return;
  const index = selected; closePicker(false); place(index, value);
}
picker.addEventListener('click', event => {
  if (event.target.dataset.letter) commitLetter(event.target.dataset.letter);
  else if (event.target.closest('.picker-close')) closePicker();
  else if (event.target === picker) {
    const r = picker.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closePicker();
  }
});
picker.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
picker.addEventListener('keydown', event => {
  event.stopPropagation();
  if (!event.ctrlKey && !event.metaKey && ['s', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault(); commitLetter(event.key.toUpperCase());
  }
});
window.addEventListener('resize', positionPicker);
window.addEventListener('scroll', positionPicker, { passive: true });
$('#mode').addEventListener('change', () => {
  const local = $('#mode').value === 'local';
  $('#difficulty-label').hidden = local; $('#difficulty-wrap').hidden = local;
});
render();

void page.reveal();
