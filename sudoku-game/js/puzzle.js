// A starter puzzle varied by Sudoku-preserving digit and row/column permutations.
const seed = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
function shuffle(values, random) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function createPuzzle(random = Math.random) {
  const digits = [0, ...shuffle([1,2,3,4,5,6,7,8,9], random)];
  const order = () => shuffle([0,1,2], random).flatMap(b => shuffle([0,1,2], random).map(i => b * 3 + i));
  const rows = order(), columns = order();
  const board = rows.flatMap(r => columns.map(c => digits[Number(seed[r * 9 + c])]));
  const solver = solve(board);
  while (!solver.next().done) { /* Generate a complete randomized board. */ }
  let remaining = 81;
  for (const index of shuffle(Array.from({length: 81}, (_, i) => i), random)) {
    if (remaining <= 30) break;
    const value = board[index];
    board[index] = 0;
    if (countSolutions(board) === 1) remaining--;
    else board[index] = value;
  }
  if (countSolutions(board) !== 1) throw new Error('Puzzle uniqueness verification failed');
  return board;
}

// Search a copy and stop at two: only exactly one solution is acceptable.
export function countSolutions(input, limit = 2) {
  if (conflicts(input).some(Boolean)) return 0;
  const board = [...input];
  function search() {
    let index = -1, choices;
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const options = candidates(board, i);
      if (!options.length) return 0;
      if (index < 0 || options.length < choices.length) {
        index = i; choices = options;
        if (choices.length === 1) break;
      }
    }
    if (index < 0) return 1;
    let count = 0;
    for (const n of choices) {
      board[index] = n;
      count += search();
      if (count >= limit) break;
    }
    board[index] = 0;
    return Math.min(count, limit);
  }
  return search();
}

export function candidates(board, index) {
  const row = Math.floor(index / 9), col = index % 9;
  const used = new Set();
  for (let k = 0; k < 9; k++) {
    if (row * 9 + k !== index) used.add(board[row * 9 + k]);
    if (k * 9 + col !== index) used.add(board[k * 9 + col]);
    const box = (Math.floor(row / 3) * 3 + Math.floor(k / 3)) * 9 + Math.floor(col / 3) * 3 + k % 3;
    if (box !== index) used.add(board[box]);
  }
  return [1,2,3,4,5,6,7,8,9].filter(n => !used.has(n));
}
export function conflicts(board) {
  return board.map((n, i) => Boolean(n && !candidates(board, i).includes(n)));
}
export function* solve(board) {
  let index = -1, choices;
  for (let i = 0; i < 81; i++) {
    if (board[i]) continue;
    const options = candidates(board, i);
    if (!options.length) return false;
    if (index === -1 || options.length < choices.length) {
      index = i; choices = options;
      if (options.length === 1) break;
    }
  }
  if (index === -1) return !conflicts(board).some(Boolean);
  for (const n of choices) {
    board[index] = n;
    yield index;
    if (yield* solve(board)) return true;
    board[index] = 0;
    yield index;
  }
  return false;
}

// Repeat a conflicting entry to erase it, only while conflict checking is on.
export function enteredValue(board, index, digit, checkEnabled) {
  return checkEnabled && digit !== 0 && board[index] === digit && conflicts(board)[index] ? 0 : digit;
}
