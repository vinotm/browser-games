import { size, interval, gameVersion, minimumSnakeLength, normalFoodWarmup, largeFoodLifetime,
  foodTravelTicks, regularFoodLifetimeMs, wallSpawnGapMs, wallLimit, magnetRadius,
  directions, keys, spawnIntervals, buffTypes, getPalette } from './config.js?v=beta-public-1';
import { createTimedEffects, collectTimedEffect, effectActive, movementInterval, controlDirection,
  pickupDistance } from './effects.js?v=beta-public-1';
import { movingFoodWait as movingWait, randomDelay, createTemporarySpawner,
  temporarySpawnSucceeded, temporarySpawnDeferred } from './spawning.js?v=beta-public-1';
import { generateWalls, wallIsClear, wallActivationReservations, advanceWallAppearance, createWallProgression,
  takeWallMilestones, scheduleWallPlans, milestoneWallCount, expiredFoodWall } from './walls.js?v=beta-public-1';
import { createSnakeRenderer } from './renderer.js?v=beta-public-1';
import { describeFatalCollision } from './collision.js?v=beta-public-1';
import { createCritStats, collectCritBuff } from './critical.js?v=beta-public-1';
import { createCombo, advanceCombo, expireCombo, comboFade, scoreWithCombo } from './combo.js?v=beta-public-1';
import { createStorage } from '../../shared/js/storage.js?v=beta-public-1';
import { createAnalytics } from '../../shared/js/analytics.js?v=beta-public-1';
import { describeDevice } from '../../shared/js/device.js?v=beta-public-1';
import { createClock, formatDuration } from '../../shared/js/clock.js?v=beta-public-1';
import { createTheme } from '../../shared/js/theme.js?v=beta-public-1';
import { createFrameScheduler } from '../../shared/js/animation.js?v=beta-public-1';
import { createOverlay } from '../../shared/js/overlay.js?v=beta-public-1';
import { bindSwipe, bindDirectionButtons, bindVisibilityPause, isEditableTarget } from '../../shared/js/input.js?v=beta-public-1';

import { loadDeploymentConfig } from '../../shared/js/config.js?v=beta-public-1';

const { analyticsEndpoint, environment, buildId } = await loadDeploymentConfig(new URL('../analytics-config.json', import.meta.url));
const canvas = document.querySelector('#board');
const screen = document.querySelector('.game-screen');
const scoreLabel = document.querySelector('#score');
const bestLabel = document.querySelector('#best');
const timerLabel = document.querySelector('#timer');
const themeButton = document.querySelector('#theme');
const status = document.querySelector('#status');
const startButton = document.querySelector('#start');
const pauseButton = document.querySelector('#pause');
const overlay = document.querySelector('#overlay');
const overlayTitle = document.querySelector('#overlay-title');
const overlayDetail = document.querySelector('#overlay-detail');
const overlayAction = document.querySelector('#overlay-action');
const directionControls = document.querySelector('.mobile-directions');
const comboPanel = document.querySelector('#combo');
const comboCount = document.querySelector('#combo-count');
const comboContent = document.querySelector('#combo-content');
const privacyOpen = document.querySelector('#privacy-open');
const privacyView = document.querySelector('#privacy-view');
const privacyBack = document.querySelector('#privacy-back');
if (!analyticsEndpoint) {
  privacyView.querySelector('h2').textContent = 'Your game data';
  privacyView.querySelector('#privacy-intro').textContent = 'Analytics are disabled on this site.';
  privacyView.querySelector('#privacy-details').textContent = 'Scores and preferences stay in your browser.';
  privacyView.querySelector('.privacy-status').hidden = true;
}
let displayedComboCount = 0, comboPunch = null;

function updateDirectionControls() {
  for (const button of directionControls.querySelectorAll('button')) {
    button.disabled = state !== 'playing';
  }
}

const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const mobilePreference = matchMedia('(max-width: 600px), (pointer: coarse)');

// Session state: reset() restores all game-specific values.
let snake, previousSnake, direction, queuedDirection, score;
let food, previousFood, movingFood, foodTicks, foodDirection, foodBorn;
let wallProgression = createWallProgression();
let scheduledWalls = [];
let lastWallWarningAt = -Infinity;
let combo = createCombo(), foodGroupSequence = 0;
let pendingWalls = [];
let walls = [],
  barrierCells = new Set();
let bonusFood = null,
  bonusLife = 0,
  bonusBorn = null;
let normalFoods = 0,
  untilMoving = 0,
  nextSpawns = {},
  specialsUnlocked = false;
let buffs = [],
  shortenRemaining = 0,
  extendRemaining = 0;
let shortenEffect = null,
  extendEffect = null,
  scorePopups = [];
