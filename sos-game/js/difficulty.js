import { chooseMove } from './opponent.js';
export const LEVELS = {
  easy: { depth: 1, maxNodes: 500 },
  medium: { depth: 2, maxNodes: 3000 },
  hard: { depth: 4, maxNodes: 18000 },
};
export function computerMove(state, difficulty = 'medium', random = Math.random) {
  if (state.finished) return null;
  if (difficulty === 'easy' && random() < .45) {
    const empty = state.cells.flatMap((cell, index) => cell ? [] : [index]);
    const index = empty[Math.min(empty.length - 1, Math.floor(random() * empty.length))];
    return { index, letter: random() < .5 ? 'S' : 'O' };
  }
  return chooseMove(state, { ...(LEVELS[difficulty] || LEVELS.medium), random });
}
