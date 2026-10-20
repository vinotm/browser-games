import { createPuzzleService } from './puzzle-service.js';
import { createPuzzleStore } from './puzzle-store.js';
const service = createPuzzleService({ store: createPuzzleStore() });
self.onmessage = ({ data }) => {
  if (data?.type === 'warmup') { service.warmup(); return; }
  if (data?.type === 'visibility') { service.setPaused(!data.visible); return; }
  if (data?.type !== 'request') return;
  service.request(data.difficulty).then(
    result => self.postMessage({ id: data.id, result }),
    error => self.postMessage({ id: data.id, error: error.message })
  );
};