let state = 'ready', lastTick = 0;
let progress = 1,
  frozenElapsed = 0,
  deathStarted = 0;
let best = 0;
let palette;
let critStats = createCritStats();
let timedEffects = createTimedEffects();
let magnetFlights = [];
let frameNumber = 0, lastMagnetFoodFrame = -1;
let temporarySpawner = null;
let objectSequence = 0, regularFoodId = null;

// Reusable services are opt-in; Snake owns how its session uses them.
const storage = createStorage('snake');
const clock = createClock();
const gameTime = (now) => clock.value(now);
const analytics = createAnalytics({ endpoint: analyticsEndpoint, game: 'snake', version: gameVersion,
  device: describeDevice, storage: createStorage('snake-analytics') });
const report = (type, details = {}, objectId = null) => analytics.record(type, gameTime(), details, objectId);
const objectId = (prefix) => `${prefix}-${++objectSequence}`;
const regularKind = () => movingFood ? 'moving_food' : 'normal_food';
function reportRegularSpawn() {
  if (food) report('item_spawned', { kind: regularKind(), ...foodPosition(), lifetime_ms: regularFoodLifetimeMs }, regularFoodId);
}
function advanceFoodCombo(group) {
  expireFoodCombo();
  advanceCombo(combo, gameTime(), group);
}
function expireFoodCombo() {
  expireCombo(combo, gameTime());
}
const frames = createFrameScheduler(loop);
const overlayView = createOverlay({ element: overlay, title: overlayTitle,
  detail: overlayDetail, action: overlayAction });
const theme = createTheme({ button: themeButton, legacyStorage: storage, onChange(dark) {
  palette = getPalette(dark);
  if (snake) draw();
} });
const renderer = createSnakeRenderer({ canvas, motionPreference, gameTime, foodPosition });

// Geometry is cached until the board resizes or the combo text changes.
let pauseRegion = null, comboRegion = null;
new ResizeObserver(() => { pauseRegion = comboRegion = null; }).observe(canvas);
mobilePreference.addEventListener('change', () => { pauseRegion = comboRegion = null; });

function boardRegion(element) {
  const board = canvas.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const tile = (board.width - 2 * canvas.clientLeft) / size;
  const left = board.left + canvas.clientLeft, top = board.top + canvas.clientTop;
  return { left: (rect.left - left) / tile, right: (rect.right - left) / tile,
    top: (rect.top - top) / tile, bottom: (rect.bottom - top) / tile };
}

function nearbyObjectDistance(region) {
  let distance = 3;
  const consider = (position, width = 1) => {
    if (!position) return;
    const dx = Math.max(region.left - position.x - width, position.x - region.right, 0);
    const dy = Math.max(region.top - position.y - width, position.y - region.bottom, 0);
    distance = Math.min(distance, Math.hypot(dx, dy));
  };
  snake.forEach((segment) => consider(segment));
  previousSnake.forEach((segment) => consider(segment));
  consider(foodPosition());
  consider(bonusFood, 2);
  buffs.forEach((buff) => consider(buff, 2));
  return distance;
}

function updatePauseOpacity() {
  if (pauseButton.hidden || !mobilePreference.matches) return;
  pauseRegion ??= boardRegion(pauseButton.querySelector('svg'));
  pauseButton.style.setProperty('--pause-opacity', String(0.18 + 0.32 * nearbyObjectDistance(pauseRegion) / 3));
}

