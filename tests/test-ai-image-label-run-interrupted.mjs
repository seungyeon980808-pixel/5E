// 데스크톱 앱은 그림이 나오면 차례를 스스로 끊어 「interrupted」를 보내거나 끝 확인(finalization)만 보낸다.
// 그림을 받은 뒤의 이 신호는 성공으로 받아야 한다(H13, 10-21). 그림이 없으면 여전히 실패.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageLabelRasterController } from '../js/ai-image-label-run.js';

const run = async events => {
  const transport = { send: async () => ({ turnId: 't1' }), interrupt: async () => {} };
  const c = createImageLabelRasterController({ transport, timeoutMs: 2000 });
  const pending = c.generate({ prompt: 'p' });
  await new Promise(resolve => setTimeout(resolve, 0));
  for (const e of events) c.handleEvent({ turnId: 't1', ...e });
  return pending;
};

test('image then interrupted counts as success (desktop auto-finalization)', async () => {
  const out = await run([{ kind: 'image', src: 'data:image/png;base64,AAAA' }, { kind: 'done', status: 'interrupted' }]);
  assert.equal(out.src, 'data:image/png;base64,AAAA');
});
test('image then finalization confirmed counts as success', async () => {
  const out = await run([{ kind: 'image', src: 'data:image/png;base64,BBBB' }, { kind: 'finalization', state: 'confirmed' }]);
  assert.equal(out.src, 'data:image/png;base64,BBBB');
});
test('interrupted without an image is still a failure', async () => {
  await assert.rejects(run([{ kind: 'done', status: 'interrupted' }]), /완료를 확인하지 못했습니다/);
});
