// Safari 26 does not make ReadableStream async-iterable, but PDF.js reads text
// content and decompressed streams with for-await. Install the standard shape.
if (typeof ReadableStream === 'function' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  async function* values({ preventCancel = false } = {}) {
    const reader = this.getReader();
    let finished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          return;
        }
        yield value;
      }
    } finally {
      if (!finished && !preventCancel) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
  for (const key of ['values', Symbol.asyncIterator]) {
    Object.defineProperty(ReadableStream.prototype, key, { value: values, writable: true, configurable: true });
  }
}