function updateComboDisplay() {
  expireFoodCombo();
  const wasHidden = comboPanel.hidden;
  comboPanel.hidden = combo.count < 2 || !['playing', 'paused'].includes(state);
  if (combo.count !== displayedComboCount) {
    const increasing = combo.count > displayedComboCount;
    displayedComboCount = combo.count;
    comboCount.textContent = `${combo.count}!`;
    comboRegion = null;
    comboPunch?.cancel();
    if (increasing && !comboPanel.hidden && !motionPreference.matches) {
      comboPunch = comboContent.animate([
        { transform: 'scale(1.55)' },
        { transform: 'scale(0.95)', offset: 0.7 },
        { transform: 'scale(1)' },
      ], { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  }
  if (!comboPanel.hidden) {
    comboPanel.style.transition = wasHidden ? 'none' : '';
    comboRegion ??= boardRegion(comboPanel);
    const proximity = 0.22 + 0.68 * nearbyObjectDistance(comboRegion) / 3;
    comboPanel.style.opacity = String(proximity * comboFade(combo, gameTime()));
  }
}

function updateTimer(now) {
  timerLabel.textContent = formatDuration(gameTime(now));
}

function freezeTimer() {
  clock.pause();
  updateTimer();
}

// Board geometry and safe placement.

function copySnake() {
  return snake.map((segment) => ({ ...segment }));
}

function createWalls() {
  walls = [];
  pendingWalls = [];
  barrierCells = new Set();
}

function installWalls(added) {
  walls.push(...added);
  for (const wall of added)
    for (const cell of wall.cells) barrierCells.add(cell.y * size + cell.x);
}

function wallReservations() {
  const forward = [];
  for (const heading of [direction, queuedDirection].filter(Boolean))
    for (let step = 1; step <= 6; step++)
      forward.push({ x: snake[0].x + heading.x * step, y: snake[0].y + heading.y * step, padding: 1 });
  return [
    ...forward,
    ...snake.map((p) => ({ ...p, padding: 2 })),
    ...previousSnake.map((p) => ({ ...p, padding: 2 })),
    ...[food, previousFood, foodPosition(1), foodPosition(2)].filter(Boolean),
    ...[bonusFood, ...buffs].filter(Boolean).map((p) => ({ ...p, width: 2, height: 2 })),
  ];
}

function addMilestoneWalls() {
  const requests = takeWallMilestones(wallProgression, score);
  const plans = scheduleWallPlans(requests, scheduledWalls,
    milestoneWallCount(walls) + milestoneWallCount(pendingWalls.map(entry => entry.wall)), gameTime(), lastWallWarningAt);
  for (const plan of plans) {
    plan.id = objectId('wall');
    report('wall_scheduled', { score, warning_at_ms: plan.dueAt, corners_allowed: plan.corners }, plan.id);
  }
  scheduledWalls.push(...plans);
}

function showScheduledWallWarnings() {
  const now = gameTime();
  const request = scheduledWalls[0];
  // A delayed frame must not release several overdue warnings simultaneously.
  if (!request || now < request.dueAt || now - lastWallWarningAt < wallSpawnGapMs[0]) return;
  scheduledWalls.shift();
  const existing = [...walls, ...pendingWalls.map((entry) => entry.wall)];
  const added = generateWalls({
    size, count: Math.min(1, Math.max(0, wallLimit - milestoneWallCount(existing))),
    existing, reserved: wallReservations(), corners: request.corners,
  });
  for (const wall of added) {
    wall.id = request.id;
    report('wall_warning', { cells: wall.cells }, wall.id);
  }
  if (!added.length) report('wall_cancelled', { reason: 'no_safe_space' }, request.id);
  pendingWalls.push(...added.map((wall) => ({ wall, born: now })));
  lastWallWarningAt = now;
}

function activatePendingWalls() {
  const reserved = wallActivationReservations({
    snake, previousSnake,
    food: foodPosition(), bonusFood, buffs,
  });
  pendingWalls = pendingWalls.filter((entry) => {
    if (!advanceWallAppearance(entry, gameTime(), wallIsClear(entry.wall, reserved))) return true;
    installWalls([entry.wall]);
    report('wall_solid', {}, entry.wall.id);
    return false;
  });
}

function isBarrier(p) {
  return barrierCells.has(p.y * size + p.x);
}

function buffContains(buff, p) {
  return p.x >= buff.x && p.x < buff.x + 2 && p.y >= buff.y && p.y < buff.y + 2;
}

function bonusContains(p) {
  return bonusFood && buffContains(bonusFood, p);
}

function occupyPickup(occupied, pickup) {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      occupied.add((pickup.y + dy) * size + pickup.x + dx);
    }
  }
}

function emptyFoodPositions(width, reserveRegular = false) {
  const occupied = new Set([
    ...barrierCells,
    ...pendingWalls.flatMap((entry) => entry.wall.cells.map((p) => p.y * size + p.x)),
    ...snake.map((s) => s.y * size + s.x),
  ]);
  if (bonusFood) occupyPickup(occupied, bonusFood);
  for (const buff of buffs) occupyPickup(occupied, buff);
  const regular = reserveRegular
    ? [food, previousFood, foodPosition(1)].filter(Boolean)
    : [];
  const empty = [];
  for (let y = 0; y <= size - width; y++)
    for (let x = 0; x <= size - width; x++) {
      let clear = true;
      for (let dy = 0; dy < width; dy++)
        for (let dx = 0; dx < width; dx++)
          if (
            occupied.has((y + dy) * size + x + dx) ||
            regular.some(
              (p) => Math.abs(p.x - x - dx) < 1 && Math.abs(p.y - y - dy) < 1,
            )
          )
            clear = false;
      if (clear) empty.push({ x, y });
    }
  return empty;
}

// Regular and timed pickups.

function placeFood(relocate = false) {
  if (relocate && food) {
    const position = foodPosition();
    report('item_expired', { kind: regularKind(), ...position }, regularFoodId);
    const wall = expiredFoodWall(position, walls, size);
    if (wall) {
      wall.id = objectId('wall');
      // Start fading immediately; overlap checks still protect a crossing snake.
      pendingWalls.push({ wall, born: gameTime(), warningMs: 0 });
      report('wall_warning', { cells: wall.cells, source: wall.source,
        food_id: regularFoodId, warning_ms: 0 }, wall.id);
    }
  }
  const oldPositions = relocate ? [food, previousFood, foodPosition(1)].filter(Boolean) : [];
  if (!relocate) movingFood = normalFoods >= normalFoodWarmup && untilMoving <= 0;
  let empty = emptyFoodPositions(1);
  // A bonus must never prevent the regular food from spawning.
  if (!empty.length && (bonusFood || buffs.length)) {
    if (bonusFood) report('item_removed', { kind: 'large_food', reason: 'food_space' }, bonusFood.id);
    buffs.forEach((buff) => report('item_removed', { kind: buff.type, reason: 'food_space' }, buff.id));
    bonusFood = null;
    buffs = [];
    empty = emptyFoodPositions(1);
  }
  // A warning outline must not take the final available food position.
  if (!empty.length && pendingWalls.some(entry => entry.wall.source !== 'expired_food')) {
    pendingWalls.filter(entry => entry.wall.source !== 'expired_food').forEach((entry) => report('wall_cancelled', { reason: 'food_space' }, entry.wall.id));
    pendingWalls = pendingWalls.filter(entry => entry.wall.source === 'expired_food');
    empty = emptyFoodPositions(1);
  }
  if (relocate) {
    const different = empty.filter((p) => oldPositions.every((old) => Math.hypot(p.x - old.x, p.y - old.y) >= 2));
    if (different.length) empty = different;
  }
  food = empty[Math.floor(Math.random() * empty.length)] || null;
  regularFoodId = objectId('food');
  foodBorn = gameTime();
  previousFood = food;
  foodTicks = 0;
  foodDirection = Object.values(directions)[Math.floor(Math.random() * 4)];
  planFoodMove();
  reportRegularSpawn();
}

function nextSpawnTime(type, now = gameTime()) {
  return now + randomDelay(spawnIntervals[type]);
}

function spawnTimedPickups() {
  if (normalFoods < normalFoodWarmup) return;
  const now = gameTime();
  if (!specialsUnlocked) {
    specialsUnlocked = true;
    temporarySpawner = createTemporarySpawner(now);
    nextSpawns = Object.fromEntries(
      Object.keys(spawnIntervals).map((type) => [
        type,
        nextSpawnTime(type, now),
      ]),
    );
    return;
  }
  if (now >= temporarySpawner.nextAt) {
    if (maybePlaceBuff(temporarySpawner.queue[0])) temporarySpawnSucceeded(temporarySpawner, now);
    else temporarySpawnDeferred(temporarySpawner, now);
  }
  for (const type of Object.keys(spawnIntervals)) {
    if (now < nextSpawns[type]) continue;
    const placed = type === 'large' ? maybePlaceBonus() : maybePlaceBuff(type);
    if (placed) nextSpawns[type] = nextSpawnTime(type, now);
    else {
      const active = type === 'large' ? bonusFood && { born: bonusBorn, lifetime: largeFoodLifetime }
        : buffs.find((buff) => buff.type === type);
      const expiry = active ? active.born + (active.lifetime ?? buffTypes[type].lifetime) * interval : now;
      // Retry blocked spawns soon instead of losing a whole interval.
      nextSpawns[type] = Math.max(now, expiry) + randomDelay(active ? [500, 1500] : [2000, 4000]);
    }
  }
}

function maybePlaceBonus() {
  if (bonusFood || !food || normalFoods < normalFoodWarmup) return false;
  const empty = emptyFoodPositions(2, true);
  bonusFood = empty[Math.floor(Math.random() * empty.length)] || null;
  if (bonusFood) {
    bonusFood.id = objectId('large');
    bonusLife = largeFoodLifetime;
    bonusBorn = gameTime();
    report('item_spawned', { kind: 'large_food', x: bonusFood.x, y: bonusFood.y,
      lifetime_ms: largeFoodLifetime * interval }, bonusFood.id);
    return true;
  }
  return false;
}

function maybePlaceBuff(type = 'shortener') {
  if (
    !food ||
    normalFoods < normalFoodWarmup ||
    buffs.length >= 4 ||
    buffs.some((buff) => buff.type === type) ||
    (type === 'shortener' && snake.length <= minimumSnakeLength)
  )
    return false;
  const empty = emptyFoodPositions(2, true);
  const position = empty[Math.floor(Math.random() * empty.length)];
  if (position) {
    buffs.push({
      ...position,
      type,
      life: buffTypes[type].lifetime,
      born: gameTime(),
      id: objectId(type),
    });
    report('item_spawned', { kind: type, ...position, lifetime_ms: buffTypes[type].lifetime * interval }, buffs.at(-1).id);
    return true;
  }
  return false;
}

function advancePickups() {
  const now = gameTime();
  if (bonusFood) {
    bonusLife = largeFoodLifetime - (now - bonusBorn) / interval;
    if (bonusLife <= 0) {
      report('item_expired', { kind: 'large_food' }, bonusFood.id);
      bonusFood = null;
    }
  }
  buffs = buffs.filter((buff) => {
    buff.life = buffTypes[buff.type].lifetime - (now - buff.born) / interval;
    if (buff.life <= 0) report('item_expired', { kind: buff.type }, buff.id);
    return buff.life > 0;
  });
  if (food && now - foodBorn >= regularFoodLifetimeMs) placeFood(true);
  for (const [type, until] of Object.entries(timedEffects)) {
    if (until > 0 && until <= now) {
      report('effect_ended', { kind: type, reason: 'expired' });
      timedEffects[type] = 0;
    }
  }
}

function applyBuff(buff, source = 'snake') {
  report('item_eaten', { kind: buff.type, source, points: 0, score }, buff.id);
  if (buff.type === 'shortener') {
    shortenRemaining = Math.min(
      buffTypes.shortener.segments,
      Math.max(0, snake.length - minimumSnakeLength),
    );
    shortenEffect = { born: gameTime(), removed: shortenRemaining };
    queuedDirection = null;
    extendRemaining = 0;
    extendEffect = null;
  } else if (buff.type === 'extender') {
    extendRemaining = buffTypes.extender.segments;
    extendEffect = { born: gameTime() };
  } else if (buff.type === 'critRate' || buff.type === 'critMultiplier') {
    const increased = collectCritBuff(critStats, buff.type);
    scorePopups.push({
      x: buff.x + 0.5, y: buff.y + 0.5, born: gameTime(),
      text: increased ? (buff.type === 'critRate' ? 'Luck up!' : 'Power up!') : 'Charged!',
      color: buffTypes[buff.type].color, buffType: buff.type,
    });
  } else if (buffTypes[buff.type].durationMs) {
    const before = { ...timedEffects };
    const result = collectTimedEffect(timedEffects, buff.type, gameTime());
    if (result === 'cancelled') {
      const other = buff.type === 'speedUp' ? 'slowDown' : 'speedUp';
      report('effect_ended', { kind: other, reason: 'opposite_pickup' });
    } else report(before[buff.type] > gameTime() ? 'effect_refreshed' : 'effect_started',
      { kind: buff.type, duration_ms: buffTypes[buff.type].durationMs });
    // Avoid carrying a previously queued control across a reversal change.
    if (buff.type === 'reverse') queuedDirection = null;
    scorePopups.push({
      x: buff.x + 0.5, y: buff.y + 0.5, born: gameTime(),
      text: result === 'cancelled' ? 'Normal speed!' : buffTypes[buff.type].label,
      color: buffTypes[buff.type].color, buffType: buff.type,
    });
  }
}

function updateScore() {
  scoreLabel.textContent = score;
  if (score > best) {
    bestLabel.textContent = best = score;
    storage.set('best', best);
  }
}

function countRegularFood(wasMoving) {
  if (wasMoving) untilMoving = movingWait();
  else {
    normalFoods++;
    if (normalFoods >= normalFoodWarmup) untilMoving--;
  }
}

function captureMagnetItems() {
  if (!effectActive(timedEffects, 'magnet', gameTime())) return;
  const amount = motionPreference.matches ? 1 : progress;
  const head = {
    x: previousSnake[0].x + (snake[0].x - previousSnake[0].x) * amount,
    y: previousSnake[0].y + (snake[0].y - previousSnake[0].y) * amount,
  };
  const target = foodPosition();
  const regular = target && lastMagnetFoodFrame !== frameNumber &&
    pickupDistance(head, target) <= magnetRadius;
  const large = bonusFood && pickupDistance(head, bonusFood, 2) <= magnetRadius;
  const capturedBuffs = buffs.filter((buff) => pickupDistance(head, buff, 2) <= magnetRadius);
  const fly = (position, width, type) => magnetFlights.push({
    x: position.x, y: position.y, width, type, born: gameTime(),
  });
  if (regular || large) advanceFoodCombo(`magnet:${frameNumber}`);
  if (regular) {
    lastMagnetFoodFrame = frameNumber;
    fly(target, 1, 'food');
    awardFoodPoints(target, movingFood ? 2 : 1, null, 'magnet');
    countRegularFood(movingFood);
    snake.push({ ...snake.at(-1) });
    food = previousFood = null;
  }
  if (large) {
    fly(bonusFood, 2, 'large');
    awardFoodPoints({ x: bonusFood.x + 0.5, y: bonusFood.y + 0.5 }, 5, bonusFood, 'magnet');
    snake.push({ ...snake.at(-1) });
    bonusFood = null;
  }
  buffs = buffs.filter((buff) => !capturedBuffs.includes(buff));
  for (const buff of capturedBuffs) {
    fly(buff, 2, buff.type);
    applyBuff(buff, 'magnet');
  }
  if (regular || large) updateScore();
  if (regular) {
    placeFood();
    if (!food) gameOver(true);
  }
  if (state === 'playing') addMilestoneWalls();
}

function foodAvailable(p) {
  return (
    p.x >= 0 &&
    p.x <= size - 1 &&
    p.y >= 0 &&
    p.y <= size - 1 &&
    !isBarrier({ x: Math.round(p.x), y: Math.round(p.y) }) &&
    !bonusContains({ x: Math.round(p.x), y: Math.round(p.y) }) &&
    !buffs.some((buff) =>
      buffContains(buff, { x: Math.round(p.x), y: Math.round(p.y) }),
    ) &&
    !snake.slice(1).some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 0.8)
  );
}

