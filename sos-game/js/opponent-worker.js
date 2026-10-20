import { computerMove } from './difficulty.js';
self.onmessage = ({ data }) => self.postMessage({ id: data.id, move: computerMove(data.state, data.difficulty) });
