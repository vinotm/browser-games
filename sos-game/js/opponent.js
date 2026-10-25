import { chooseLargeMove } from './opponent-large.js';
import { play, scoringLines, allowedLetters } from './rules.js';

function moves(state) {
  const result = [];
  const letters = allowedLetters(state);
  state.cells.forEach((cell, index) => {
    if (cell) return;
    for (const letter of letters) {
      result.push({ index, letter, gain: scoringLines(state.cells, state.columns, index, state.rows, letter).length });
    }
  });
  return result.sort((a, b) => b.gain - a.gain);
}
// Fixed work budget keeps large boards responsive; extra turns retain the same
// maximizing/minimizing player rather than blindly alternating search roles.
export function chooseMove(state, { maxNodes = 7000, depth = 3, maxMilliseconds, random = Math.random, onStats = () => {} } = {}) {
  if (state.finished) return null;
  if (state.cells.length > 100) return chooseLargeMove(state, { maxNodes, depth, maxMilliseconds, random, onStats });
  const root = state.player;
  let nodes = 0, visited = 0, budgetHit = false;
  function evaluate(position) {
    const difference = position.scores[root] - position.scores[1 - root];
    const best = position.finished ? 0 : (moves(position)[0]?.gain || 0);
    return difference * 100 + best * (position.player === root ? 65 : -65);
  }
  function search(position, remaining, alpha, beta) {
    nodes++; visited++;
    if (nodes >= maxNodes) budgetHit = true;
    if (position.finished || remaining <= 0 || nodes >= maxNodes) return evaluate(position);
    const maximizing = position.player === root;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves(position)) {
      const value = search(play(position, move.index, move.letter), remaining - 1, alpha, beta);
      best = maximizing ? Math.max(best, value) : Math.min(best, value);
      if (maximizing) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
      if (beta <= alpha || nodes >= maxNodes) break;
    }
    return best;
  }
  const candidates = moves(state);
  // Split the budget between root choices so every legal move gets a fair look.
  const perMove = Math.max(1, Math.floor(maxNodes / candidates.length));
  let best = -Infinity, choices = [];
  for (const move of candidates) {
    nodes = maxNodes - perMove;
    const value = search(play(state, move.index, move.letter), depth - 1, -Infinity, Infinity);
    if (value > best) { best = value; choices = [move]; }
    else if (value === best) choices.push(move);
  }
  onStats({ nodes: visited, budget_hit: budgetHit, random: false });
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] || null;
}