function planFoodMove() {
  previousFood = food;
  if (!food || !movingFood) return;
  const available = foodAvailable;
  let next = { x: food.x + foodDirection.x, y: food.y + foodDirection.y };
  if (!available(next)) {
    foodDirection = { x: -foodDirection.x, y: -foodDirection.y };
    next = { x: food.x + foodDirection.x, y: food.y + foodDirection.y };
  }
  if (available(next)) food = next;
}

function foodPosition(amount = progress) {
  if (!food) return null;
  const from = previousFood || food;
  const fraction = movingFood
    ? Math.min(1, (foodTicks + amount) / foodTravelTicks)
    : 1;
  return {
    x: from.x + (food.x - from.x) * fraction,
    y: from.y + (food.y - from.y) * fraction,
  };
}

function moveFood() {
  if (!food || !movingFood) return;
  // Recheck every snake tick: a body segment can enter an already planned path.
  const current = foodPosition(1);
  const next = foodPosition(2);
  if (!foodAvailable(next) || !foodAvailable(food)) {
    foodDirection = { x: -foodDirection.x, y: -foodDirection.y };
    previousFood = current;
    const destination = {
      x: current.x + foodDirection.x,
      y: current.y + foodDirection.y,
    };
    food = foodAvailable(destination) ? destination : current;
    foodTicks = 0;
    return;
  }
  if (++foodTicks >= foodTravelTicks) {
    foodTicks = 0;
    planFoodMove();
  }
}

