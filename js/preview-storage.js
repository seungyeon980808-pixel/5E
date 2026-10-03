// Preview settings are isolated from the stable site on the same origin.
const prefix = "5e.preview:";
export const previewStorage = {
  getItem(key) { return globalThis.localStorage.getItem(prefix + key); },
  setItem(key, value) { globalThis.localStorage.setItem(prefix + key, value); },
  removeItem(key) { globalThis.localStorage.removeItem(prefix + key); },
};
