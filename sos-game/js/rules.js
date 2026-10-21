export const VERSION = 'beta-3';
const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
export function createGame(size = 6) {
  if (!Number.isInteger(size) || size < 4 || size > 10) throw new RangeError('Board size must be 4–10');
  return { size, cells: Array(size * size).fill(''), player: 0, scores: [0, 0], lines: [], finished: false,
    letterStreaks: [{ letter: '', count: 0 }, { letter: '', count: 0 }] };
}
// Only the current player's own placements count, including scoring extra turns.
export function allowedLetters(state) {
  if (state.finished) return [];
  const streak = state.letterStreaks[state.player];
  return ['S', 'O'].filter(letter => streak.count < 2 || letter !== streak.letter);
}
// Only lines crossing the new letter can have become complete this turn.
export function scoringLines(cells, size, index) {
  const row = Math.floor(index / size), col = index % size, result = [];
  for (const [dr, dc] of directions) for (let offset = -2; offset <= 0; offset++) {
    const positions = [];
    for (let k = 0; k < 3; k++) {
      const r = row + (offset + k) * dr, c = col + (offset + k) * dc;
      if (r >= 0 && r < size && c >= 0 && c < size) positions.push(r * size + c);
    }
    if (positions.length === 3 && positions.map(i => cells[i]).join('') === 'SOS') result.push(positions);
  }
  return result;
}
export function play(state, index, letter) {
  if (state.finished || !Number.isInteger(index) || index < 0 || index >= state.cells.length || state.cells[index] || !allowedLetters(state).includes(letter)) return null;
  const cells = [...state.cells]; cells[index] = letter;
  const found = scoringLines(cells, state.size, index);
  const scores = [...state.scores]; scores[state.player] += found.length;
  const letterStreaks = state.letterStreaks.map(streak => ({ ...streak }));
  const previous = letterStreaks[state.player];
  letterStreaks[state.player] = { letter, count: letter === previous.letter ? previous.count + 1 : 1 };
  return { ...state, cells, scores, player: found.length ? state.player : 1 - state.player,
    letterStreaks,
    lines: [...state.lines, ...found.map(indices => ({ indices, player: state.player }))],
    finished: cells.every(Boolean) };
}
