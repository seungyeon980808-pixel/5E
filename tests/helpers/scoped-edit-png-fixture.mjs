/**
 * Test-only PNG codec. It intentionally supports only non-interlaced, 8-bit RGB/RGBA PNGs
 * (IHDR color types 2 and 6), and always writes RGBA/color type 6 output. It is not product code.
 */
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const text = new TextDecoder('latin1');
const bytes = new TextEncoder();

function crc32(data) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function u32(value) { return Uint8Array.of(value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255); }
function readU32(data, offset) { return (((data[offset] << 24) >>> 0) + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3]) >>> 0; }
function join(parts) { const length = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(length); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; }
function chunk(type, data) { const typeBytes = bytes.encode(type); const body = join([typeBytes, data]); return join([u32(data.length), body, u32(crc32(body))]); }
function paeth(a, b, c) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

function validateRgba({ width, height, data }) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || !(data instanceof Uint8Array) || data.length !== width * height * 4) throw new TypeError('Expected exact Uint8Array RGBA image.');
}
function filteredRow(row, prior, bpp, filter) {
  const out = new Uint8Array(row.length);
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? row[i - bpp] : 0;
    const above = prior ? prior[i] : 0;
    const upperLeft = prior && i >= bpp ? prior[i - bpp] : 0;
    const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
    out[i] = (row[i] - predictor + 256) & 255;
  }
  return out;
}

export function encodeTestRgbaPng(image, filter = 0) {
  validateRgba(image);
  if (!Number.isInteger(filter) || filter < 0 || filter > 4) throw new RangeError('PNG filter must be 0 through 4.');
  const stride = image.width * 4; const rows = [];
  for (let y = 0; y < image.height; y += 1) {
    const row = image.data.subarray(y * stride, (y + 1) * stride);
    const prior = y ? image.data.subarray((y - 1) * stride, y * stride) : null;
    rows.push(Uint8Array.of(filter), filteredRow(row, prior, 4, filter));
  }
  const ihdr = join([u32(image.width), u32(image.height), Uint8Array.of(8, 6, 0, 0, 0)]);
  return join([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(join(rows)))), chunk('IEND', new Uint8Array())]);
}

export function decodeTestPng(input) {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  assert.deepEqual([...data.subarray(0, 8)], [...SIGNATURE], 'PNG signature required');
  let offset = 8; let ihdr = null; const idat = []; let ended = false;
  while (offset < data.length) {
    assert.ok(offset + 12 <= data.length, 'truncated PNG chunk');
    const length = readU32(data, offset); offset += 4;
    assert.ok(offset + 8 + length <= data.length, 'truncated PNG chunk data');
    const typeBytes = data.subarray(offset, offset + 4); const type = text.decode(typeBytes); offset += 4;
    const body = data.subarray(offset, offset + length); offset += length;
    const expected = readU32(data, offset); offset += 4;
    assert.equal(crc32(join([typeBytes, body])), expected, `CRC mismatch in ${type}`);
    if (type === 'IHDR') { assert.equal(ihdr, null, 'duplicate IHDR'); ihdr = body.slice(); }
    else if (type === 'IDAT') { assert.ok(ihdr && !ended, 'IDAT ordering invalid'); idat.push(body); }
    else if (type === 'IEND') { assert.equal(length, 0, 'IEND must be empty'); ended = true; break; }
  }
  assert.ok(ended && offset === data.length && ihdr, 'complete PNG with IHDR/IEND required');
  const width = readU32(ihdr, 0); const height = readU32(ihdr, 4); const [depth, color, compression, filterMethod, interlace] = ihdr.subarray(8);
  assert.ok(width > 0 && height > 0 && Number.isSafeInteger(width * height * 4), 'safe PNG dimensions required');
  assert.equal(depth, 8, 'only 8-bit PNG supported'); assert.ok(color === 2 || color === 6, 'only RGB/RGBA PNG supported'); assert.equal(compression, 0); assert.equal(filterMethod, 0); assert.equal(interlace, 0, 'interlaced PNG unsupported');
  const bpp = color === 6 ? 4 : 3; const stride = width * bpp; const raw = new Uint8Array(inflateSync(join(idat)));
  assert.equal(raw.length, height * (stride + 1), 'inflated scanline length mismatch');
  const reconstructed = new Uint8Array(height * stride); let at = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[at++]; assert.ok(filter <= 4, `unsupported PNG filter ${filter}`);
    const row = reconstructed.subarray(y * stride, (y + 1) * stride); const prior = y ? reconstructed.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x += 1) { const encoded = raw[at++]; const left = x >= bpp ? row[x - bpp] : 0; const above = prior ? prior[x] : 0; const upperLeft = prior && x >= bpp ? prior[x - bpp] : 0; const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft); row[x] = (encoded + predictor) & 255; }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) { const source = pixel * bpp; const target = pixel * 4; rgba[target] = reconstructed[source]; rgba[target + 1] = reconstructed[source + 1]; rgba[target + 2] = reconstructed[source + 2]; rgba[target + 3] = bpp === 4 ? reconstructed[source + 3] : 255; }
  return { width, height, data: rgba };
}
