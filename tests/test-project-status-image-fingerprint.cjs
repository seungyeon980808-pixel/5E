const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture() {
  const source = fs.readFileSync(path.join(__dirname, '../preview/js/project-status.js'), 'utf8').replace(/export /g, '');
  const ctx = vm.createContext({ document: { querySelector: () => null } });
  vm.runInContext(source, ctx);
  const image = { id: 'image', type: 'image', src: 'data:image/png;base64,' + 'a'.repeat(2_000_000), x: 1 };
  const value = { pages: [{ id: 'page', objects: [image] }] };
  const state = { get: () => value, subscribe: () => {} };
  return { image, value, status: ctx.initProjectStatus(state, s => ({ pages: s.pages })) };
}

test('save status never embeds image payloads in its metadata fingerprint', () => {
  const { image, status } = fixture();
  const token = status.capture();
  const metadata = typeof token.fingerprint === 'string' ? token.fingerprint : token.fingerprint.json;
  assert.ok(metadata.length < 1024, `status fingerprint unnecessarily serializes ${metadata.length} bytes`);
  assert.equal(token.fingerprint.sources[0], image.src);
});

test('image source changes, geometry edits, undo, and separate save receipts remain exact', () => {
  const { image, status } = fixture();
  assert.equal(status.hasUnsavedWork(), false);
  const saved = status.capture();
  status.mark(saved, 'file');
  assert.equal(status.isFileDirty(), false);
  const original = image.src;
  image.src = original.slice(0, -1) + 'b';
  assert.equal(status.hasUnsavedWork(), true);
  assert.equal(status.text(), '미저장 변경');
  status.mark(status.capture(), 'recovery');
  assert.equal(status.text(), '자동 복구용 저장됨 · 파일 저장 필요');
  assert.equal(status.isFileDirty(), true);
  image.src = original;
  assert.equal(status.isFileDirty(), false);
  assert.equal(status.text(), '파일 저장 완료');
  image.x = 2;
  assert.equal(status.isFileDirty(), true);
  image.x = 1;
  assert.equal(status.hasUnsavedWork(), false);
  image.src = original.slice(0, -1) + 'c';
  status.mark(status.capture(), 'download');
  assert.equal(status.text(), '파일 다운로드 요청됨 · 저장 위치 확인');
  status.mark(saved, 'file');
  assert.equal(status.isFileDirty(), true, 'stale save receipt must not mark newer image bytes saved');
});

test('captured receipts cannot mark a replaced document saved', () => {
  const { value, status } = fixture();
  const old = status.capture();
  value.pages = [{ id: 'new', objects: [] }];
  status.mark(old, 'file');
  assert.equal(status.isFileDirty(), true);
  assert.equal(status.text(), '미저장 변경');
});
