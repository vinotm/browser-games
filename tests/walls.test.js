import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWalls, wallIsClear, advanceWallAppearance, createWallProgression,
  takeWallMilestones, scheduleWallPlans, wallActivationReservations, wallOutline, milestoneWallCount, expiredFoodWall } from '../snake-game/js/walls.js';
import { buffTypes, interval, regularFoodLifetimeMs, largeFoodLifetime } from '../snake-game/js/config.js';

function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('early straight walls stay separated and clear of reserved objects', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const reserved = [{ x: 8, y: 13, width: 17, height: 7, padding: 0 }];
    const count = 3 + seed % 3;
    const walls = generateWalls({ size: 32, count, reserved, random: seeded(seed) });
    assert.equal(walls.length, count);
    for (const wall of walls) {
      assert.equal(wall.parts.length, 1);
      assert.ok(wallIsClear(wall, reserved));
      for (const p of wall.cells) {
        assert.ok(p.x >= 3 && p.x < 29 && p.y >= 3 && p.y < 29);
        for (const other of walls.filter((w) => w !== wall))
          assert.ok(other.cells.every((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) > 2));
      }
    }
  }
});

test('early wall checkpoints allow at most one skip and later batches start at 50', () => {
  for (const skipAt of [0, 2, 3, 4]) {
    const progression = createWallProgression();
    assert.deepEqual(takeWallMilestones(progression, 9), []);
    const early = [];
    for (let checkpoint = 1; checkpoint <= 4; checkpoint++) {
      const requests = takeWallMilestones(progression, checkpoint * 10,
        () => skipAt > 0 && checkpoint >= skipAt ? 0 : 0.99);
      assert.equal(requests.length, checkpoint === skipAt ? 0 : 1);
      early.push(...requests);
      assert.deepEqual(takeWallMilestones(progression, checkpoint * 10), []);
    }
    assert.equal(early.length, skipAt ? 3 : 4);
    assert.ok(early.every((request) => request.count === 1 && !request.corners));
    assert.deepEqual(takeWallMilestones(progression, 50, () => 0), [{ count: 2, corners: true }]);
    assert.deepEqual(takeWallMilestones(progression, 99), []);
    assert.deepEqual(takeWallMilestones(progression, 100, () => 0.99), [{ count: 3, corners: true }]);
  }
});

test('a score jump processes every crossed wall milestone exactly once', () => {
  const progression = createWallProgression();
  const requests = takeWallMilestones(progression, 150, () => 0);
  assert.deepEqual(requests, [
    ...Array.from({ length: 3 }, () => ({ count: 1, corners: false })),
    ...Array.from({ length: 3 }, () => ({ count: 2, corners: true })),
  ]);
  assert.deepEqual(takeWallMilestones(progression, 150), []);
  assert.deepEqual(createWallProgression(), { nextScore: 10, skippedEarly: false });
});

test('wall batches become individual plans with random gaps, including across milestones', () => {
  const draws = [0.5, 0, 0, 1, 1, 0.5];
  const first = scheduleWallPlans([{ count: 3, corners: true }], [], 0, 10000,
    -Infinity, () => draws.shift());
  assert.deepEqual(first.map((entry) => entry.dueAt), [10500, 13000, 15000]);
  assert.ok(first.every((entry) => entry.corners && !('count' in entry)));
  const next = scheduleWallPlans([{ count: 2, corners: true }], first, 0, 11000,
    -Infinity, () => 0);
  assert.deepEqual(next.map((entry) => entry.dueAt), [16500, 18000]);
  const afterWarning = scheduleWallPlans([{ count: 1, corners: false }], [], 1,
    12000, 11500, () => 0);
  assert.equal(afterWarning[0].dueAt, 13000);
});

test('solid, forming and scheduled walls share the 15-wall capacity', () => {
  const batch = [{ count: 3, corners: true }];
  const scheduled = [{ dueAt: 4000, corners: true }];
  assert.equal(scheduleWallPlans(batch, scheduled, 12, 0, -Infinity, () => 0).length, 2);
  assert.equal(scheduleWallPlans(batch, scheduled, 14, 0).length, 0);
  assert.equal(scheduleWallPlans(batch, [], 15, 0).length, 0);
  const hugeBatch = scheduleWallPlans([{ count: 100, corners: true }], [], 0, 0);
  assert.equal(hugeBatch.length, 15);
  assert.ok(hugeBatch.every((entry, i) => !i || entry.dueAt - hugeBatch[i - 1].dueAt >= 1500));
});

