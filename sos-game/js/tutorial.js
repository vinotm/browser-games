import { createGuideScene } from '../../shared/js/tutorial.js';
const scene = (label, markup) => () => createGuideScene(label, markup);
const cell = (x, y, letter, muted = false, size = 42) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="3" class="demo-cell ${muted ? 'demo-muted' : ''}"/><text x="${x + size / 2}" y="${y + size / 2}" dominant-baseline="central" class="demo-letter ${letter === 'S' ? 'demo-s' : 'demo-o'} ${muted ? 'demo-muted' : ''}">${letter}</text>`;
let cross = '';
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
  cross += cell(72 + x * 34, 9 + y * 34, x === 1 && y === 1 ? 'O' : 'S', false, 32);
}
const limit = (y, letter, other) => `${cell(44, y, letter, false, 32)}${cell(80, y, letter, false, 32)}<path d="M132 ${y + 16}h28m-8-7 8 7-8 7" class="demo-arrow"/>${cell(188, y, letter, true, 32)}<path d="M193 ${y + 5}l22 22m0-22-22 22" class="demo-block"/>${cell(244, y, other, false, 32)}`;
export const tutorialPages = [
  { title: 'Choose S or O to make SOS',
    visual: scene('SOS scores one point', `${cell(58, 39, 'S')}${cell(102, 39, 'O')}${cell(146, 39, 'S')}<path d="M72 60h102" class="demo-strike"/><text x="228" y="60" dominant-baseline="central" class="demo-score">+1</text>`),
    caption: 'Horizontal, vertical, or diagonal. Score to play again.' },
  { title: 'Score each new SOS',
    visual: scene('The center O completes four SOS lines', `${cross}<path d="M88 59h68M122 25v68M88 25l68 68M88 93l68-68" class="demo-strike"/><text x="212" y="59" dominant-baseline="central" class="demo-score">+4</text>`),
    caption: 'Letters can be reused in other lines.' },
  { title: 'Same letter: twice in a row',
    visual: scene('After SS use O; after OO use S', `${limit(12, 'S', 'O')}${limit(76, 'O', 'S')}`),
    caption: 'The limit applies separately to each player.' },
];
