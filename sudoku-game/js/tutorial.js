import { createGuideScene } from '../../shared/js/tutorial.js';
const scene = (label, markup) => () => createGuideScene(label, markup);
const cell = (x, text, extra = '') => `<rect x="${x}" y="30" width="60" height="60" rx="4" class="demo-cell ${extra}"/><text x="${x + 30}" y="60" dominant-baseline="central" class="demo-digit">${text}</text>`;
const solution = '123456789456789123789123456234567891567891234891234567345678912678912345912345678';
function grid(highlight) {
  let art = '<rect x="106" y="2" width="108" height="108" class="demo-cell"/>';
  const areas = { row: [106, 38, 108, 12], column: [154, 2, 12, 108], box: [142, 38, 36, 36] };
  const [x, y, w, h] = areas[highlight];
  art += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="demo-highlight"/>`;
  for (let i = 0; i <= 9; i++) art += `<path d="M${106 + i * 12} 2v108M106 ${2 + i * 12}h108" class="demo-grid" stroke-width="${i % 3 === 0 ? 1.5 : .4}"/>`;
  for (let i = 0; i < 81; i++) {
    const row = Math.floor(i / 9), column = i % 9;
    const visible = highlight === 'row' ? row === 3 : highlight === 'column' ? column === 4 : row >= 3 && row < 6 && column >= 3 && column < 6;
    if (visible) art += `<text x="${112 + column * 12}" y="${8 + row * 12}" dominant-baseline="central" class="demo-tiny">${solution[i]}</text>`;
  }
  return art;
}
function gridScene(label, highlight) {
  return () => {
    const svg = createGuideScene(label, grid(highlight));
    // Square artwork uses the available height without the wide scene's gutters.
    // Leave room around the outer stroke so the grid never touches its bounds.
    svg.setAttribute('viewBox', '104 0 112 112');
    svg.classList.add('sudoku-guide-grid');
    return svg;
  };
}
export const tutorialPages = [
  { title: 'Each row', visual: gridScene('A row contains one of every digit from one to nine', 'row'), caption: 'Use 1–9 once. No repeats.' },
  { title: 'Each column', visual: gridScene('A column contains one of every digit from one to nine', 'column'), caption: 'Use 1–9 once. No repeats.' },
  { title: 'Each 3 × 3 box', visual: gridScene('A box contains one of every digit from one to nine', 'box'), caption: 'Use 1–9 once. No repeats.' },
  { title: 'Choose a cell, then a number',
    visual: scene('Clue five is fixed; fill the empty cell with seven', `${cell(20, '5', 'demo-clue')}${cell(100, '', 'demo-selected')}<path d="M178 60h32m-8-7 8 7-8 7" class="demo-arrow"/>${cell(238, '7')}<text x="50" y="112" class="demo-label">Clue</text>`),
    caption: 'Shaded clues stay fixed. Fill the other cells.' },
  { title: 'Pencil notes',
    visual: scene('Small candidates one, three and seven become an answer seven', `<rect x="50" y="30" width="60" height="60" rx="4" class="demo-cell"/><text x="61" y="45" class="demo-note">1</text><text x="99" y="45" class="demo-note">3</text><text x="61" y="84" class="demo-note">7</text><path d="M144 60h32m-8-7 8 7-8 7" class="demo-arrow"/>${cell(212, '7')}`),
    caption: 'Pencil adds small notes. Turn it off to fill an answer.' },
];
