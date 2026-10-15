import { temporarySpawnTiming } from './config.js?v=beta-public-1';

export function randomDelay(window, random = Math.random) {
  return window[0] + random() * (window[1] - window[0]);
}

export function movingFoodWait(random = Math.random) {
  // Geometric wait: a 20% chance on each eligible static-food collection.
  return 1 + Math.floor(-Math.log(1 - random()) / -Math.log(0.8));
}

const effectBag = ['speedUp', 'slowDown', 'speedUp', 'reverse', 'slowDown', 'magnet'];

function shuffledBag(previous, random) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bag = [...effectBag];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag[0] !== previous && bag.every((type, i) => !i || type !== bag[i - 1])) return bag;
  }
  // A deterministic/random stub must still produce a bounded, valid schedule.
  const offset = effectBag.findIndex((type) => type !== previous);
  return [...effectBag.slice(offset), ...effectBag.slice(0, offset)];
}

export function createTemporarySpawner(now, random = Math.random) {
  return { queue: shuffledBag(null, random), previous: null,
    nextAt: now + randomDelay(temporarySpawnTiming.initial, random) };
}

export function temporarySpawnSucceeded(spawner, now, random = Math.random) {
  spawner.previous = spawner.queue.shift();
  if (!spawner.queue.length) spawner.queue = shuffledBag(spawner.previous, random);
  const window = random() < temporarySpawnTiming.quietChance
    ? temporarySpawnTiming.quietGap : temporarySpawnTiming.gap;
  spawner.nextAt = now + randomDelay(window, random);
}

export function temporarySpawnDeferred(spawner, now, random = Math.random) {
  // Keep the selected item; lack of space must not bias the shuffled variety.
  spawner.nextAt = now + randomDelay(temporarySpawnTiming.retry, random);
}
