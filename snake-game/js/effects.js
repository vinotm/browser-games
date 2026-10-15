import { interval, buffTypes } from './config.js?v=beta-public-1';

export function createTimedEffects() {
  return { speedUp: 0, slowDown: 0, reverse: 0, magnet: 0 };
}

export function effectActive(effects, type, now) {
  return effects[type] > now;
}

// Same speed refreshes; opposing speed cancels both, without starting a new effect.
export function collectTimedEffect(effects, type, now) {
  const other = type === 'speedUp' ? 'slowDown' : type === 'slowDown' ? 'speedUp' : null;
  if (other && effectActive(effects, other, now)) {
    effects.speedUp = effects.slowDown = 0;
    return 'cancelled';
  }
  if (other) effects[other] = 0;
  effects[type] = now + buffTypes[type].durationMs;
  return 'activated';
}

export function movementInterval(effects, now, base = interval) {
  if (effectActive(effects, 'speedUp', now)) return base * 0.75;
  if (effectActive(effects, 'slowDown', now)) return base * 1.375;
  return base;
}

export function reverseStatusOpacity(effects, now, reducedMotion = false) {
  const remaining = effects.reverse - now;
  if (remaining <= 0) return 0;
  if (remaining > 3000 || reducedMotion) return 0.95;
  // Gentle pulses speed up during the last second; never a full on/off flash.
  const period = remaining <= 1000 ? 400 : 800;
  return 0.35 + 0.6 * (0.5 + 0.5 * Math.cos(2 * Math.PI * remaining / period));
}

export function controlDirection(name, effects, now) {
  if (!effectActive(effects, 'reverse', now)) return name;
  return { left: 'right', right: 'left', up: 'down', down: 'up' }[name] || name;
}

export function pickupDistance(head, position, width = 1) {
  return Math.hypot(head.x - position.x - (width - 1) / 2,
    head.y - position.y - (width - 1) / 2);
}

