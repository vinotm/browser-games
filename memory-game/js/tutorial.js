import { createShape } from './shapes.js';

// Examples use the game's artwork, independent of the hidden deck.
function example(label, identities) {
  return () => {
    const row = document.createElement('div');
    row.className = 'memory-example';
    row.setAttribute('role', 'img'); row.setAttribute('aria-label', label);
    for (const identity of identities) {
      const card = document.createElement('div');
      card.className = `memory-example-card ${identity ? '' : 'card-back'}`;
      if (identity) card.append(createShape(identity));
      row.append(card);
    }
    return row;
  };
}
export const tutorialPages = [
  { title: 'Find matching pairs',
    visual: example('Two matching stars stay face up', ['star', 'star']),
    caption: 'Flip two cards. Matching pairs stay face up.' },
  { title: 'Remember what you see',
    visual: example('A circle and triangle do not match; two other cards are face down', ['circle', 'triangle', null, null]),
    caption: 'Different cards turn back over. Find every pair to finish.' },
  { title: 'Match color and size too',
    visual: example('Two small blue circles match; a large blue circle and small pink circle do not', ['circle:1:small', 'circle:1:small', 'circle:1:large', 'circle:2:small']),
    caption: 'Larger boards add colors, then small and large shapes.' },
];
