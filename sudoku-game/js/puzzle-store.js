import { DIFFICULTY_GENERATOR_VERSION } from './difficulty-generator.js';
import { DIFFICULTY_VERSION } from './difficulty.js';

const namespace = `${DIFFICULTY_GENERATOR_VERSION}/${DIFFICULTY_VERSION}`;
// Transactions serialize consumption across tabs. Storage failure leaves RAM play available.
export function createPuzzleStore({ indexedDB = globalThis.indexedDB } = {}) {
  let database;
  async function open() {
    if (!indexedDB) throw Error('Storage unavailable');
    return database ||= new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Storage unavailable')), 1500);
      const request = indexedDB.open('sudoku-puzzles', 1);
      request.onblocked = () => { clearTimeout(timer); reject(Error('Storage blocked')); };
      request.onupgradeneeded = () => request.result.createObjectStore('puzzles', { keyPath: 'key' });
      request.onsuccess = () => { clearTimeout(timer); request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); reject(request.error); };
    });
  }
  async function transact(update) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('puzzles', 'readwrite'), store = tx.objectStore('puzzles');
      let result;
      const request = store.getAll();
      request.onsuccess = () => {
        try { result = update(request.result, store); } catch { tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('Storage transaction failed'));
    });
  }
  return {
    load: () => transact((rows, store) => {
      for (const row of rows) if (row.namespace !== namespace) store.delete(row.key);
      return rows.filter(row => row.namespace === namespace).map(row => row.candidate);
    }),
    offer: candidate => transact((rows, store) => {
      const key = `${namespace}:${candidate.puzzle.join('')}`;
      const sibling = rows.find(row => row.namespace === namespace && row.candidate.origin === candidate.origin &&
        row.candidate.grade.difficulty === candidate.grade.difficulty);
      if (sibling && sibling.candidate.generationMs >= candidate.generationMs) return;
      if (sibling) store.delete(sibling.key);
      store.put({ key, namespace, candidate });
      const same = rows.filter(row => row.namespace === namespace && row.key !== key && row.key !== sibling?.key &&
        row.candidate.grade.difficulty === candidate.grade.difficulty);
      const ranked = [...same, { key, candidate }].sort((a, b) => b.candidate.generationMs - a.candidate.generationMs);
      for (const row of ranked.slice(5)) store.delete(row.key);
    }),
    claim: candidate => transact((rows, store) => {
      const key = `${namespace}:${candidate.puzzle.join('')}`;
      const found = rows.find(row => row.key === key);
      if (found) for (const row of rows) {
        if (row.namespace === namespace && row.candidate.origin === found.candidate.origin) store.delete(row.key);
      }
      return Boolean(found);
    }),
  };
}
