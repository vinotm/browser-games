import { measuredComputerMove } from './difficulty.js';
self.onmessage = ({ data }) => self.postMessage({ id: data.id, ...measuredComputerMove(data.state, data.difficulty) });
