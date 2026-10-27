// Card identities live in this closure, never in DOM attributes or browser storage.
export const VERSION = 'beta-1';
export const SHAPES = Object.freeze(['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'hexagon', 'heart', 'oval', 'pentagon', 'crescent', 'ring']);

export function createMemoryGame(random = Math.random, { rows = 4, columns = 4 } = {}) {
  if (![rows, columns].every(n => Number.isInteger(n) && n >= 3 && n <= 20)) {
    throw new RangeError('Use 3–20 rows and columns');
  }
  const count = rows * columns, pairCount = Math.floor(count / 2);
  const colors = count > 36 ? 4 : 1;
  const sizes = count > 192 ? 2 : 1;
  const shapeCount = Math.min(12, Math.ceil(pairCount / (colors * sizes)));
  const variants = [];
  for (let size = 0; size < sizes; size++) for (let color = 0; color < colors; color++) {
    for (let shape = 0; shape < shapeCount; shape++) variants.push(
      colors === 1 ? SHAPES[shape] : `${SHAPES[shape]}:${color}:${sizes === 1 ? 'normal' : size ? 'large' : 'small'}`);
  }
  // Shuffle the vocabulary too, so smaller games do not always use the same shapes.
  if (count !== 16) for (let i = variants.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [variants[i], variants[j]] = [variants[j], variants[i]];
  }
  const half = Array.from({ length: pairCount }, (_, i) => variants[i % variants.length]);
  const deck = [...half, ...half];
  if (count % 2) deck.push(null);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const matched = new Set();
  let open = [];
  let moves = 0;
  const view = () => ({
    moves, totalPairs: pairCount, rows, columns,
    shapeCount, colorCount: colors, sizeCount: sizes,
    variantCount: new Set(half).size, blockedCells: count % 2, pairs: matched.size / 2, complete: matched.size === pairCount * 2,
    pending: open.length === 2,
    cards: deck.map((shape, index) => ({
      index, blocked: shape === null, matched: matched.has(index),
      // No answer for a face-down card is returned to the presentation layer.
      shape: matched.has(index) || open.includes(index) ? shape : null,
    })),
  });
  return {
    view,
    flip(index) {
      if (!Number.isInteger(index) || index < 0 || index >= deck.length ||
          deck[index] === null || matched.has(index) || open.includes(index)) return false;
      // A new face-down choice ends the previous mismatched attempt.
      if (open.length === 2) open = [];
      open.push(index);
      if (open.length === 2) {
        moves++;
        if (deck[open[0]] === deck[open[1]]) {
          open.forEach(card => matched.add(card));
          open = [];
        }
      }
      return true;
    },
    conceal() { if (open.length === 2) open = []; },
  };
}
