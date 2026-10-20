import { createDifficultyPuzzle } from './difficulty-generator.js';

// Separate from the current gameplay worker until level selection is integrated.
self.onmessage = ({ data }) => {
  try {
    const names = ['maxTimeMs', 'maxPasses', 'maxChecks', 'maxClues'];
    const options = Object.fromEntries(names.filter(name => data?.[name] !== undefined).map(name => [name, data[name]]));
    self.postMessage(createDifficultyPuzzle(data?.difficulty, options));
  } catch (error) {
    self.postMessage({ status: 'error', error: error.message });
  }
};
