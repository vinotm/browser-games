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
export function createShape(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'currentColor');
  const [shape, color = '0', size = 'normal'] = name.split(':');
  svg.innerHTML = geometry[shape];
  svg.dataset.color = color;
  svg.dataset.size = size;
  return svg;
}
