import { wallOutline } from './walls.js?v=beta-public-1';
import { size, interval, largeFoodLifetime, regularFoodLifetimeMs, wallWarningMs, magnetRadius, magnetFlightMs, buffTypes } from './config.js?v=beta-public-1';
import { effectActive, pickupDistance, reverseStatusOpacity } from './effects.js?v=beta-public-1';

// Rendering is separate from placement, collision, scoring, and session controls.
export function createSnakeRenderer({ canvas, motionPreference, gameTime, foodPosition }) {
  const context = canvas.getContext('2d');
  const tile = canvas.width / size;
  const wallPaths = new WeakMap();
  let snake, previousSnake, walls, pendingWalls, food, foodBorn, bonusFood, bonusLife, bonusBorn,
    buffs, timedEffects, magnetFlights, shortenRemaining, extendRemaining, shortenEffect, extendEffect,
    scorePopups, progress, palette;

function pickupVisual(born, life, lifetime) {
  if (motionPreference.matches) return { scale: 1, opacity: 1 };
  const age =
    born === null || born === undefined
      ? (lifetime - life + progress) * interval
      : gameTime() - born;
  const remaining = Math.max(0, lifetime * interval - age);
  const fraction = Math.max(0, Math.min(1, age / 450, remaining / 600));
  const smooth = fraction * fraction * (3 - 2 * fraction);
  return { scale: 0.08 + 0.92 * smooth, opacity: Math.min(1, remaining / 100) };
}

function draw(snapshot, deathProgress = 0) {
  ({ snake, previousSnake, walls, pendingWalls, food, foodBorn, bonusFood, bonusLife, bonusBorn,
    buffs, timedEffects, magnetFlights, shortenRemaining, extendRemaining, shortenEffect, extendEffect,
    scorePopups, progress, palette } = snapshot);
  drawBoard();
  const points = drawSnake(deathProgress);
  drawTimedEffects(points);
  drawRegularFood();
  drawLargeFood();
  drawBuffs();
  drawMagnetFlights(points[0]);
  drawLengthEffects(points[0]);
  drawScorePopups();
  drawDeathParticles(points[0], deathProgress);
  return { shortenEffect, extendEffect, scorePopups, magnetFlights };
}

function wallPath(wall) {
  if (!wallPaths.has(wall)) {
    const path = new Path2D();
    for (const loop of wallOutline(wall, 2 / tile)) {
      loop.forEach(([x, y], i) => i === 0
        ? path.moveTo(x * tile, y * tile) : path.lineTo(x * tile, y * tile));
      path.closePath();
    }
    wallPaths.set(wall, path);
  }
  return wallPaths.get(wall);
}

function fillWall(wall) {
  context.fill(wallPath(wall));
}

function drawBoard() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = palette.board;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = palette.wall;
  for (const wall of walls) fillWall(wall);
  context.save();
  context.strokeStyle = palette.wall;
  context.lineWidth = 2;
  context.setLineDash([5, 4]);
  for (const entry of pendingWalls) {
    const age = Math.max(0, gameTime() - entry.born);
    const amount = entry.appearance ?? 0;
    const smooth = amount * amount * (3 - 2 * amount);
    context.globalAlpha = (0.3 + 0.3 * Math.min(1, age / wallWarningMs)) * (1 - smooth);
    context.stroke(wallPath(entry.wall));
    context.globalAlpha = smooth;
    fillWall(entry.wall);
  }
  context.restore();
}

function drawSnake(deathProgress) {
  const amount = motionPreference.matches ? 1 : progress;
  // Keep the body's route fixed through turns; only advance its two ends.
  const mix = (a, b) => ({
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  });
  const growing = snake.length > previousSnake.length;
  const moving =
    snake[0].x !== previousSnake[0].x || snake[0].y !== previousSnake[0].y;
  const shrinking = snake.length < previousSnake.length;
  const route = shrinking
    ? [...snake, mix(previousSnake.at(-1), snake.at(-1))]
    : moving
      ? [
          mix(previousSnake[0], snake[0]),
          ...previousSnake.slice(0, -1),
          growing
            ? previousSnake.at(-1)
            : mix(
                previousSnake.at(-1),
                previousSnake.at(-2) || previousSnake.at(-1),
              ),
        ]
      : snake;
  const points = route.map((p) => ({
    x: (p.x + 0.5) * tile,
    y: (p.y + 0.5) * tile,
  }));
  context.globalAlpha = 1 - deathProgress * 0.45;
  context.strokeStyle = deathProgress > 0 ? '#a6483f' : palette.body;
  context.lineWidth = tile * 0.82;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  points.forEach((point, i) =>
    i === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y),
  );
  context.stroke();
  context.fillStyle = deathProgress > 0 ? '#a6483f' : palette.head;
  context.beginPath();
  context.arc(points[0].x, points[0].y, tile * 0.43, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
  return points;
}

