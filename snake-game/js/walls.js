import { wallWarningMs, wallMaterializeMs, wallScoreInterval, wallMilestoneDriftMs,
  wallSpawnGapMs, wallLimit } from './config.js?v=beta-public-1';

export function createWallProgression() {
  return { nextScore: 10, skippedEarly: false };
}

// One optional early skip; after it, every remaining early checkpoint adds a wall.
export function takeWallMilestones(progression, score, random = Math.random) {
  const requests = [];
  while (score >= progression.nextScore) {
    const checkpoint = progression.nextScore;
    const early = checkpoint < wallScoreInterval;
    progression.nextScore += early ? 10 : wallScoreInterval;
    if (early && checkpoint > 10 && !progression.skippedEarly && random() < 0.25) {
      progression.skippedEarly = true;
      continue;
    }
    requests.push({ count: early ? 1 : 2 + Math.floor(random() * 2), corners: !early });
  }
  return requests;
}

// Gaps run from warning to warning, independently of any wall's materialization.
// Reserve capacity for each individual wall, including plans from earlier milestones.
export function scheduleWallPlans(requests, scheduled, occupied, now, lastWarningAt = -Infinity,
  random = Math.random) {
  const added = [];
  let available = Math.max(0, wallLimit - occupied - scheduled.length);
  let previous = Math.max(lastWarningAt, ...scheduled.map((entry) => entry.dueAt));
  const delay = ([min, max]) => min + random() * (max - min);
  for (const request of requests) {
    for (let i = 0; i < request.count && available > 0; i++, available--) {
      const dueAt = Math.max(now + delay(wallMilestoneDriftMs), previous + delay(wallSpawnGapMs));
      added.push({ corners: request.corners, dueAt });
      previous = dueAt;
    }
  }
  return added;
}

export function advanceWallAppearance(entry, now, safe) {
  const readyAt = entry.born + (entry.warningMs ?? wallWarningMs);
  const previous = Math.max(readyAt, entry.lastAppearanceAt ?? now);
  // Bound a stalled frame so the fill still gives a visible warning transition.
  const elapsed = Math.max(0, Math.min(100, now - previous));
  entry.lastAppearanceAt = now;
  entry.appearance = Math.max(0, Math.min(1,
    (entry.appearance ?? 0) + (now >= readyAt && safe ? 1 : -1) * elapsed / wallMaterializeMs));
  return safe && entry.appearance >= 1;
}

// Bounded placement: keep walls separate and leave corridors at the board edges.
export function wallIsClear(wall, reserved) {
  return !wall.cells.some((p) => reserved.some((r) => {
    const padding = r.padding ?? 1;
    return p.x + 1 > r.x - padding && p.x < r.x + (r.width ?? 1) + padding &&
      p.y + 1 > r.y - padding && p.y < r.y + (r.height ?? 1) + padding;
  }));
}

export function generateWalls({ size, count, existing = [], reserved = [], corners = false, random = Math.random }) {
  const added = [];
  const blocked = new Set();
  const reserveWall = (wall) => {
    for (const cell of wall.cells)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++)
          blocked.add(`${cell.x + dx},${cell.y + dy}`);
  };
  existing.forEach(reserveWall);
  for (let attempt = 0; added.length < count && attempt < 400; attempt++) {
    const x = 3 + Math.floor(random() * (size - 6));
    const y = 3 + Math.floor(random() * (size - 6));
    const horizontal = random() < 0.5;
    const length = 3 + Math.floor(random() * 4);
    const parts = [{ x, y, width: horizontal ? length : 1, height: horizontal ? 1 : length }];
    if (corners && random() < 0.5) {
      const arm = 3 + Math.floor(random() * 3);
      const sign = random() < 0.5 ? -1 : 1;
      parts.push(horizontal
        ? { x, y: y + (sign < 0 ? 1 - arm : 0), width: 1, height: arm }
        : { x: x + (sign < 0 ? 1 - arm : 0), y, width: arm, height: 1 });
    }
    const cellMap = new Map();
    for (const part of parts)
      for (let dy = 0; dy < part.height; dy++)
        for (let dx = 0; dx < part.width; dx++) {
          const cell = { x: part.x + dx, y: part.y + dy };
          cellMap.set(`${cell.x},${cell.y}`, cell);
        }
    const cells = [...cellMap.values()];
    if (cells.some((p) => p.x < 3 || p.y < 3 || p.x >= size - 3 || p.y >= size - 3 ||
      blocked.has(`${p.x},${p.y}`)) || !wallIsClear({ cells }, reserved)) continue;
    const wall = { ...parts[0], parts, cells };
    added.push(wall);
    reserveWall(wall);
  }
  return added;
}

