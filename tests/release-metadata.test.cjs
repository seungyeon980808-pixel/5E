'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkReleaseIdentity } = require('../scripts/check-release-identity.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), '5e-release-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const metadata = { schemaVersion: 1, channels: {
    web: { version: '1.5.3', url: 'https://www.5e.ai.kr/', status: 'stable' },
    windows: { version: '1.5.8', url: 'https://github.com/seungyeon980808-pixel/5E/releases/tag/v1.5.8', status: 'published' },
    preview: { version: '1.6.0-preview', url: 'https://www.5e.ai.kr/preview/', status: 'preview' },
  } };
  write('release-channels.json', metadata);
  write('package.json', { version: '1.5.3' });
  write('package-lock.json', { version: '1.5.3', packages: { '': { version: '1.5.3' } } });
  write('index.html', '<footer><strong>v1.5.3 · 2026.08.11</strong></footer>');
  write('preview/index.html', '<title>5E 1.6.0 Preview</title><footer>v1.6.0 Preview · 2026.09.15</footer>');
  const readme = '| Channel | Version | URL |\n| --- | --- | --- |\n' + Object.entries(metadata.channels).map(([name, channel]) => `| ${name} | ${channel.version} | [Open](${channel.url}) |`).join('\n');
  write('README.md', readme);
  write('docs/RELEASE_NOTES_v1.5.3.md', '# Release 1.5.3');
  return { root, write, metadata, readme };
}

test('separate web, published Windows and preview versions are valid', t => {
  const f = fixture(t);
  assert.equal(checkReleaseIdentity(f.root).windows, '1.5.8');
  assert.equal(checkReleaseIdentity(f.root, { tag: 'v1.5.3' }).tag, 'v1.5.3');
});
test('published Windows tag cannot label current source', t => {
  const f = fixture(t);
  assert.throws(() => checkReleaseIdentity(f.root, { tag: 'v1.5.8' }), /must equal package version/);
});
for (const tag of ['1.5.3', 'v../1.5.3', 'v1.5.3/other', '']) {
  test(`malformed tag rejected: ${JSON.stringify(tag)}`, t => {
    const f = fixture(t);
    assert.throws(() => checkReleaseIdentity(f.root, { tag }), /--tag must/);
  });
}
for (const target of ['version', 'root']) {
  test(`lock ${target} mismatch rejected`, t => {
    const f = fixture(t);
    f.write('package-lock.json', { version: target === 'version' ? '1.5.8' : '1.5.3', packages: { '': { version: target === 'root' ? '1.5.8' : '1.5.3' } } });
    assert.throws(() => checkReleaseIdentity(f.root), /package-lock/);
  });
}
test('web/package mismatch rejected', t => {
  const f = fixture(t); f.write('package.json', { version: '1.5.8' });
  assert.throws(() => checkReleaseIdentity(f.root), /package.version/);
});
test('footer version must be visible in footer, not a cache token', t => {
  const f = fixture(t); f.write('index.html', '<footer>v1.5.2</footer><script src="main.js?v=1.5.3"></script>');
  assert.throws(() => checkReleaseIdentity(f.root), /index.html footer/);
});
for (const value of ['<title>5E 1.5.3 Preview</title><footer>v1.6.0 Preview</footer>', '<title>5E 1.6.0 Preview</title><footer>v1.6.0 Stable</footer>']) {
  test(`preview identity mutation rejected: ${value}`, t => {
    const f = fixture(t); f.write('preview/index.html', value);
    assert.throws(() => checkReleaseIdentity(f.root), /preview\/index.html/);
  });
}
for (const name of ['web', 'windows', 'preview']) {
  test(`README ${name} URL mismatch rejected`, t => {
    const f = fixture(t); f.write('README.md', f.readme.replace(`](${f.metadata.channels[name].url})`, '](https://example.org/wrong)'));
    assert.throws(() => checkReleaseIdentity(f.root), new RegExp(`README channel table: ${name}`));
  });
}
test('README version mutation rejected', t => {
  const f = fixture(t); f.write('README.md', f.readme.replace('1.6.0-preview', '1.6.1-preview'));
  assert.throws(() => checkReleaseIdentity(f.root), /README channel table: preview/);
});
test('tag requires nonempty release notes', t => {
  const f = fixture(t);
  fs.unlinkSync(path.join(f.root, 'docs/RELEASE_NOTES_v1.5.3.md'));
  assert.throws(() => checkReleaseIdentity(f.root, { tag: 'v1.5.3' }), /release notes required/);
  f.write('docs/RELEASE_NOTES_v1.5.3.md', '  ');
  assert.throws(() => checkReleaseIdentity(f.root, { tag: 'v1.5.3' }), /release notes required/);
});