function awardFoodPoints(position, basePoints, item = null, source = 'snake') {
  const { points, critical } = scoreWithCombo(basePoints, critStats, combo, gameTime());
  score += points;
  report('item_eaten', { kind: item ? 'large_food' : regularKind(), ...position,
    source, points, critical, combo: combo.count, score }, item?.id ?? regularFoodId);
  scorePopups.push({ x: position.x, y: position.y, value: points, critical, born: gameTime() });
}

function draw(deathProgress = 0) {
  updatePauseOpacity();
  updateComboDisplay();
  ({ shortenEffect, extendEffect, scorePopups, magnetFlights } = renderer.draw({
    snake, previousSnake, walls, pendingWalls, food, foodBorn, bonusFood, bonusLife, bonusBorn,
    buffs, timedEffects, magnetFlights, shortenRemaining, extendRemaining, shortenEffect, extendEffect,
    scorePopups, progress, palette,
  }, deathProgress));
}

// Session controls and fixed-step simulation.

function reset() {
  if (analytics.active) {
    analytics.finish('abandoned', gameTime(), { score, reason: 'restart' });
    void analytics.flush({ force: true });
  }
  objectSequence = 0;
  snake = Array.from({ length: 5 }, (_, i) => ({ x: 15 - i, y: 16 }));
  previousSnake = copySnake();
  direction = directions.right;
  queuedDirection = null;
  progress = 1;
  score = 0;
  wallProgression = createWallProgression();
  scheduledWalls = [];
  lastWallWarningAt = -Infinity;
  combo = createCombo();
  foodGroupSequence = 0;
  critStats = createCritStats();
  timedEffects = createTimedEffects();
  magnetFlights = [];
  frameNumber = 0;
  lastMagnetFoodFrame = -1;
  temporarySpawner = null;
  clock.reset();
  scorePopups = [];
  updateTimer();
  normalFoods = 0;
  bonusFood = null;
  bonusLife = 0;
  buffs = [];
  shortenRemaining = 0;
  shortenEffect = null;
  extendRemaining = 0;
  extendEffect = null;
  untilMoving = movingWait();
  nextSpawns = {};
  specialsUnlocked = false;
  bonusBorn = null;
  scoreLabel.textContent = score;
  createWalls();
  placeFood();
  draw();
}

