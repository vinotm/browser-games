export const VERSION = 'beta-4.2';
export const WINNING_SCORE = 999;
const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
export function validDimensions(rows, columns) {
  return [rows, columns].every(value => Number.isInteger(value) && value >= 3 && value <= 20);
}
export function createGame(rows = 6, columns = rows) {
  if (!validDimensions(rows, columns)) throw new RangeError('Rows and columns must be 3–20');
  // size remains a column-stride alias for older square-board callers.
  return { size: columns, rows, columns, cells: Array(rows * columns).fill(''), player: 0,
    scores: [0, 0], lines: [], finished: false,
    letterStreaks: [{ letter: '', count: 0 }, { letter: '', count: 0 }] };
}
export function allowedLetters(state) {
  if (state.finished) return [];
  const streak = state.letterStreaks[state.player];
  return ['S', 'O'].filter(letter => streak.count < 2 || letter !== streak.letter);
}
// Only lines crossing the new letter can become complete. The optional letter
// lets the AI test placements without copying an entire large board per choice.
export function scoringLines(cells, columns, index, rows = cells.length / columns, letter = cells[index]) {
  const row = Math.floor(index / columns), col = index % columns, result = [];
  for (const [dr, dc] of directions) for (let offset = -2; offset <= 0; offset++) {
    const firstRow = row + offset * dr, firstCol = col + offset * dc;
    const lastRow = firstRow + 2 * dr, lastCol = firstCol + 2 * dc;
    if (firstRow < 0 || firstRow >= rows || lastRow < 0 || lastRow >= rows ||
        firstCol < 0 || firstCol >= columns || lastCol < 0 || lastCol >= columns) continue;
    const first = firstRow * columns + firstCol, step = dr * columns + dc;
    const positions = [first, first + step, first + 2 * step];
    if (positions.every((i, k) => (i === index ? letter : cells[i]) === (k === 1 ? 'O' : 'S'))) result.push(positions);
  }
  return result;
}
export function play(state, index, letter) {
  if (state.finished || !Number.isInteger(index) || index < 0 || index >= state.cells.length || state.cells[index] || !allowedLetters(state).includes(letter)) return null;
  const cells = [...state.cells]; cells[index] = letter;
  const found = scoringLines(cells, state.columns, index, state.rows);
  const scores = [...state.scores]; scores[state.player] += found.length;
  const letterStreaks = state.letterStreaks.map(streak => ({ ...streak }));
  const previous = letterStreaks[state.player];
  letterStreaks[state.player] = { letter, count: letter === previous.letter ? previous.count + 1 : 1 };
  return { ...state, cells, scores, player: found.length ? state.player : 1 - state.player,
    letterStreaks, lines: [...state.lines, ...found.map(indices => ({ indices, player: state.player }))],
    finished: scores.some(score => score >= WINNING_SCORE) || cells.every(Boolean) };
}
