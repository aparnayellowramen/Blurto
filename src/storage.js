// localStorage with graceful fallback. Private windows, blocked storage or a
// full quota fall back to memory, so the app still works for this visit.

const memory = new Map();

export const store = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) return JSON.parse(raw);
    } catch { /* fall through to memory */ }
    return memory.has(key) ? memory.get(key) : null;
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* memory only */ }
  },
  remove(key) {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};