function showOverlay(title, detail, action) {
  updateDirectionControls();
  overlayView.show({ heading: title, description: detail, actionLabel: action, ready: state === 'ready' });
  overlay.classList.toggle('finished', state === 'over' || state === 'won');
  pauseButton.hidden = true;
  startButton.hidden = state !== 'paused';
  startButton.textContent = 'Restart';
  privacyOpen.hidden = state !== 'ready';
}

function openPrivacy() {
  if (state !== 'ready') return;
  state = 'privacy';
  overlayView.hide();
  privacyView.hidden = false;
  canvas.inert = true;
  document.querySelector('#privacy-title').focus({ preventScroll: true });
}

function closePrivacy() {
  if (state !== 'privacy') return;
  state = 'ready';
  privacyView.hidden = true;
  canvas.inert = false;
  showOverlay('', '', 'Start');
  privacyOpen.focus({ preventScroll: true });
}

function schedule() { frames.request(); }
function stopFrame() { frames.cancel(); }

function gameOver(won = false) {
  freezeTimer();
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const collision = won ? { death_cause: 'board_filled' } : describeFatalCollision(head, walls, size);
  analytics.finish('completed', gameTime(), { score, snake_length: snake.length, ...collision });
  void analytics.flush({ force: true });
  queuedDirection = null;
  pauseButton.disabled = true;
  pauseButton.hidden = true;
  startButton.textContent = 'Play again';
  status.textContent = won ? 'You win!' : 'Game over';
  if (won || motionPreference.matches) {
    state = won ? 'won' : 'over';
    showOverlay(status.textContent, `Score ${score}`, 'Play again');
    overlayView.focus();
  } else {
    state = 'dying';
    deathStarted = performance.now();
    screen.classList.add('impact');
    schedule();
  }
  updateDirectionControls();
}

