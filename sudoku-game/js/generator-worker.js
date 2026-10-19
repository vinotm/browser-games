import { createPuzzle } from './puzzle.js';
self.onmessage = () => {
  try { self.postMessage({ puzzle: createPuzzle() }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
