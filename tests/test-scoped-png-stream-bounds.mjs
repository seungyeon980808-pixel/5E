import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, crc32 } from 'node:zlib';
import { decodeScopedPng, encodeScopedPng } from '../js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration';

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
function pngWithPayload(payload) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', payload), chunk('IEND', Buffer.alloc(0))]);
}
function observeInflater(t) {
  const Native = globalThis.DecompressionStream;
  const receipts = [];
  globalThis.DecompressionStream = class {
    constructor(format) {
      const native = new Native(format);
      const receipt = { readBytes: 0, cancelled: 0, released: 0 };
      receipts.push(receipt);
      this.writable = native.writable; this.readable = native.readable;
      const getReader = this.readable.getReader.bind(this.readable);
      this.readable.getReader = (...args) => {
        const reader = getReader(...args);
        return {
          async read() { const result = await reader.read(); receipt.readBytes += result.value?.byteLength || 0; return result; },
          cancel(reason) { receipt.cancelled++; return reader.cancel(reason); },
          releaseLock() { receipt.released++; reader.releaseLock(); },
        };
      };
    }
  };
  t.after(() => { globalThis.DecompressionStream = Native; });
  return receipts;
}

test('a one-pixel PNG rejects excess inflated scanlines without consuming the complete payload', async t => {
  const receipts = observeInflater(t);
  const png = pngWithPayload(deflateSync(Buffer.alloc(4 * 1024 * 1024)));
  await assert.rejects(decodeScopedPng(png), /inflated data length|inflate output exceeds/);
  assert.equal(receipts.length, 1);
  assert.ok(receipts[0].readBytes <= 65536, 'stop after the first oversized native stream chunk: ' + JSON.stringify(receipts));
  assert.equal(receipts[0].cancelled, 1, 'release the producer when its output exceeds the declared image');
  assert.equal(receipts[0].released, 1);
});

test('a broken compressed stream releases its reader and a subsequent valid PNG still decodes', async t => {
  const receipts = observeInflater(t);
  await assert.rejects(decodeScopedPng(pngWithPayload(Buffer.from([120, 156, 255, 255]))));
  assert.equal(receipts[0].cancelled, 1);
  assert.equal(receipts[0].released, 1);
  const data = Uint8Array.of(19, 45, 71, 0, 29, 55, 81, 128);
  const metadata = [{ type: 'sRGB', data: Uint8Array.of(0) }];
  const decoded = await decodeScopedPng(await encodeScopedPng({ width: 2, height: 1, data }, { metadata }));
  assert.deepEqual(decoded.data, data, 'preserve RGB bytes of transparent and translucent pixels');
  assert.deepEqual(decoded.metadata, metadata);
  assert.equal(receipts.at(-1).released, 1);
});