test('the next warning is due even while the previous wall is forming or blocked', () => {
  const plans = scheduleWallPlans([{ count: 3, corners: true }], [], 0, 0,
    -Infinity, () => 0);
  assert.deepEqual(plans.map((plan) => plan.dueAt), [250, 1750, 3250]);
  const first = { born: plans[0].dueAt };
  advanceWallAppearance(first, first.born, true);
  assert.equal(advanceWallAppearance(first, plans[1].dueAt, true), false);
  assert.equal(first.appearance, 0);
  // Even a wall kept non-solid indefinitely does not move later warning times.
  for (let now = 1850; now <= plans[2].dueAt; now += 100)
    assert.equal(advanceWallAppearance(first, now, false), false);
  assert.equal(plans[2].dueAt, 3250);
});

test('later walls include corners and avoid snake, forward path, and full pickup footprints', () => {
  let corners = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const random = seeded(seed);
    const existing = generateWalls({ size: 32, count: 4, random });
    const reserved = [
      { x: 15, y: 16, padding: 2 }, { x: 21, y: 16, padding: 1 },
      { x: 7, y: 6, width: 2, height: 2 }, { x: 10.4, y: 8 },
    ];
    const added = generateWalls({ size: 32, count: 3, existing, reserved, corners: true, random });
    assert.equal(added.length, 3);
    for (const wall of added) {
      assert.ok(wallIsClear(wall, reserved));
      if (wall.parts.length === 2) corners++;
      for (const p of wall.cells)
        assert.ok(existing.flatMap((w) => w.cells).every((q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) > 2));
    }
  }
  assert.ok(corners > 0);
  // Revalidation catches objects entering a previously safe warning outline.
  const wall = { cells: [{ x: 15, y: 16 }] };
  assert.equal(wallIsClear(wall, [{ x: 13, y: 16, padding: 2 }]), false);
  assert.equal(wallIsClear(wall, [{ x: 5, y: 16, padding: 2 }]), true);
});

test('crowded boards return safely without forcing unsafe walls', () => {
  assert.deepEqual(generateWalls({ size: 32, count: 3, corners: true,
    reserved: [{ x: 0, y: 0, width: 32, height: 32 }], random: seeded(1) }), []);
});

test('regular food lasts longer than large food and crit gems last 7.5 seconds', () => {
  assert.equal(regularFoodLifetimeMs, 15000);
  assert.ok(regularFoodLifetimeMs > largeFoodLifetime * interval);
  assert.equal(buffTypes.critRate.lifetime * interval, 7500);
  assert.equal(buffTypes.critMultiplier.lifetime * interval, 7500);
});

test('walls materialize smoothly only after warning, and fade back when safety changes', () => {
  const entry = { born: 0 };
  advanceWallAppearance(entry, 0, true);
  assert.equal(advanceWallAppearance(entry, 1499, true), false);
  assert.equal(entry.appearance, 0);
  advanceWallAppearance(entry, 1500, true);
  for (let t = 1600; t <= 1800; t += 100) assert.equal(advanceWallAppearance(entry, t, true), false);
  const forming = entry.appearance;
  assert.ok(forming > 0 && forming < 1);
  assert.equal(advanceWallAppearance(entry, 1900, false), false);
  assert.ok(entry.appearance < forming);
  for (let t = 2000; t <= 2600; t += 100) advanceWallAppearance(entry, t, false);
  assert.equal(entry.appearance, 0);
  for (let t = 2700; t <= 3200; t += 100) assert.equal(advanceWallAppearance(entry, t, true), false);
  assert.equal(advanceWallAppearance(entry, 3250, true), true);
  assert.equal(entry.appearance, 1);
});

test('a stalled frame cannot skip straight from outline to solid wall', () => {
  const entry = { born: 0 };
  advanceWallAppearance(entry, 1500, true);
  assert.equal(advanceWallAppearance(entry, 60000, true), false);
  assert.ok(entry.appearance < 1);
});


