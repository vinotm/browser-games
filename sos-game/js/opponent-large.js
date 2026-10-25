import { play, allowedLetters, scoringLines } from './rules.js';
const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
function potential(state, index, letter) {
  const { rows, columns, cells } = state, row = Math.floor(index / columns), col = index % columns;
  let value = 0;
  for (const [dr, dc] of directions) for (let offset = -2; offset <= 0; offset++) {
    let occupied = 0, possible = true;
    for (let k = 0; k < 3; k++) {
      const r = row + (offset + k) * dr, c = col + (offset + k) * dc;
      if (r < 0 || r >= rows || c < 0 || c >= columns) { possible = false; break; }
      const i = r * columns + c, expected = k === 1 ? 'O' : 'S';
      if (i === index ? letter !== expected : cells[i] && cells[i] !== expected) { possible = false; break; }
      if (i !== index && cells[i]) occupied++;
    }
    if (possible) value += occupied * occupied;
  }
  return value;
}
function updateIndex(state, previous = null, placed = null) {
  const count = state.cells.length;
  const result = previous ? previous.map(array => array.slice()) : Array.from({ length: 4 }, () => new Int16Array(count));
  const dirty = new Set();
  if (placed === null) for (let i = 0; i < count; i++) dirty.add(i);
  else {
    dirty.add(placed);
    const row = Math.floor(placed / state.columns), col = placed % state.columns;
    for (const [dr, dc] of directions) for (let k = -2; k <= 2; k++) {
      const r = row + k * dr, c = col + k * dc;
      if (r >= 0 && r < state.rows && c >= 0 && c < state.columns) dirty.add(r * state.columns + c);
    }
  }
  for (const index of dirty) for (let l = 0; l < 2; l++) {
    const letter = l ? 'O' : 'S';
    result[l][index] = state.cells[index] ? 0 : scoringLines(state.cells, state.columns, index, state.rows, letter).length;
    result[l + 2][index] = state.cells[index] ? 0 : potential(state, index, letter);
  }
  return result;
}
function candidates(state, index, limit) {
  const result = [], letters = allowedLetters(state);
  for (let i = 0; i < state.cells.length; i++) if (!state.cells[i]) for (const letter of letters) {
    const l = letter === 'S' ? 0 : 1;
    result.push({ index: i, letter, gain: index[l][i], potential: index[l + 2][i] });
  }
  result.sort((a, b) => b.gain - a.gain || b.potential - a.potential);
  if (result.length <= limit) return result;
  const chosen = result.slice(0, Math.ceil(limit * .75));
  const regions = new Set(chosen.map(move => `${Math.floor(move.index / state.columns / 4)}:${Math.floor(move.index % state.columns / 4)}`));
  for (const move of result) {
    if (chosen.length === limit) break;
    const region = `${Math.floor(move.index / state.columns / 4)}:${Math.floor(move.index % state.columns / 4)}`;
    if (!regions.has(region)) { chosen.push(move); regions.add(region); }
  }
  for (const move of result) {
    if (chosen.length === limit) break;
    if (!chosen.includes(move)) chosen.push(move);
  }
  return chosen;
}
// A global tactical index spots every immediate score. Only lines within two
// cells of a placement change; update those instead of rescanning the grid at
// every search node. Cluster-ranked shortlists bound branching, not board vision.
export function chooseLargeMove(state, { maxNodes = 7000, depth = 3, maxMilliseconds, random = Math.random, onStats = () => {} } = {}) {
  const root = state.player, start = performance.now(), milliseconds = maxMilliseconds ?? (depth >= 4 ? 220 : depth >= 2 ? 110 : 50);
  const rootIndex = updateIndex(state), roots = candidates(state, rootIndex, 20);
  if (!roots.length) return null;
  const children = roots.map(move => { const next = play(state, move.index, move.letter); return { move, next, index: updateIndex(next, rootIndex, move.index) }; });
  const exhausted = Symbol('search budget');
  let nodes = 0, budgetHit = false, choices = roots.filter(move => move.gain === roots[0].gain);
  function evaluate(position, index) {
    let best = 0;
    if (!position.finished) for (const letter of allowedLetters(position)) {
      const scores = index[letter === 'S' ? 0 : 1];
      for (let i = 0; i < scores.length; i++) best = Math.max(best, scores[i]);
    }
    return (position.scores[root] - position.scores[1 - root]) * 100 + best * (position.player === root ? 65 : -65);
  }
  function search(position, index, remaining, alpha, beta) {
    if (++nodes > maxNodes || performance.now() - start >= milliseconds) throw exhausted;
    if (position.finished || !remaining) return evaluate(position, index);
    const maximizing = position.player === root;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of candidates(position, index, 12)) {
      const next = play(position, move.index, move.letter);
      const value = search(next, updateIndex(next, index, move.index), remaining - 1, alpha, beta);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  for (let level = 1; level <= depth; level++) {
    let best = -Infinity, completed = [];
    try {
      for (const child of children) {
        const value = search(child.next, child.index, level - 1, -Infinity, Infinity);
        if (value > best) { best = value; completed = [child.move]; }
        else if (value === best) completed.push(child.move);
      }
      choices = completed;
    } catch (error) { if (error !== exhausted) throw error; budgetHit = true; break; }
  }
  onStats({ nodes, budget_hit: budgetHit, random: false });
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