function drawRegularFood() {
  if (food) {
    const remaining = regularFoodLifetimeMs - (gameTime() - foodBorn);
    const fade = Math.max(0, Math.min(1, remaining / 600));
    context.globalAlpha = motionPreference.matches ? 1 : fade;
    context.fillStyle = palette.food;
    context.beginPath();
    const position = foodPosition();
    context.arc(
      (position.x + 0.5) * tile,
      (position.y + 0.5) * tile,
      tile * 0.32 * (motionPreference.matches ? 1 : 0.15 + 0.85 * fade),
      0,
      Math.PI * 2,
    );
    context.fill();
    context.globalAlpha = 1;
  }
}

function drawLargeFood() {
  if (bonusFood) {
    // Use active game time so the pulse freezes when paused.
    const age = Math.max(0, gameTime() - bonusBorn) / 1000;
    const urgentAge = Math.max(0, age - 7);
    // Integrating the increasing frequency avoids a jump at the warning phase.
    const phase = Math.PI * 2 * (age / 1.8 + (urgentAge * urgentAge) / 4);
    const pulse = motionPreference.matches ? 1 : (1 + Math.cos(phase)) / 2;
    const urgency = Math.min(1, urgentAge / 3);
    const depth = motionPreference.matches ? 0 : 0.3 + urgency * 0.4;
    // Two beats per cycle, at a constant tempo even near expiry.
    const beatPhase = (age % 1.15) / 1.15;
    const beat = motionPreference.matches
      ? 0
      : Math.exp(-Math.pow((beatPhase - 0.16) / 0.07, 2)) +
        0.65 * Math.exp(-Math.pow((beatPhase - 0.36) / 0.09, 2));
    const visual = pickupVisual(bonusBorn, bonusLife, largeFoodLifetime);
    const radius = tile * (0.8 + beat * 0.17) * visual.scale;
    const x = (bonusFood.x + 1) * tile,
      y = (bonusFood.y + 1) * tile;
    context.beginPath();
    context.arc(
      x,
      y,
      radius + tile * (0.14 + pulse * 0.12) * visual.scale,
      0,
      Math.PI * 2,
    );
    context.fillStyle = palette.food;
    context.globalAlpha =
      (0.1 + pulse * (0.2 + urgency * 0.12)) * visual.opacity;
    context.fill();
    context.globalAlpha = (1 - depth * (1 - pulse)) * visual.opacity;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.food;
    context.fill();
    context.globalAlpha = 1;
  }
}

function drawBuffs() {
  for (const buff of buffs) {
    const x = (buff.x + 1) * tile,
      y = (buff.y + 1) * tile;
    const visual = pickupVisual(
      buff.born,
      buff.life,
      buffTypes[buff.type].lifetime,
    );
    const unit = tile * visual.scale;
    const urgent = buff.life < 38;
    const pulse = motionPreference.matches
      ? 1
      : (1 + Math.cos(gameTime() / (urgent ? 150 : 400))) / 2;
    context.globalAlpha = (0.7 + pulse * 0.3) * visual.opacity;
    drawBuffBody(buff.type, x, y, unit);
    context.globalAlpha = 1;
  }
}

function drawBuffBody(type, x, y, unit) {
  context.fillStyle = buffTypes[type].color;
  context.beginPath();
  const isCrit = type === 'critRate' || type === 'critMultiplier';
  if (isCrit) {
    // Gem silhouettes distinguish crit upgrades from round length pickups.
    context.moveTo(x, y - unit);
    context.lineTo(x + unit, y);
    context.lineTo(x, y + unit);
    context.lineTo(x - unit, y);
    context.closePath();
  } else if (buffTypes[type].icon) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 3 * i - Math.PI / 6;
      const px = x + Math.cos(angle) * unit, py = y + Math.sin(angle) * unit;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  } else context.arc(x, y, unit * 0.85, 0, Math.PI * 2);
  context.fill();
  if (isCrit) {
    context.strokeStyle = '#fff';
    context.lineWidth = unit * 0.06;
    context.stroke();
    drawCritSymbol(type, x, y, unit * 0.58);
    return;
  }
  if (buffTypes[type].icon) {
    context.strokeStyle = '#fff';
    context.lineWidth = unit * 0.05;
    context.stroke();
    drawItemIcon(type, x, y, unit * 0.65);
    return;
  }
  // Minus and plus signs distinguish helpful and harmful length pickups.
  context.fillStyle = '#fff';
  context.fillRect(x - unit * 0.4, y - unit * 0.07, unit * 0.8, unit * 0.14);
  if (type === 'extender')
    context.fillRect(
      x - unit * 0.07,
      y - unit * 0.4,
      unit * 0.14,
      unit * 0.8,
    );

}