test('forming walls protect occupied cells but ignore nearby objects and forward paths', () => {
  const state = { snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }],
    previousSnake: [{ x: 9, y: 10 }, { x: 8, y: 10 }],
    direction: { x: 1, y: 0 }, queuedDirection: null,
    food: { x: 20.4, y: 20 }, bonusFood: { x: 25, y: 25 }, buffs: [] };
  const clear = (x, y) => wallIsClear({ cells: [{ x, y }] }, wallActivationReservations(state));
  assert.equal(clear(9, 11), true); // Adjacent body.
  assert.equal(clear(8, 10), false); // Interpolating departing tail.
  assert.equal(clear(11, 10), true); // Immediately ahead, still unoccupied.
  assert.equal(clear(16, 10), true); // Heading toward a wall does not delay it.
  assert.equal(clear(17, 10), true);
  assert.equal(clear(15, 11), true); // Beside the path.
  assert.equal(clear(20, 20), false); // Fractional moving-food overlap.
  assert.equal(clear(21, 20), false);
  assert.equal(clear(22, 20), true);
  assert.equal(clear(26, 26), false); // Full large-food footprint.
  assert.equal(clear(27, 26), true);
  const crossing = { wall: { cells: [{ x: 11, y: 10 }] }, born: 0, appearance: 0.99,
    lastAppearanceAt: 2000 };
  state.snake.unshift({ x: 11, y: 10 });
  assert.equal(advanceWallAppearance(crossing, 2050,
    wallIsClear(crossing.wall, wallActivationReservations(state))), false);
  assert.ok(crossing.appearance < 0.99); // A last-moment crossing prevents solidity.
  state.snake.shift();
  assert.equal(advanceWallAppearance(crossing, 2150,
    wallIsClear(crossing.wall, wallActivationReservations(state))), true);
  state.queuedDirection = { x: 0, y: -1 };
  assert.equal(clear(15, 10), true); // Turning away clears the old heading.
  assert.equal(clear(10, 4), true);
  state.queuedDirection = { x: 0, y: 1 };
  assert.equal(clear(10, 16), true);
  state.queuedDirection = { x: -1, y: 0 };
  assert.equal(clear(4, 10), true);
});

test('L outlines follow only the union perimeter in every orientation', () => {
  for (const horizontal of [false, true]) for (const sign of [-1, 1]) {
    const wall = { parts: horizontal
      ? [{ x: 4, y: 4, width: 4, height: 1 },
        { x: 4, y: sign < 0 ? 1 : 4, width: 1, height: 4 }]
      : [{ x: 4, y: 4, width: 1, height: 4 },
        { x: sign < 0 ? 1 : 4, y: 4, width: 4, height: 1 }] };
    const loops = wallOutline(wall);
    assert.equal(loops.length, 1);
    let area = 0, perimeter = 0;
    const loop = loops[0];
    loop.forEach(([x, y], i) => {
      const [nx, ny] = loop[(i + 1) % loop.length];
      area += x * ny - nx * y;
      perimeter += Math.abs(nx - x) + Math.abs(ny - y);
    });
    assert.equal(Math.abs(area) / 2, 7);
    assert.equal(perimeter, 16); // Separate rectangles would include interior seams.
    assert.equal(wallOutline(wall, 2 / 30).length, 1);
  }
});


test('expired food becomes a permanent single-cell wall only after three solid walls', () => {
  const solid = [0, 1, 2].map(x => ({ cells: [{ x, y: 0 }] }));
  assert.equal(expiredFoodWall({ x: 10, y: 12 }, solid.slice(0, 2), 32), null);
  const staticWall = expiredFoodWall({ x: 10, y: 12 }, solid, 32);
  assert.deepEqual(staticWall.cells, [{ x: 10, y: 12 }]);
  assert.deepEqual(expiredFoodWall({ x: 10.7, y: 12.1 }, solid, 32).cells,
    [{ x: 11, y: 12 }]);
  assert.equal(expiredFoodWall({ x: 0, y: 0 }, solid, 32), null);
  const full = Array.from({ length: 15 }, () => solid[0]);
  const extras = Array.from({ length: 20 }, () => staticWall);
  assert.equal(milestoneWallCount([...full, ...extras]), 15);
  assert.equal(milestoneWallCount([...solid, ...extras]), 3);
  const plans = scheduleWallPlans([{ count: 3, corners: true }], [],
    milestoneWallCount([...solid, ...extras]), 0, -Infinity, () => 0);
  assert.equal(plans.length, 3);
  assert.equal(wallIsClear(staticWall, [{ x: 10, y: 12, padding: 0 }]), false);
});

test('expired-food walls fade immediately but still wait for a crossing snake', () => {
  const entry = { born: 0, warningMs: 0 };
  advanceWallAppearance(entry, 0, true);
  advanceWallAppearance(entry, 100, true);
  assert.ok(entry.appearance > 0);
  advanceWallAppearance(entry, 200, false);
  assert.equal(entry.appearance, 0);
  for (let t = 300; t <= 800; t += 100)
    assert.equal(advanceWallAppearance(entry, t, true), false);
  assert.equal(advanceWallAppearance(entry, 850, true), true);
});
