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
  const readyAt = entry.born + wallWarningMs;
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
    return p.x >= r.x - padding && p.x < r.x + (r.width ?? 1) + padding &&
      p.y >= r.y - padding && p.y < r.y + (r.height ?? 1) + padding;
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
