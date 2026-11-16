// Preview settings are isolated from the stable site on the same origin.
const prefix = "5e.preview:";
export const previewStorage = {
  getItem(key) { return globalThis.localStorage.getItem(prefix + key); },
  setItem(key, value) { globalThis.localStorage.setItem(prefix + key, value); },
  removeItem(key) { globalThis.localStorage.removeItem(prefix + key); },
};

// These stores were already used without a prefix by the integration's local
// root entry. Keep those existing local workspaces accessible, while the public
// /preview channel must never read or overwrite the stable site's metadata.
function channelStore(name) {
  const channelPrefix = /^\/preview(?:\/|$)/.test(globalThis.location?.pathname || '') ? prefix : '';
  return {
    getItem(key) { return globalThis[name].getItem(channelPrefix + key); },
    setItem(key, value) { globalThis[name].setItem(channelPrefix + key, value); },
    removeItem(key) { globalThis[name].removeItem(channelPrefix + key); },
  };
}
export const channelStorage = channelStore('localStorage');
export const channelSessionStorage = channelStore('sessionStorage');

// Optional UI preferences must not prevent a panel from initializing. Keep
// this adapter separate from document/task stores, whose writes must fail loud.
export function optionalStorage(storage) {
  return {
    getItem(key) { try { return storage.getItem(key); } catch { return null; } },
    setItem(key, value) { try { storage.setItem(key, value); } catch {} },
    removeItem(key) { try { storage.removeItem(key); } catch {} },
  };
}
