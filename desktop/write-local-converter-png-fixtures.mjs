import { writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { fixtureBytes } from "../tests/fixtures/local-converter-fixtures.mjs";

const outputDirectory = new URL("../.omo/evidence/5e-overhaul/", import.meta.url);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return result;
}

function encodePng(fixture) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(fixture.width, 0);
  header.writeUInt32BE(fixture.height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = fixture.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * fixture.height);
  for (let y = 0; y < fixture.height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    Buffer.from(fixture.data.buffer, fixture.data.byteOffset + (y * stride), stride).copy(scanlines, targetOffset + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const fixture of fixtureBytes().filter(({ name }) => name === "sparse-2000" || name === "dense-2000")) {
  await writeFile(new URL(`task-7-${fixture.name}.png`, outputDirectory), encodePng(fixture));
}
