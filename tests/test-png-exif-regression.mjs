import assert from 'node:assert/strict';
import { decodeScopedPng, encodeScopedPng } from '../preview/js/ai-scoped-edit-png.js';
function chunk(type, data) {
 const out = Buffer.alloc(data.length + 12);
 out.writeUInt32BE(data.length); out.write(type, 4); out.set(data, 8);
 let crc = 0xffffffff;
 for (const byte of out.subarray(4, -4)) {
  crc ^= byte;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
 }
 out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
 return out;
}
const pixels = Uint8Array.of(10, 20, 30, 255, 40, 50, 60, 128);
const png = await encodeScopedPng({width: 2, height: 1, data: pixels});
const exif = chunk('eXIf', Uint8Array.of(73,73,42,0,8,0,0,0,0,0,0,0,0,0));
for (const offset of [33, png.length - 12]) {
 const input = Buffer.concat([png.subarray(0, offset), exif, png.subarray(offset)]);
 const decoded = await decodeScopedPng(input);
 assert.deepEqual(decoded.data, pixels);
 assert.ok(decoded.removedMetadata.includes('eXIf'));
 const roundtrip = await decodeScopedPng(await encodeScopedPng(decoded, {metadata: decoded.metadata}));
 assert.deepEqual(roundtrip.data, pixels);
 const corrupt = Buffer.from(input); corrupt[offset + 8] ^= 1;
 await assert.rejects(decodeScopedPng(corrupt), /CRC mismatch/);
}
const critical = Buffer.concat([png.subarray(0,33), chunk('ABCD', new Uint8Array()), png.subarray(33)]);
await assert.rejects(decodeScopedPng(critical), /not supported/);
console.log('PNG eXIf: before/after IDAT, byte-exact pixels, CRC and critical-chunk rejection passed');
