// Human-style grading, independent of the backtracking solver and game state.
// Levels describe the easiest path found by this fixed, versioned technique order.
import { candidates, conflicts } from './puzzle.js';

export const DIFFICULTY_VERSION = 'logic-v2';
const digits = [1,2,3,4,5,6,7,8,9];
const rows = digits.map((_, r) => digits.map((_, c) => r * 9 + c));
const columns = digits.map((_, c) => digits.map((_, r) => r * 9 + c));
const boxes = digits.map((_, b) => digits.map((_, k) =>
  (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + b % 3 * 3 + k % 3));
const units = [...rows, ...columns, ...boxes];
const peers = Array.from({ length: 81 }, (_, i) =>
  [...new Set(units.filter(unit => unit.includes(i)).flat())].filter(j => j !== i));
const bit = n => 1 << (n - 1);
const values = mask => digits.filter(n => mask & bit(n));
const size = mask => { let n = 0; for (; mask; mask &= mask - 1) n++; return n; };
const levels = { novice: 0, easy: 1, medium: 2, hard: 3 };
const techniques = [
  ['naked-single', 'easy'], ['hidden-single', 'easy'],
  ['locked-candidates', 'medium'], ['naked-pair', 'medium'], ['hidden-pair', 'medium'],
  ['naked-triple', 'hard'], ['hidden-triple', 'hard'], ['x-wing', 'hard']
];

function combinations(items, count, start = 0, prefix = [], result = []) {
  if (!count) result.push(prefix);
  else for (let i = start; i <= items.length - count; i++) {
    combinations(items, count - 1, i + 1, [...prefix, items[i]], result);
  }
  return result;
}

// Exported for testing the logical steps on candidate states. Returns a deduction
// without mutating its inputs: either a placement or candidate eliminations.
export function findLogicalStep(board, masks, technique) {
  const eliminate = (cells, mask) => cells.flatMap(index => {
    const removed = masks[index] & mask;
    return removed ? [{ index, digits: values(removed) }] : [];
  });
  const removal = eliminations => eliminations.length ? { eliminations } : null;
  if (technique === 'naked-single') {
    const index = masks.findIndex(mask => size(mask) === 1);
    return index < 0 ? null : { placement: { index, digit: values(masks[index])[0] } };
  }
  if (technique === 'hidden-single') {
    for (const unit of units) for (const digit of digits) {
      const cells = unit.filter(i => masks[i] & bit(digit));
      if (cells.length === 1) return { placement: { index: cells[0], digit } };
    }
  }
  if (technique === 'locked-candidates') {
    // Both pointing (box -> line) and claiming (line -> box).
    for (const source of units) for (const digit of digits) {
      const cells = source.filter(i => masks[i] & bit(digit));
      if (cells.length < 2) continue;
      for (const target of units) {
        if (source === target || !cells.every(i => target.includes(i))) continue;
        const step = removal(eliminate(target.filter(i => !source.includes(i)), bit(digit)));
        if (step) return step;
      }
    }
  }
  if (technique.startsWith('naked-') && technique !== 'naked-single') {
    const count = technique === 'naked-pair' ? 2 : 3;
    for (const unit of units) {
      const cells = unit.filter(i => size(masks[i]) >= 2 && size(masks[i]) <= count);
      for (const group of combinations(cells, count)) {
        const union = group.reduce((mask, i) => mask | masks[i], 0);
        if (size(union) !== count) continue;
        const step = removal(eliminate(unit.filter(i => !group.includes(i)), union));
        if (step) return step;
      }
    }
  }
  if (technique.startsWith('hidden-') && technique !== 'hidden-single') {
    const count = technique === 'hidden-pair' ? 2 : 3;
    for (const unit of units) {
      const available = digits.filter(d => unit.some(i => masks[i] & bit(d)));
      for (const group of combinations(available, count)) {
        const mask = group.reduce((m, d) => m | bit(d), 0);
        const cells = unit.filter(i => masks[i] & mask);
        if (cells.length !== count) continue;
        const step = removal(eliminate(cells, 511 & ~mask));
        if (step) return step;
      }
    }
  }
  if (technique === 'x-wing') {
    for (const lines of [rows, columns]) for (const digit of digits) {
      const positions = lines.map(line => line.flatMap((i, offset) => masks[i] & bit(digit) ? [offset] : []));
      for (let a = 0; a < 8; a++) {
        if (positions[a].length !== 2) continue;
        for (let b = a + 1; b < 9; b++) {
          if (positions[b].length !== 2 || positions[a].some((v, k) => v !== positions[b][k])) continue;
          const targets = lines.flatMap((line, i) => i === a || i === b ? [] : positions[a].map(k => line[k]));
          const step = removal(eliminate(targets, bit(digit)));
          if (step) return step;
        }
      }
    }
  }
  return null;
}

export function gradePuzzle(input, { maxLevel = 'hard', includeSteps = false } = {}) {
  if (!Object.hasOwn(levels, maxLevel)) throw new Error('Unknown difficulty level');
  if (!Array.isArray(input) || input.length !== 81 || Array.from(input).some(n => !Number.isInteger(n) || n < 0 || n > 9)) {
    throw new Error('Expected 81 integers from 0 to 9');
  }
  const board = [...input];
  const masks = board.map((n, i) => n ? 0 : candidates(board, i).reduce((m, d) => m | bit(d), 0));
  const counts = {}, steps = [];
  let hardest = 0, hardestTechnique = null, hardestRank = -1;
  const finish = status => ({
    version: DIFFICULTY_VERSION, status,
    difficulty: status === 'solved' ? (input.filter(Boolean).length >= 45 && !counts['hidden-single'] &&
      Object.keys(counts).every(name => name === 'naked-single') ? 'novice' :
      Object.keys(levels).find(level => levels[level] === (hardest || 1))) : null,
    hardestTechnique, counts, remaining: board.filter(n => !n).length,
    ...(includeSteps ? { steps, board: [...board] } : {})
  });
  // Detect contradictory candidate states, including a missing digit with no home.
  // Initial duplicate check is sufficient: placements always use candidates,
  // and propagation removes that digit from every peer before the next step.
  if (conflicts(board).some(Boolean)) return finish('invalid');
  const invalid = () => {
    for (let i = 0; i < 81; i++) if (!board[i] && !masks[i]) return true;
    for (const unit of units) {
      let available = 0;
      for (const i of unit) available |= board[i] ? bit(board[i]) : masks[i];
      if (available !== 511) return true;
    }
    return false;
  };
  while (true) {
    if (invalid()) return finish('invalid');
    if (board.every(Boolean)) return finish('solved');
    let found = false;
    for (const [technique, level] of techniques) {
      if (maxLevel === 'novice' ? technique !== 'naked-single' : levels[level] > levels[maxLevel]) break;
      const step = findLogicalStep(board, masks, technique);
      if (!step) continue;
      if (step.placement) {
        const { index, digit } = step.placement;
        board[index] = digit; masks[index] = 0;
        for (const i of peers[index]) masks[i] &= ~bit(digit);
      } else for (const { index, digits: removed } of step.eliminations) {
        for (const digit of removed) masks[index] &= ~bit(digit);
      }
      counts[technique] = (counts[technique] || 0) + 1;
      const rank = techniques.findIndex(([name]) => name === technique);
      if (rank > hardestRank) { hardest = levels[level]; hardestTechnique = technique; hardestRank = rank; }
      if (includeSteps) steps.push({ technique, ...step });
      found = true;
      break; // Restart with singles after every deduction.
    }
    if (!found) return finish('unclassified');
  }
}
