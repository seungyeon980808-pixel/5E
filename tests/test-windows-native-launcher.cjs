const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createDriver } = require('./helpers/windows-native-driver.cjs');
const { createWindowsProjectPackage } = require('../desktop/windows-project-package.cjs');
let driver;
const supported = ['darwin', 'win32'].includes(process.platform);
const native = { skip: !supported };
before(async () => { if (supported) driver = await createDriver(); });
after(async () => { await driver?.close(); });

async function exported(t) {
  const json = '{"pages":[{"id":"한글과 이미지","objects":[{"type":"text","text":"5E"},{"type":"image","src":"data:image/png;base64,aGVsbG8="}]}]}';
  const pkg = await createWindowsProjectPackage({ json });
  t.after(() => pkg.close());
  return { pkg, json, bytes: await fs.readFile(pkg.bundle) };
}

test('native C reader preserves exact UTF-8 original from a product export', native, async t => {
  // Given a real product export, not a separately fabricated footer.
  const { pkg, json } = await exported(t);
  // When the same C payload parser as the launcher reads it.
  const result = await driver.run(['read', pkg.bundle]);
  // Then text and embedded image source remain byte-for-byte unchanged.
  assert.equal(result.stdout, json);
});

test('native C reader rejects damaged, oversized and truncated payload boundaries', native, async t => {
  // Given independently damaged copies of a real product file.
  const { bytes } = await exported(t);
  const damaged = Buffer.from(bytes); damaged[damaged.length - 57] ^= 1;
  const oversized = Buffer.from(bytes); oversized.writeUInt32LE(0xffffffff, oversized.length - 40);
  const badPE = Buffer.from(bytes); badPE.writeUInt32LE(0xffffffff, 60);
  const samples = [damaged, oversized, badPE, bytes.subarray(0, bytes.length - 1), Buffer.from('not a project')];
  // When the native reader attempts each unsafe input.
  for (let i = 0; i < samples.length; i++) {
    const file = path.join(driver.root, `damaged-${i}.exe`); await fs.writeFile(file, samples[i]);
    // Then it returns an error without supplying replacement document bytes.
    await assert.rejects(driver.run(['read', file]), error => error.code === 1 && error.stdout === '');
  }
});

test('native C reader locates original before certificate alignment padding', native, async t => {
  // Given Authenticode table placement without claiming a real signature.
  const { bytes, json } = await exported(t);
  const padding = (8 - bytes.length % 8) % 8;
  const signed = Buffer.concat([bytes, Buffer.alloc(padding + 8)]), pe = signed.readUInt32LE(60);
  signed.writeUInt32LE(bytes.length + padding, pe + 168); signed.writeUInt32LE(8, pe + 172);
  const file = path.join(driver.root, 'certificate-layout.exe'); await fs.writeFile(file, signed);
  // When the native parser reads the layout.
  const result = await driver.run(['read', file]);
  // Then the original stays intact despite certificate padding.
  assert.equal(result.stdout, json);
});

test('native editor URL checks reject credentials, changed origins and invalid tokens', native, async () => {
  // Given a configured editor and responses from a transfer endpoint.
  const origin = 'https://www.5e.ai.kr', token = 'a'.repeat(48);
  // When the actual C URL boundary parses a matching response.
  await driver.run(['url', origin, `${origin}/editor/#project=${token}`]);
  // Then unsafe destinations fail instead of opening another site.
  for (const url of [`https://other.invalid/#project=${token}`, `https://www.5e.ai.kr:444/#project=${token}`, `https://user@www.5e.ai.kr/#project=${token}`, `${origin}/#project=bad`, `${origin}/\r\n#project=${token}`]) await assert.rejects(driver.run(['url', origin, url]), { code: 1 });
});

test('native editor URL checks retain loopback development and reject public plain HTTP', native, async () => {
  // Given local development and a plain HTTP public endpoint.
  const token = 'b'.repeat(48);
  // When the C boundary checks configured origins.
  await driver.run(['url', 'http://127.0.0.1:19624', `http://127.0.0.1:19624/editor/#project=${token}`]);
  await driver.run(['url', 'http://[::1]:19624', `http://[::1]:19624/editor/#project=${token}`]);
  // Then it preserves local testing and rejects unencrypted public transfer.
  await assert.rejects(driver.run(['url', 'http://example.com', `http://example.com/#project=${token}`]), { code: 1 });
});

test('Windows argument quoting preserves Unicode, quotes, empty args and trailing backslashes', native, async () => {
  // Given arguments that must reach a receiver without shell interpretation.
  const cases = [['a b', '"a b"'], ['', '""'], ['a"b', '"a\\"b"'], ['path\\', '"path\\\\"'], ['한글', '"한글"'], ['x\\"y', '"x\\\\\\"y"']];
  // When the same quoting function as CreateProcess builds an argument.
  for (const [argument, expected] of cases) {
    const result = await driver.run(['quote', argument]);
    // Then the Windows command-line encoding matches the independently specified value.
    assert.equal(result.stdout, expected);
  }
});