function drawMagnetFlights(head) {
  const now = gameTime();
  magnetFlights = magnetFlights.filter((flight) => now - flight.born < magnetFlightMs);
  if (motionPreference.matches) return;
  context.save();
  for (const flight of magnetFlights) {
    const age = Math.max(0, Math.min(1, (now - flight.born) / magnetFlightMs));
    const amount = 1 - Math.pow(1 - age, 3);
    const from = { x: (flight.x + flight.width / 2) * tile, y: (flight.y + flight.width / 2) * tile };
    const curve = Math.sin(Math.PI * age) * tile * 0.7;
    const x = from.x + (head.x - from.x) * amount + curve;
    const y = from.y + (head.y - from.y) * amount - curve;
    const unit = tile * (1 - 0.7 * amount);
    context.globalAlpha = 1 - 0.25 * age;
    if (flight.type === 'food' || flight.type === 'large') {
      context.fillStyle = palette.food;
      context.beginPath();
      context.arc(x, y, unit * (flight.width === 1 ? 0.32 : 0.8), 0, Math.PI * 2);
      context.fill();
    } else drawBuffBody(flight.type, x, y, unit);
  }
  context.restore();
}

function drawItemIcon(type, x, y, radius) {
  context.save();
  context.translate(x, y);
  context.scale(radius / 12, radius / 12);
  context.translate(-12, -12);
  context.strokeStyle = '#fff';
  context.lineWidth = 2.5;
  context.lineCap = context.lineJoin = 'round';
  context.stroke(new Path2D(buffTypes[type].icon));
  context.restore();
}

