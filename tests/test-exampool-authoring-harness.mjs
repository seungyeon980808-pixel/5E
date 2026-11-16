// 출제 대화 하네스의 근거 검색 단계(M25, 10-21).
// (가) 검색 결과가 없으면 「근거 확인 후 드리겠습니다」 같은 첫 답이 최종 답이 되지 않게 한 번 더 묻는다.
// (나) 이미 취소한 요청이 늦게 중단 요청을 보내 같은 문항의 새 요청을 끊지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ??= globalThis;
const { createAuthoringHarness } = await import('../js/exampool-authoring-harness.js');

const { newQuestion } = await import('../assets/exampool/sheet/model.js');
const packet = { question: newQuestion('1'), figures: [], figureCount: 0 };
const base = extra => () => ({ send: async () => ({ turnId: 't' }), interrupt: async () => {}, models: async () => [{ model: 'm', supportedReasoningEfforts: ['medium'], serviceTiers: [], defaultReasoningEffort: 'medium', isDefault: true }], onEvent: () => () => {}, ...extra });

test('no evidence found: asks once more so the placeholder answer is not final', async () => {
  const prompts = [];
  const answers = [
    JSON.stringify({ reply: '근거 확인 후 드리겠습니다.', evidenceRequests: [{ kind: 'curriculum', query: '광합성' }] }),
    JSON.stringify({ reply: '근거 없이 쓴 최종 답입니다.' }),
  ];
  const harness = createAuthoringHarness({ base: base(), evidence: async () => ({ available: true, results: [] }),
    turn: async (bridge, payload) => { prompts.push(payload.text); return answers[prompts.length - 1]; } });
  const out = await harness.request(packet);
  assert.equal(prompts.length, 2);
  assert.equal(out.response.reply, '근거 없이 쓴 최종 답입니다.');
  assert.match(prompts[1], /요청한 검색에서 결과가 없었습니다/);
  assert.doesNotMatch(prompts[1], /ref=undefined/);
});

test('a request cancelled during evidence search never interrupts the next request', async () => {
  // 실제 차례 처리(runTurn)를 타도록 가짜 AI 연결이 답과 차례 끝 신호를 보낸다.
  let interrupts = 0, releaseEvidence, n = 0;const listeners = new Set();
  const emit = message => setTimeout(() => { for (const f of listeners) f(message); }, 0);
  const ai = base({
    interrupt: async () => { interrupts++; },
    onEvent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    send: async payload => { const turnId = 't' + (++n), clientScope = payload.clientScope;
      emit({ clientScope, method: 'item/completed', params: { turnId, item: { type: 'agentMessage', text: JSON.stringify({ reply: '근거를 찾아볼게요.', evidenceRequests: [{ kind: 'curriculum', query: '광합성' }] }) } } });
      emit({ clientScope, method: 'turn/completed', params: { turnId, turn: { status: 'completed' } } });
      return { turnId }; } });
  const harness = createAuthoringHarness({ base: ai,
    evidence: () => new Promise(resolve => { releaseEvidence = () => resolve({ available: true, results: [{ ref: 'r1', kind: 'curriculum', title: 't', quote: 'q' }] }); }) });
  const a = harness.request(packet, { requestId: 'A' });
  for (let i = 0; !releaseEvidence && i < 400; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(releaseEvidence, '첫 차례가 근거를 요청해 검색 단계에 들어간다');
  harness.cancel('A');
  releaseEvidence();
  await assert.rejects(a, error => error.cancelled === true);
  assert.equal(n, 1, '취소한 뒤에는 차례를 보내지 않는다');
  assert.equal(interrupts, 0, '보내지 않은 차례의 중단 요청은 같은 문항의 다른 요청을 끊는다');
});
