export const storage = {
  get: (key) => {
    try {
      const val = localStorage.getItem(key);
      return val ? { value: val } : null;
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return null;
    }
  },
  delete: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return null;
    }
  },
};
