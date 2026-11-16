import { eraseImageRegion } from './ai-image-erase-core.js?v=1.7.0-four-session-integration';

// Use the same byte-preserving PNG implementation as the main-thread adapter.
// No canvas encoding, candidate state, credentials or network requests live here.
self.onmessage = async ({ data: { id, source, operation } }) => {
  try { self.postMessage({ id, result: await eraseImageRegion(source, operation) }); }
  catch (error) { self.postMessage({ id, error: { name: error.name, message: error.message } }); }
};