function tick() {
  advancePickups();
  if (shortenRemaining > 0) {
    previousSnake = copySnake();
    snake.pop();
    shortenRemaining--;
    moveFood();
    activatePendingWalls();
    return;
  }
  if (queuedDirection) direction = queuedDirection;
  queuedDirection = null;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const target = foodPosition(1);
  const eating =
    target && Math.hypot(head.x - target.x, head.y - target.y) <= 0.65;
  const eatingBonus = bonusContains(head);
  const foodPoints = movingFood ? 2 : 1;
  const extending = extendRemaining > 0;
  const body = eating || eatingBonus || extending ? snake : snake.slice(0, -1);
  if (
    head.x < 0 ||
    head.x >= size ||
    head.y < 0 ||
    head.y >= size ||
    isBarrier(head) ||
    body.some((s) => s.x === head.x && s.y === head.y)
  ) {
    gameOver();
    return;
  }
  previousSnake = copySnake();
  snake.unshift(head);
  if (!eating && !eatingBonus && !extending) snake.pop();
  // Hold the tail while the head advances, adding one real segment per step.
  if (extending && !eating && !eatingBonus) extendRemaining--;
  if (eating || eatingBonus) {
    advanceFoodCombo(`food:${++foodGroupSequence}`);
    if (eating) awardFoodPoints(target, foodPoints);
    if (eatingBonus)
      awardFoodPoints({ x: bonusFood.x + 0.5, y: bonusFood.y + 0.5 }, 5, bonusFood);
    updateScore();
  }
  if (eatingBonus) bonusFood = null;
  const collected = buffs.filter((buff) => buffContains(buff, head));
  buffs = buffs.filter((buff) => !collected.includes(buff));
  collected.forEach((buff) => applyBuff(buff));
  if (eating) {
    countRegularFood(movingFood);
    placeFood();
    if (!food) gameOver(true);
  } else moveFood();
  if (state === 'playing') {
    activatePendingWalls();
    addMilestoneWalls();
  }
}

