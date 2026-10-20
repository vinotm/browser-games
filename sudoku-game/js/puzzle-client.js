export function createPuzzleClient({ createWorker = () => new Worker(new URL('./generator-worker.js', import.meta.url), { type: 'module' }),
  clock = () => performance.now() } = {}) {
  let worker = null, serial = 0, visible = true;
  const pending = new Map();
  function dispose(error) {
    worker?.terminate(); worker = null;
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  }
  function ensureWorker() {
    if (worker) return;
    worker = createWorker();
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id); if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve({ ...data.result, serveMs: data.result.cacheHit ? 0 : Math.max(0, Math.round(clock() - request.begin)) });
    };
    worker.onerror = () => dispose(new Error('Could not load a puzzle. Please try again.'));
    worker.postMessage({ type: 'visibility', visible });
  }
  return {
    warmup() {
      try { ensureWorker(); worker.postMessage({ type: 'warmup' }); }
      catch (error) { dispose(error); } // Play can retry if background startup fails.
    },
    take(difficulty) {
      const begin = clock();
      try { ensureWorker(); }
      catch (error) { dispose(error); return Promise.reject(error); }
      const id = ++serial;
      const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject, begin }));
      try { worker.postMessage({ type: 'request', id, difficulty }); }
      catch (error) { dispose(error); }
      return promise;
    },
    setVisible(value) { visible = Boolean(value); worker?.postMessage({ type: 'visibility', visible }); },
    close() { dispose(new Error('Puzzle service closed')); },
  };
}
