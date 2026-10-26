// Snake-specific settings; shared utilities know nothing about these rules.
export const size = 32;
export const interval = 80;
export const gameVersion = 'beta-6';
export const minimumSnakeLength = 5;
export const normalFoodWarmup = 5;
export const largeFoodLifetime = 125; // Ten seconds of active play.
export const regularFoodLifetimeMs = 15000;
export const wallScoreInterval = 50;
export const wallMilestoneDriftMs = [250, 750];
export const wallSpawnGapMs = [1500, 2500];
export const wallLimit = 15;
export const wallWarningMs = 1500;
export const wallMaterializeMs = 650;
export const foodTravelTicks = 6;
export const magnetRadius = 6;
export const magnetFlightMs = 400;
export const temporarySpawnTiming = {
  initial: [14000, 24000],
  gap: [5000, 10000],
  quietGap: [12000, 18000],
  quietChance: 0.25,
  retry: [1000, 2000],
};
export const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const keys = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};
export const spawnIntervals = {
  large: [6000, 12000],
  shortener: [8000, 14000],
  extender: [10000, 16000],
  critRate: [24000, 36000],
  critMultiplier: [30000, 44000],
};
export const buffTypes = {
  shortener: { color: '#2878bd', lifetime: 125, segments: 5 },
  extender: { color: '#d94848', lifetime: 125, segments: 5 },
  critRate: { color: '#8951c8', lifetime: 7500 / interval },
  critMultiplier: { color: '#c46a12', lifetime: 7500 / interval },
  speedUp: { color: '#c74e36', lifetime: 8000 / interval, durationMs: 3000,
    label: 'Speed up!', icon: 'M4 5L11 12L4 19M13 5L20 12L13 19' },
  slowDown: { color: '#267fb1', lifetime: 8000 / interval, durationMs: 3000,
    label: 'Slow down!', icon: 'M7 4H17V7L13 12L17 17V20H7V17L11 12L7 7Z' },
  reverse: { color: '#a451ac', lifetime: 8000 / interval, durationMs: 10000,
    label: 'Reverse!', icon: 'M5 9H19L16 6M19 15H5L8 18' },
  magnet: { color: '#138b87', lifetime: 8000 / interval, durationMs: 10000,
    label: 'Magnet!', iconStrokeWidth: 2,
    icon: 'M5 4H9V12A3 3 0 0 0 15 12V4H19V12A7 7 0 0 1 5 12ZM5 8H9M15 8H19',
    iconOffsetY: 0.5 },
};

export function getPalette(dark) {
  return dark
    ? { board: '#202931', wall: '#8596a5', body: '#68b58b', head: '#a0d9b7', food: '#efbf58' }
    : { board: '#fff', wall: '#64717e', body: '#39845f', head: '#194832', food: '#b57918' };
}
