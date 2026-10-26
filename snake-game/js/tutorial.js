import { createGuideScene } from '../../shared/js/tutorial.js';
import { buffTypes } from './config.js';
const scene = (label, markup) => () => createGuideScene(label, markup);
const label = (x, text) => `<text x="${x}" y="103" class="demo-label">${text}</text>`;
// Match the pickup shapes in renderer.js; icon paths and colors come from config.js.
function pickup(type, x, y, radius = 26) {
  const item = buffTypes[type];
  let body, symbol;
  if (type === 'critRate' || type === 'critMultiplier') {
    body = `<path d="M0 -${radius} ${radius} 0 0 ${radius} -${radius} 0Z" fill="${item.color}"/>`;
    if (type === 'critRate') {
      const points = Array.from({ length: 8 }, (_, i) => {
        const a = -Math.PI / 2 + i * Math.PI / 4, r = radius * .58 * (i % 2 ? .3 : 1);
        return `${Math.cos(a) * r},${Math.sin(a) * r}`;
      }).join(' ');
      symbol = `<polygon points="${points}" fill="white"/>`;
    } else symbol = '<path d="M3 -15 -11 2H-1L-3 15 11 -2H1Z" fill="white"/>';
  } else if (item.icon) {
    const points = Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 3 * i - Math.PI / 6;
      return `${Math.cos(a) * radius},${Math.sin(a) * radius}`;
    }).join(' ');
    body = `<polygon points="${points}" fill="${item.color}"/>`;
    symbol = `<g transform="scale(${radius * .65 / 12}) translate(-12 ${-12 + (item.iconOffsetY || 0)})"><path d="${item.icon}" fill="none" stroke="white" stroke-width="${item.iconStrokeWidth || 2.5}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  } else {
    body = `<circle r="${radius * .85}" fill="${item.color}"/>`;
    symbol = `<path d="M-11 0H11${type === 'extender' ? 'M0 -11V11' : ''}" stroke="white" stroke-width="4"/>`;
  }
  return `<g transform="translate(${x} ${y})">${body}${symbol}</g>`;
}
export const tutorialPages = [
  { title: 'Controls',
    visual: scene('Snake approaching food', '<path d="M36 92V52H100V76H148" class="demo-snake"/><circle cx="156" cy="76" r="12" class="demo-head"/><circle cx="160" cy="72" r="2" fill="white"/><path d="M192 76h28m-8-7 8 7-8 7" class="demo-arrow"/><circle cx="264" cy="76" r="9" class="demo-food"/>'),
    caption: 'Eat food to grow. Steer with arrows, WASD, or swipes.' },
  { title: 'Walls',
    visual: scene('A dotted outline becomes a solid wall', '<rect x="44" y="32" width="64" height="56" rx="2" class="demo-warning"/><path d="M138 60h44m-8-7 8 7-8 7" class="demo-arrow"/><rect x="212" y="32" width="64" height="56" rx="2" class="demo-wall"/>'),
    caption: 'Avoid edges, walls, and your body. Dotted outlines warn of new walls.' },
  { title: 'Combo',
    visual: scene('Consecutive food increases the combo', '<circle cx="104" cy="28" r="9" class="demo-food"/><circle cx="160" cy="28" r="9" class="demo-food"/><circle cx="216" cy="28" r="9" class="demo-food"/><text x="160" y="95" class="demo-score">Combo 3!</text>'),
    caption: 'Eat food in succession to increase the combo and earn more points.' },
  { title: 'Food',
    visual: scene('Normal food, moving food, and large food', `<circle cx="64" cy="49" r="9" class="demo-food"/><circle cx="160" cy="49" r="9" class="demo-food"/><path d="M130 49h-20m8-6-8 6 8 6M190 49h20m-8-6 8 6-8 6" class="demo-arrow"/><circle cx="256" cy="49" r="20" class="demo-food"/>${label(64, 'Normal')}${label(160, 'Moving')}${label(256, 'Large')}`),
    caption: 'Food grows the snake. Moving and large food give more points.' },
  { title: 'Length',
    visual: scene('Blue minus shortens the snake; red plus makes it longer', `${pickup('shortener', 86, 43)}${pickup('extender', 234, 43)}${label(86, 'Shorter')}${label(234, 'Longer')}`),
    caption: 'Shortener removes tail segments. Extender adds them.' },
  { title: 'Critical hits',
    visual: scene('Purple sparkle increases critical chance; orange lightning increases critical bonus points', `${pickup('critRate', 86, 43)}${pickup('critMultiplier', 234, 43)}${label(86, 'More critical hits')}${label(234, 'Bigger point bonus')}`),
    caption: 'Critical hits give bonus points.' },
  { title: 'Speed',
    visual: scene('Speed up and slow down pickups', `${pickup('speedUp', 86, 43)}${pickup('slowDown', 234, 43)}${label(86, 'Faster')}${label(234, 'Slower')}`),
    caption: 'Speed changes temporarily. Opposite speed items cancel each other.' },
  { title: 'Reverse',
    visual: scene('Reverse pickup swaps opposite directions', `${pickup('reverse', 60, 60)}<text x="206" y="45" class="demo-label">Up ↔ Down</text><text x="206" y="86" class="demo-label">Left ↔ Right</text>`),
    caption: 'Controls switch to the opposite direction.' },
  { title: 'Magnet',
    visual: scene('Magnet collects nearby food and items', `${pickup('magnet', 60, 60)}<circle cx="202" cy="60" r="13" class="demo-head"/><circle cx="270" cy="25" r="9" class="demo-food"/>${pickup('extender', 270, 95, 16)}<path d="M250 30l-24 16m3-10-3 10 10 1M250 90l-24-16m3 10-3-10 10-1" class="demo-arrow"/>`),
    caption: 'Collects nearby food and items, including harmful ones.' },
];
