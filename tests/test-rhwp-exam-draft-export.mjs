// 문항을 한 번 넣은 문서는 내보내기가 엄격 검사(exportVerifiedHwpx)로 바뀐다. 검사에 걸리는 편집 뒤에도
// 자동 저장·바꾸기 전 백업은 막히지 않아야 하고, 파일 저장은 그대로 엄격해야 한다(M2, 10-21).
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ??= globalThis;
const { RhwpExamBridge } = await import('../js/rhwp-exam-bridge.js');

const fakeBridge = () => {
  const bridge = Object.create(RhwpExamBridge.prototype);
  const wasm = { documentGeneration: 1, exportHwp: () => 'plain-hwp', exportHwpx: () => 'plain-hwpx', borrowDocumentHandle: () => ({}) };
  bridge.deps = { wasm };
  bridge.editor = { exportHwpx: async () => wasm.exportHwpx() };
  window.XLSX = { CFB: {} };
  return bridge;
};

test('draft export falls back when the strict check fails; file export stays strict', async () => {
  const bridge = fakeBridge();
  await bridge.enableApprovedQuestionExport();
  await assert.rejects(bridge.exportHwpx(), '파일 저장은 엄격 검사 실패를 그대로 알린다');
  assert.equal(await bridge.exportDraftHwpx(), 'plain-hwpx');
  assert.ok(bridge.lastDraftExportError);
  assert.equal(bridge.draftExport, false);
});

test('a new document generation uses the plain export again', async () => {
  const bridge = fakeBridge();
  await bridge.enableApprovedQuestionExport();
  bridge.deps.wasm.documentGeneration = 2;
  assert.equal(await bridge.exportHwpx(), 'plain-hwpx');
});
