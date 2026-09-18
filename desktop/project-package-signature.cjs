const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

function check(condition) {
  if (!condition) throw new Error('프로젝트 패키지 서명을 검증하지 못했습니다.');
}
const digest = data => createHash('sha256').update(data).digest();

// This verifier is deliberately limited to our two-architecture, SHA-256 ad-hoc launcher.
// Apple's codesign remains the acceptance check in the portable packaging integration test.
async function verifyPortableBundle(bundle) {
  const contents = path.join(bundle, 'Contents');
  const binary = await fs.readFile(path.join(contents, 'MacOS/launcher'));
  const info = await fs.readFile(path.join(contents, 'Info.plist'));
  const resources = await fs.readFile(path.join(contents, '_CodeSignature/CodeResources'));
  check(binary.readUInt32BE(0) === 0xcafebabe && binary.readUInt32BE(4) === 2);
  for (let arch = 0; arch < 2; arch++) {
    const start = binary.readUInt32BE(16 + arch * 20);
    const size = binary.readUInt32BE(20 + arch * 20);
    const macho = binary.subarray(start, start + size);
    check(macho.length === size && macho.readUInt32LE(0) === 0xfeedfacf);
    let command = 32, signature;
    for (let index = 0; index < macho.readUInt32LE(16); index++) {
      const length = macho.readUInt32LE(command + 4);
      check(length >= 8 && command + length <= macho.length);
      if (macho.readUInt32LE(command) === 0x1d) {
        const offset = macho.readUInt32LE(command + 8);
        signature = macho.subarray(offset, offset + macho.readUInt32LE(command + 12));
      }
      command += length;
    }
    check(signature && signature.readUInt32BE(0) === 0xfade0cc0);
    const slots = new Map();
    for (let index = 0; index < signature.readUInt32BE(8); index++) {
      const type = signature.readUInt32BE(12 + index * 8);
      const offset = signature.readUInt32BE(16 + index * 8);
      const length = signature.readUInt32BE(offset + 4);
      const blob = signature.subarray(offset, offset + length);
      check(blob.length === length);
      slots.set(type, blob);
    }
    const cd = slots.get(0);
    check(cd && cd.readUInt32BE(0) === 0xfade0c02 && (cd.readUInt32BE(12) & 2));
    check(cd[36] === 32 && cd[37] === 2 && cd[39] > 0 && cd[39] <= 20);
    const hashes = cd.readUInt32BE(16), specialCount = cd.readUInt32BE(24);
    const codeCount = cd.readUInt32BE(28), codeLimit = cd.readUInt32BE(32), page = 2 ** cd[39];
    check(codeLimit <= macho.length && codeCount === Math.ceil(codeLimit / page));
    check(hashes >= specialCount * 32 && hashes + codeCount * 32 <= cd.length && specialCount >= 3);
    for (let index = 0; index < codeCount; index++) {
      check(digest(macho.subarray(index * page, Math.min((index + 1) * page, codeLimit)))
        .equals(cd.subarray(hashes + index * 32, hashes + (index + 1) * 32)));
    }
    slots.set(1, info); slots.set(3, resources);
    for (let index = 1; index <= specialCount; index++) {
      const data = slots.get(index);
      const expected = data ? digest(data) : Buffer.alloc(32);
      check(expected.equals(cd.subarray(hashes - index * 32, hashes - (index - 1) * 32)));
    }
  }
  const resourceXml = resources.toString('utf8');
  for (const name of ['BlueDocument.icns', 'document.5e', 'launch.json']) {
    const marker = `<key>Resources/${name}</key>`;
    const entry = resourceXml.slice(resourceXml.lastIndexOf(marker) + marker.length);
    const match = entry.match(/^\s*<dict>\s*<key>hash2<\/key>\s*<data>([\s\S]*?)<\/data>/);
    check(resourceXml.includes(marker) && match);
    check(digest(await fs.readFile(path.join(contents, 'Resources', name))).equals(Buffer.from(match[1], 'base64')));
  }
}

module.exports = { verifyPortableBundle };
