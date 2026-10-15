// Storage is optional: gameplay continues if the browser denies access.
export function createStorage(prefix) {
  return {
    get(key, fallback = null) {
      try { return localStorage.getItem(`${prefix}-${key}`) ?? fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`${prefix}-${key}`, String(value)); return true; }
      catch { return false; }
    },
    number(key, fallback = 0) {
      const value = this.get(key);
      const number = value === null ? NaN : Number(value);
      return Number.isFinite(number) && number >= 0 ? number : fallback;
    },
  };
}
