// 국소 복원한 라벨을 목록 맨 뒤에 붙이면 「지운 라벨」 순서가 원본 계획 순서와 어긋나,
// 저장할 때마다 Candidate plan binding mismatch 예외가 나 작업대 전체가 멈췄다(H12, 10-21).
// 라벨 [ㄱ,ㄴ,ㄷ]: ㄱ 국소 복원, ㄴ 바로 제거, ㄷ 보류 → 지운 순서는 계획 순서 [ㄱ,ㄴ]이어야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreExamLabelPixels } from '../js/ai-exam-label-removal.js';

const W = 40, H = 40;
const region = (id, labelId, x, y, extra = {}) => ({ id, labelId, owner: 'label', sourceRef: 1, ownership: 'confirmed', component: 'text',
  kind: 'ellipse', bounds: { x, y, w: 0.1, h: 0.1 }, ...extra });

test('local-restored labels keep source-plan order in removedLabelIds', async () => {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  const plan = {
    labels: ['ㄱ', 'ㄴ', 'ㄷ'].map(id => ({ id, text: id, scope: 'general', sourceRef: 1, mode: 'text' })),
    removalRegions: [region('r1', 'ㄱ', 0.1, 0.1, { method: 'local-restore' }), region('r2', 'ㄴ', 0.5, 0.1), region('r3', 'ㄷ', 0.1, 0.6)],
    uncertainties: [{ id: 'u1', labelId: 'ㄷ', bounds: { x: 0.1, y: 0.6, w: 0.1, h: 0.1 }, reason: '보류' }],
  };
  const localRestore = ({ width, height }) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(255), verified: true });
  const result = await restoreExamLabelPixels({ data, width: W, height: H, plan, workflow: { imageKind: 'exam', labelResult: 'remove' }, localRestore });
  assert.equal(result.calls.localRestore, 1);
  assert.deepEqual(result.removedLabelIds, ['ㄱ', 'ㄴ']);
  assert.deepEqual(result.report.removedLabelIds, ['ㄱ', 'ㄴ']);
  assert.deepEqual(result.deferredLabels.map(label => label.labelId), ['ㄷ']);
});
