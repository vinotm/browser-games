// Keep a bounded supply in memory; generate sequentially to limit CPU usage.
export function createPuzzleQueue(generate, capacity = 10) {
  const ready = [];
  const waiting = [];
  let running = false;
  async function refill() {
    if (running) return;
    running = true;
    try {
      while (ready.length < capacity || waiting.length) {
        const puzzle = await generate();
        if (waiting.length) waiting.shift().resolve(puzzle);
        else ready.push(puzzle);
      }
    } catch (error) {
      // Preserve already generated puzzles; a later request can retry generation.
      while (waiting.length) waiting.shift().reject(error);
    } finally {
      running = false;
    }
  }
  return {
    take() {
      if (ready.length) {
        const puzzle = ready.shift();
        void refill();
        return Promise.resolve(puzzle);
      }
      const result = new Promise((resolve, reject) => waiting.push({ resolve, reject }));
      void refill();
      return result;
    },
    get size() { return ready.length; }
  };
}
