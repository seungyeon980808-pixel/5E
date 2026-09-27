#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const WIDTH = 1005;
const HEIGHT = 399;
const EXTERNAL_INPUTS = Object.freeze([]);
const PRIMITIVES = Object.freeze([
  { type: 'solid-background', color: '#f7f9fc' },
  { type: 'grid', spacing: 100, width: 1, color: '#1d4ed8' },
  { type: 'filled-circle', center: [700, 190], radius: 70, color: '#3b82c4' },
  { type: 'line-segment', from: [0, 54], to: [1004, 337], width: 3, color: '#2563d4' },
]);

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), output.length - 4);
  return output;
}

function paintPixel(pixels, x, y, [red, green, blue]) {
  const offset = (y * WIDTH + x) * 3;
  pixels[offset] = red;
  pixels[offset + 1] = green;
  pixels[offset + 2] = blue;
}

function buildPixels() {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      paintPixel(pixels, x, y, x % 100 === 0 || y % 100 === 0 ? [29, 78, 216] : [247, 249, 252]);
    }
  }
  for (let y = 120; y <= 260; y += 1) {
    for (let x = 630; x <= 770; x += 1) {
      if ((x - 700) ** 2 + (y - 190) ** 2 <= 70 ** 2) paintPixel(pixels, x, y, [59, 130, 196]);
    }
  }
  const deltaX = 1004;
  const deltaY = 283;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const projection = Math.max(0, Math.min(1, (x * deltaX + (y - 54) * deltaY) / lengthSquared));
      const nearestX = projection * deltaX;
      const nearestY = 54 + projection * deltaY;
      if ((x - nearestX) ** 2 + (y - nearestY) ** 2 <= 1.5 ** 2) paintPixel(pixels, x, y, [37, 99, 212]);
    }
  }
  return pixels;
}

function buildPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const physicalDensity = Buffer.alloc(9);
  physicalDensity.writeUInt32BE(3780, 0);
  physicalDensity.writeUInt32BE(3780, 4);
  physicalDensity[8] = 1;
  const pixels = buildPixels();
  const scanlines = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1));
  for (let y = 0; y < HEIGHT; y += 1) {
    pixels.copy(scanlines, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('pHYs', physicalDensity),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputFlag = process.argv.indexOf('--output');
const defaultOutput = fileURLToPath(new URL('./rights-clear-smoke.png', import.meta.url));
const output = path.resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : defaultOutput);
if (EXTERNAL_INPUTS.length !== 0) throw new Error('Synthetic fixture generation must not accept external inputs.');
const png = buildPng();
fs.writeFileSync(output, png);
process.stdout.write(`${JSON.stringify({
  output,
  sha256: createHash('sha256').update(png).digest('hex'),
  width: WIDTH,
  height: HEIGHT,
  externalInputs: EXTERNAL_INPUTS,
  primitives: PRIMITIVES,
})}\n`);