// Activation is stricter about actual overlap, without placement's safety margins.
export function wallActivationReservations({ snake, previousSnake, food, bonusFood, buffs }) {
  return [
    ...snake.map(p => ({ ...p, padding: 0 })),
    ...previousSnake.map(p => ({ ...p, padding: 0 })),
    ...(food ? [{ ...food, padding: 0 }] : []),
    ...[bonusFood, ...buffs].filter(Boolean).map(p => ({
      ...p, width: 2, height: 2, padding: 0,
    })),
  ];
}

// Trace the union of the inset rectangles, excluding all interior seams.
export function wallOutline(wall, inset = 0) {
  const parts = (wall.parts || [wall]).map(p => ({
    left: p.x + inset, top: p.y + inset,
    right: p.x + p.width - inset, bottom: p.y + p.height - inset,
  }));
  const xs = [...new Set(parts.flatMap(p => [p.left, p.right]))].sort((a, b) => a - b);
  const ys = [...new Set(parts.flatMap(p => [p.top, p.bottom]))].sort((a, b) => a - b);
  const inside = (x, y) => x >= 0 && y >= 0 && x < xs.length - 1 && y < ys.length - 1 &&
    parts.some(p => xs[x] >= p.left && xs[x + 1] <= p.right &&
      ys[y] >= p.top && ys[y + 1] <= p.bottom);
  const edges = new Map();
  const edge = (a, b) => edges.set(a.join(','), { a, b });
  for (let y = 0; y < ys.length - 1; y++)
    for (let x = 0; x < xs.length - 1; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) edge([xs[x], ys[y]], [xs[x + 1], ys[y]]);
      if (!inside(x + 1, y)) edge([xs[x + 1], ys[y]], [xs[x + 1], ys[y + 1]]);
      if (!inside(x, y + 1)) edge([xs[x + 1], ys[y + 1]], [xs[x], ys[y + 1]]);
      if (!inside(x - 1, y)) edge([xs[x], ys[y + 1]], [xs[x], ys[y]]);
    }
  const loops = [];
  while (edges.size) {
    const start = edges.keys().next().value;
    let key = start;
    const loop = [];
    do {
      const segment = edges.get(key);
      loop.push(segment.a);
      edges.delete(key);
      key = segment.b.join(',');
    } while (key !== start);
    loops.push(loop);
  }
  return loops;
}

// Food remnants are real obstacles, but never consume milestone wall capacity.
export function milestoneWallCount(walls) {
  return walls.filter(wall => wall.source !== 'expired_food').length;
}

export function expiredFoodWall(position, solidWalls, size) {
  if (!position || solidWalls.length < 3) return null;
  const x = Math.max(0, Math.min(size - 1, Math.round(position.x)));
  const y = Math.max(0, Math.min(size - 1, Math.round(position.y)));
  if (solidWalls.some(wall => wall.cells.some(cell => cell.x === x && cell.y === y))) return null;
  return { x, y, width: 1, height: 1, source: 'expired_food',
    parts: [{ x, y, width: 1, height: 1 }], cells: [{ x, y }] };
}
