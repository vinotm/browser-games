export const levels = ['easy','medium','hard'];
export class PuzzlePool {
  constructor(capacity = 5) {
    this.capacity = capacity;
    this.queues = Object.fromEntries(levels.map(level => [level, []]));
    this.offers = 0; this.discards = 0;
  }
  offer(candidate) {
    this.offers++;
    const queue = this.queues[candidate.grade.difficulty];
    if (!queue) throw Error('Unclassified candidate');
    // Avoid five nearly identical clue masks from a single complete solution.
    const existing = queue.findIndex(p => p.origin === candidate.origin);
    if (existing >= 0) {
      if (queue[existing].generationMs >= candidate.generationMs) { this.discards++; return; }
      queue.splice(existing, 1); this.discards++;
    }
    queue.push(candidate);
    queue.sort((a,b) => b.generationMs - a.generationMs);
    if (queue.length > this.capacity) { queue.pop(); this.discards++; }
  }
  take(level) {
    const selected = this.queues[level].shift();
    if (!selected) return null;
    // Once a solution is played, don't serve a related mask from another level.
    for (const key of levels) this.queues[key] = this.queues[key].filter(p => p.origin !== selected.origin);
    return selected;
  }
  fallback(requested) {
    for (let i=levels.indexOf(requested)-1;i>=0;i--) {
      const selected=this.take(levels[i]);if(selected)return selected;
    }
    return null;
  }
  counts() { return Object.fromEntries(levels.map(level => [level,this.queues[level].length])); }
  missing() { return [...levels].reverse().find(level => this.queues[level].length < this.capacity); }
}
