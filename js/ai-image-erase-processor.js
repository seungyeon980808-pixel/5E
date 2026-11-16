import { eraseImageRegion } from './ai-image-erase-core.js?v=1.7.0-four-session-integration';

export function createImageEraseProcessor(win) {
  let worker = null, pending = null, serial = 0;
  const cancelled = () => new DOMException('지우기 취소 · 이전 버전 유지', 'AbortError');
  function destroy() {
    worker?.terminate(); worker = null;
    pending?.reject(cancelled()); pending = null;
  }
  return {
    erase(source, operation, { signal } = {}) {
      if (signal?.aborted) return Promise.reject(cancelled());
      if (pending) return Promise.reject(new Error('이전 지우기 처리를 기다려 주세요.'));
      if (!worker && typeof win?.Worker === 'function') {
        try { worker = new win.Worker(new URL('./ai-image-erase-worker.js?v=1.7.0-four-session-integration', import.meta.url), { type: 'module' }); }
        catch { /* Older embedded browsers retain the verified synchronous adapter. */ }
      }
      if (!worker) return eraseImageRegion(source, operation, { signal });
      const id = ++serial, currentWorker = worker;
      return new Promise((resolve, reject) => {
        const finish = (value, error) => {
          currentWorker.removeEventListener('message', message);
          currentWorker.removeEventListener('error', failed);
          signal?.removeEventListener('abort', abort);
          if (pending?.id === id) pending = null;
          if (error) reject(error); else resolve(value);
        };
        const abort = () => { currentWorker.terminate(); if (worker === currentWorker) worker = null; finish(null, cancelled()); };
        const failed = () => {
          currentWorker.terminate(); if (worker === currentWorker) worker = null;
          finish(null, new Error('지우기 처리를 완료하지 못했습니다. 기존 수정본은 유지됩니다. 다시 시도해 주세요.'));
        };
        const message = event => {
          if (event.data.id !== id) return;
          const error = event.data.error && Object.assign(new Error(event.data.error.message), { name: event.data.error.name });
          finish(event.data.result, error);
        };
        pending = { id, reject: error => finish(null, error) };
        signal?.addEventListener('abort', abort, { once: true });
        currentWorker.addEventListener('message', message);
        currentWorker.addEventListener('error', failed);
        try { currentWorker.postMessage({ id, source, operation }); } catch { failed(); }
      });
    }, destroy,
  };
}