function loop(time) {
  if (state === 'playing') {
    frameNumber++;
    updateTimer(time);
    advancePickups();
    let step = movementInterval(timedEffects, gameTime());
    progress = Math.max(0, Math.min(1, (time - lastTick) / step));
    captureMagnetItems();
    // Fixed grid movement, interpolated every animation frame.
    // Bound catch-up so a stalled frame cannot race the snake ahead.
    step = movementInterval(timedEffects, gameTime());
    if (time - lastTick > step * 4) lastTick = time - step;
    while (time - lastTick >= step && state === 'playing') {
      progress = 1;
      lastTick += step;
      tick();
      step = movementInterval(timedEffects, gameTime());
    }
    if (state === 'playing') {
      spawnTimedPickups();
      progress = Math.max(0, Math.min(1, (time - lastTick) / step));
      captureMagnetItems();
      showScheduledWallWarnings();
      activatePendingWalls();
      step = movementInterval(timedEffects, gameTime());
      progress = Math.max(0, Math.min(1, (time - lastTick) / step));
      draw();
    }
  }
  if (state === 'dying') {
    const elapsed = Math.max(0, Math.min(1, (time - deathStarted) / 650));
    draw(elapsed);
    if (elapsed >= 1) {
      state = 'over';
      screen.classList.remove('impact');
      showOverlay('Game over', `Score ${score}`, 'Play again');
      overlayView.focus();
    }
  }
  if (['playing', 'dying'].includes(state)) schedule();
}

function turn(name) {
  if (state !== 'playing' || queuedDirection) return;
  name = controlDirection(name, timedEffects, gameTime());
  const next = directions[name];
  if (!next || (next.x === -direction.x && next.y === -direction.y)) return;
  queuedDirection = next;
}

function pause() {
  if (state === 'paused') {
    resume();
    return;
  }
  if (state !== 'playing') return;
  const step = movementInterval(timedEffects, gameTime());
  frozenElapsed = Math.max(0, Math.min(step, performance.now() - lastTick));
  progress = frozenElapsed / step;
  freezeTimer();
  report('paused');
  state = 'paused';
  stopFrame();
  draw();
  status.textContent = 'Paused';
  showOverlay('Paused', '', 'Resume');
  overlayView.focus();
}

function resume() {
  if (state !== 'paused' || document.hidden) return;
  state = 'playing';
  updateDirectionControls();
  lastTick = clock.start() - frozenElapsed;
  report('resumed');
  overlayView.hide();
  pauseButton.hidden = false;
  status.textContent = '';
  const focusTarget = mobilePreference.matches ? pauseButton : canvas;
  focusTarget.focus({ preventScroll: true });
  schedule();
}

function start() {
  const firstStart = state === 'ready';
  stopFrame();
  state = 'playing';
  updateDirectionControls();
  screen.classList.remove('impact');
  overlayView.hide();
  if (!firstStart) reset();
  analytics.start(0, { score: 0, base_step_ms: interval, environment, build_id: buildId });
  reportRegularSpawn();
  pauseButton.disabled = false;
  pauseButton.hidden = false;
  startButton.textContent = 'Restart';
  status.textContent = '';
  lastTick = clock.start();
  updateTimer();
  schedule();
}

// Keyboard and touch input.

function handleKeyDown(event) {
  if (isEditableTarget(event.target)) return;
  if (state === 'privacy') {
    if (event.key === 'Escape') { event.preventDefault(); closePrivacy(); }
    return;
  }
  // Let focused buttons handle Enter/Space through their native click behavior.
  if (event.target.closest?.('button') && (event.code === 'Space' || event.key === 'Enter')) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (event.repeat) return;
    if (['ready', 'over', 'won'].includes(state)) start();
    else if (['playing', 'paused'].includes(state)) pause();
    return;
  }
  const name = keys[event.key] || keys[event.key.toLowerCase()];
  if (name) {
    event.preventDefault();
    if (state === 'ready' && event.key.startsWith('Arrow')) {
      const next = directions[name];
      if (next.x === -direction.x && next.y === -direction.y) return;
      start();
      turn(name);
    } else turn(name);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    pause();
  }
}

function registerControls() {
  privacyOpen.addEventListener('click', openPrivacy);
  privacyBack.addEventListener('click', closePrivacy);
  startButton.addEventListener('click', start);
  pauseButton.addEventListener('click', pause);
  overlayAction.addEventListener('click', () =>
    state === 'paused' ? resume() : start(),
  );
  document.addEventListener('keydown', handleKeyDown);
  bindVisibilityPause(() => { if (state === 'playing') pause(); });
  bindSwipe(canvas, turn);
  bindDirectionButtons(directionControls, turn);
  const stash = () => { analytics.checkpoint(); void analytics.flush({ force: true, keepalive: true }); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stash(); });
  window.addEventListener('pagehide', stash);
  window.addEventListener('online', () => { void analytics.flush({ force: true }); });
  setInterval(() => { if (!document.hidden) void analytics.flush(); }, 15000);
}

best = storage.number('best');
bestLabel.textContent = best;
registerControls();
theme.apply();
reset();
showOverlay('', '', 'Start');
void analytics.flush();
