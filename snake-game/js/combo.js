import { rollFoodPoints } from './critical.js?v=beta-public-1';

export const comboWindowMs = 3000;

export function createCombo() {
  return { count: 0, expiresAt: 0, lastGroup: null };
}

export function expireCombo(combo, now) {
  if (combo.count && now >= combo.expiresAt) Object.assign(combo, createCombo());
}

export function advanceCombo(combo, now, group) {
  expireCombo(combo, now);
  if (combo.lastGroup === group) return;
  combo.count++;
  combo.expiresAt = now + comboWindowMs;
  combo.lastGroup = group;
}

export function comboMultiplier(combo, now) {
  if (now >= combo.expiresAt) return 1;
  if (combo.count >= 10) return 3;
  if (combo.count >= 6) return 2;
  if (combo.count >= 3) return 1.5;
  return 1;
}

export function comboFade(combo, now) {
  const remaining = Math.max(0, Math.min(1, (combo.expiresAt - now) / 1000));
  return remaining * remaining * (3 - 2 * remaining);
}

export function scoreWithCombo(basePoints, critStats, combo, now, random = Math.random) {
  const reward = rollFoodPoints(basePoints, critStats, random);
  return { critical: reward.critical,
    points: Math.ceil(reward.points * comboMultiplier(combo, now)) };
}
