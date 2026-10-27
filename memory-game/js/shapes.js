// Game artwork, not interface icons. All geometry uses the same 48-unit canvas.
const geometry = {
  circle: '<circle cx="24" cy="24" r="15"/>',
  square: '<rect x="10" y="10" width="28" height="28" rx="2"/>',
  triangle: '<polygon points="24,7 42,39 6,39"/>',
  diamond: '<polygon points="24,5 40,24 24,43 8,24"/>',
  star: '<polygon points="24,4 30,17 44,19 34,29 36,43 24,36 12,43 14,29 4,19 18,17"/>',
  cross: '<path d="M18 6h12v12h12v12H30v12H18V30H6V18h12z"/>',
  hexagon: '<polygon points="14,7 34,7 44,24 34,41 14,41 4,24"/>',
  oval: '<ellipse cx="24" cy="24" rx="19" ry="11"/>',
  pentagon: '<polygon points="24,4 44,19 36,42 12,42 4,19"/>',
  crescent: '<path transform="rotate(-30 24 24)" d="M30 7.029A18 18 0 1 0 30 40.971A18 18 0 0 1 30 7.029Z"/>',
  ring: '<path fill-rule="evenodd" d="M24 4a20 20 0 1 0 0 40 20 20 0 0 0 0-40m0 10a10 10 0 1 1 0 20 10 10 0 0 1 0-20"/>',
  heart: '<path d="M24 41 8 26C-4 12 13 0 24 13 35 0 52 12 40 26Z"/>',
};
// Visible-art bounds, including path rotation, keep every shape centered.
const viewBoxes = {
  "circle": "8.95 8.95 30.1 30.1",
  "square": "9.95 9.95 28.1 28.1",
  "triangle": "5.95 6.95 36.1 32.1",
  "diamond": "7.95 4.95 32.1 38.1",
  "star": "3.95 3.95 40.1 39.1",
  "cross": "5.95 5.95 36.1 36.1",
  "hexagon": "3.95 6.95 40.1 34.1",
  "heart": "3.8 7.35 40.4 33.7",
  "oval": "4.95 12.95 38.1 22.1",
  "pentagon": "3.95 3.95 40.1 38.1",
  "crescent": "5.95 6.25 31.8 35.8",
  "ring": "3.95 3.95 40.1 40.1"
};

export function createShape(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const [shape, color = '0', size = 'normal'] = name.split(':');
  svg.setAttribute('viewBox', viewBoxes[shape]);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.innerHTML = geometry[shape];
  svg.dataset.color = color;
  svg.dataset.size = size;
  return svg;
}