function drawTimedEffects(points) {
  const now = gameTime();
  const head = points[0];
  context.save();
  if (effectActive(timedEffects, 'speedUp', now)) {
    context.fillStyle = buffTypes.speedUp.color;
    for (let i = 1; i < Math.min(points.length, 5); i++) {
      context.globalAlpha = 0.65 / i;
      context.beginPath();
      context.arc(points[i].x, points[i].y, tile * (0.5 + i * 0.1), 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 0.9;
    context.strokeStyle = buffTypes.speedUp.color;
    context.lineWidth = tile * 0.12;
    context.beginPath();
    context.arc(head.x, head.y, tile * 0.6, 0, Math.PI * 2);
    context.stroke();
  }
  if (effectActive(timedEffects, 'slowDown', now)) {
    context.strokeStyle = buffTypes.slowDown.color;
    context.lineWidth = tile * 0.08;
    context.globalAlpha = 0.85;
    for (const radius of [0.65, 0.95]) {
      context.beginPath();
      context.arc(head.x, head.y, tile * radius, 0, Math.PI * 2);
      context.stroke();
    }
  }
  if (effectActive(timedEffects, 'reverse', now)) {
    const x = Math.max(tile, Math.min(canvas.width - tile, head.x));
    const y = Math.max(tile, head.y - tile * 1.6);
    context.globalAlpha = reverseStatusOpacity(timedEffects, now, motionPreference.matches);
    context.fillStyle = buffTypes.reverse.color;
    context.beginPath();
    context.arc(x, y, tile * 0.7, 0, Math.PI * 2);
    context.fill();
    drawItemIcon('reverse', x, y, tile * 0.55);
  }
  if (effectActive(timedEffects, 'magnet', now)) {
    const radius = magnetRadius * tile;
    context.fillStyle = buffTypes.magnet.color;
    context.globalAlpha = 0.045;
    context.beginPath();
    context.arc(head.x, head.y, radius, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.65;
    context.strokeStyle = buffTypes.magnet.color;
    context.lineWidth = tile * 0.065;
    context.setLineDash([tile * 0.25, tile * 0.3]);
    context.lineDashOffset = motionPreference.matches ? 0 : -now / 35;
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 0.3;
    const pickups = [
      { position: foodPosition(), width: 1 },
      { position: bonusFood, width: 2 },
      ...buffs.map((position) => ({ position, width: 2 })),
    ];
    const gridHead = { x: head.x / tile - 0.5, y: head.y / tile - 0.5 };
    for (const { position, width } of pickups) {
      if (!position || pickupDistance(gridHead, position, width) > magnetRadius) continue;
      context.beginPath();
      context.moveTo(head.x, head.y);
      context.lineTo((position.x + width / 2) * tile, (position.y + width / 2) * tile);
      context.stroke();
    }
  }
  context.restore();
}

function drawCritSymbol(type, x, y, radius) {
  context.fillStyle = '#fff';
  context.beginPath();
  if (type === 'critRate') {
    // Four-point sparkle: luck / chance.
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 4;
      const r = i % 2 === 0 ? radius : radius * 0.3;
      const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
      if (i === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
  } else {
    // Lightning bolt: critical power.
    context.moveTo(x + radius * 0.2, y - radius);
    context.lineTo(x - radius * 0.7, y + radius * 0.15);
    context.lineTo(x - radius * 0.05, y + radius * 0.15);
    context.lineTo(x - radius * 0.2, y + radius);
    context.lineTo(x + radius * 0.7, y - radius * 0.15);
    context.lineTo(x + radius * 0.05, y - radius * 0.15);
  }
  context.closePath();
  context.fill();
}

function drawLengthEffects(head) {
  for (const [type, effect, remaining] of [
    ['shortener', shortenEffect, shortenRemaining],
    ['extender', extendEffect, extendRemaining],
  ]) {
    if (!effect) continue;
    const age = (gameTime() - effect.born) / 1000;
    if (remaining > 0 || age < 0.9) {
      const wave = motionPreference.matches ? 0 : (gameTime() % 400) / 400;
      context.strokeStyle = buffTypes[type].color;
      context.lineWidth = tile * 0.09;
      context.globalAlpha = motionPreference.matches ? 0.7 : 0.8 * (1 - wave);
      context.beginPath();
      context.arc(head.x, head.y, tile * (0.55 + wave * 0.65), 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    } else if (type === 'shortener') shortenEffect = null;
    else extendEffect = null;
  }
}

function drawScorePopups() {
  const popupTime = gameTime();
  const lifetime = popup => popup.critical || popup.text ? 1200 : 900;
  scorePopups = scorePopups.filter((p) => popupTime - p.born < lifetime(p));
  context.save();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const popup of scorePopups) {
    const age = Math.max(0, (popupTime - popup.born) / lifetime(popup));
    const rise = motionPreference.matches ? 0 : tile * 0.8 * age;
    const fontSize = popup.critical ? 48 : popup.text ? 36 : 34;
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const text = popup.text || `+${popup.value}${popup.critical ? '!' : ''}`;
    const margin = context.measureText(text).width / 2 + 8;
    const x = Math.max(margin, Math.min(canvas.width - margin, (popup.x + 0.5) * tile));
    const y = Math.max(fontSize, (popup.y + 0.5) * tile - tile * 0.7 - rise);
    context.fillStyle = popup.color || palette.head;
    context.globalAlpha = 1 - age;
    if (popup.critical || popup.buffType) {
      // Brief rays make crits and upgrades visible without exposing stats.
      const radius = tile * (motionPreference.matches ? 0.9 : 0.7 + age * 1.3);
      context.strokeStyle = context.fillStyle;
      context.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        context.beginPath();
        context.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
        context.lineTo(x + Math.cos(angle) * (radius + 8), y + Math.sin(angle) * (radius + 8));
        context.stroke();
      }
      // Contrast outline keeps labels legible over the snake and pickups.
      context.strokeStyle = palette.board;
      context.lineWidth = 5;
      context.strokeText(text, x, y);
    }
    context.fillText(text, x, y);
  }
  context.restore();
}

function drawDeathParticles(head, deathProgress) {
  if (deathProgress > 0 && deathProgress < 1 && !motionPreference.matches) {
    context.fillStyle = '#a6483f';
    context.globalAlpha = 1 - deathProgress;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5,
        radius = tile * (1 + deathProgress * 3);
      context.beginPath();
      context.arc(
        head.x + Math.cos(angle) * radius,
        head.y + Math.sin(angle) * radius,
        tile * 0.12,
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    context.globalAlpha = 1;
  }
}

  return { draw };
}
