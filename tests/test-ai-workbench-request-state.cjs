const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const moduleUrl = pathToFileURL(path.join(__dirname, '../js/ai-workbench-request-state.js')).href;

test('request progress starts before transport and remains with its originating task', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  let now = 100;
  const state = createWorkbenchRequestState({ clock: () => now });
  const a = state.begin('A', 'A-revision-2');
  const b = state.begin('B', 'B-original');
  now = 1100;
  state.advance(a, 'confirmation-wait');
  assert.equal(state.snapshot('A').phase, 'confirmation-wait');
  assert.equal(state.snapshot('A').elapsedMs, 1000);
  assert.equal(state.snapshot('B').phase, 'preparing');
  assert.equal(state.snapshot('B').token, b);
});

test('cancelled A1 events cannot update retried A2 or independent B', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  const state = createWorkbenchRequestState();
  const a1 = state.begin('A', 'revision');
  state.bind(a1, { turnId: 'A1', threadId: 'thread-A1' });
  state.advance(a1, 'cancelled');
  const a2 = state.begin('A', 'revision');
  state.bind(a2, { turnId: 'A2', threadId: 'thread-A2' });
  state.advance(a2, 'generating');
  const b = state.begin('B', 'other');
  for (const kind of ['image', 'error', 'done']) {
    assert.equal(state.accepts(a2, { kind, turnId: 'A1', threadId: 'thread-A1' }), false);
    assert.equal(state.accepts(a1, { kind, turnId: 'A1' }), false);
  }
  assert.equal(state.advance(a1, 'completed'), false);
  assert.equal(state.snapshot('A').phase, 'generating');
  assert.equal(state.snapshot('B').token, b);
  assert.equal(state.snapshot('B').phase, 'preparing');
});

test('event routing rejects conflicting transport identifiers and stopped requests', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  const state = createWorkbenchRequestState();
  const token = state.begin('A', 'revision');
  assert.equal(state.accepts(token, { turnId: 'one' }), false);
  state.bind(token, { turnId: 'one', renderThreadId: 'thread-one' });
  assert.equal(state.accepts(token, { threadId: 'thread-one' }), true);
  assert.equal(state.accepts(token, { turnId: 'other', threadId: 'thread-one' }), false);
  assert.equal(state.accepts(token, { turnId: 'one', threadId: 'other' }), false);
  state.advance(token, 'completed');
  assert.equal(state.accepts(token, { turnId: 'one' }), false);
});

test('terminal elapsed time freezes and confirmation wait never claims success', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  let now = 0;
  const state = createWorkbenchRequestState({ clock: () => now });
  const token = state.begin('A');
  now = 1000;
  state.advance(token, 'confirmation-wait');
  assert.equal(state.live(token), true);
  assert.throws(() => state.begin('A'));
  now = 5000;
  state.advance(token, 'failed');
  now = 9000;
  assert.equal(state.snapshot('A').elapsedMs, 5000);
  assert.equal(state.snapshot('A').phase, 'failed');
});

// 11-20: 「실패」로 묶던 끝을 뜻대로 나눈다 — 앞 결과를 둔 끝·연결 대기·로그인 대기.
test('ended requests are labelled by what actually happened, not as failure', async () => {
  const { createWorkbenchRequestState, isTerminalRequestPhase, requestPhaseLabel, requestPhaseOutcome } = await import(moduleUrl);
  const state = createWorkbenchRequestState();
  for (const phase of ['kept-previous', 'offline-wait', 'login-wait']) {
    const token = state.begin('A');
    assert.equal(state.advance(token, phase), true);
    assert.equal(state.live(token), false, `${phase} ends the request`);
    assert.equal(isTerminalRequestPhase(phase), true);
    assert.doesNotThrow(() => state.begin('A').requestId, `${phase}: resuming starts a new request`);
    state.forget('A');
  }
  assert.equal(requestPhaseLabel('kept-previous'), '완료 · 앞 결과를 그대로 두었습니다');
  assert.equal(requestPhaseLabel('offline-wait'), '연결 대기');
  assert.equal(requestPhaseLabel('login-wait'), '로그인 대기');
  assert.equal(requestPhaseLabel('failed'), '실패');
  assert.equal(requestPhaseLabel('generating'), '변환 중');
  assert.equal(requestPhaseLabel('generating', { creating: true }), '생성 중');
  assert.match(requestPhaseLabel('offline-wait', { detail: true }), /연결되면 이어서/);
  assert.deepEqual(requestPhaseOutcome('offline-wait'), { outcome: 'failed', reason: 'offline', resumes: true });
  assert.deepEqual(requestPhaseOutcome('login-wait'), { outcome: 'failed', reason: 'login', resumes: true });
  assert.deepEqual(requestPhaseOutcome('kept-previous'), { outcome: 'failed', reason: null, resumes: false });
  assert.equal(requestPhaseOutcome('completed').outcome, 'completed');
  assert.equal(requestPhaseOutcome('cancelled').outcome, 'cancelled');
  assert.throws(() => state.advance(state.begin('B'), 'paused'), /Unknown request phase/);
});

test('generation failure wording names the cause and never the conversion copy', async () => {
  const { GENERATION_STOPPED, generationFailedText, failureReason } = await import(pathToFileURL(path.join(__dirname, '../js/ai-generation-copy.js')).href);
  assert.equal(GENERATION_STOPPED, '멈췄습니다 · 앞 결과는 그대로');
  assert.equal(generationFailedText(), '생성하지 못했습니다 · 앞 결과는 그대로');
  assert.match(generationFailedText('offline'), /^인터넷이 끊겨/);
  assert.match(generationFailedText('login'), /^AI 로그인이 없어/);
  for (const reason of ['ai', 'offline', 'login']) assert.doesNotMatch(generationFailedText(reason), /변환|입력과 코멘트|원본 유지|설명을 조금 바꿔/);
  const on = { online: true };
  assert.equal(failureReason(new Error('Codex 서버에 연결하지 못했습니다.'), on), 'offline');
  assert.equal(failureReason(new Error('Codex 로그인이 필요합니다. 연결 정보에서 로그인해 주세요.'), on), 'login');
  assert.equal(failureReason(new Error('TypeError: Failed to fetch'), on), 'offline');
  assert.equal(failureReason(Object.assign(new Error('x'), { code: 'GRAPH_CONNECTION' }), on), 'offline');
  assert.equal(failureReason(Object.assign(new Error('x'), { code: 'GRAPH_AUTH' }), on), 'login');
  assert.equal(failureReason(new Error('그래프 결과가 검증을 통과하지 못했습니다.'), on), 'ai');
  assert.equal(failureReason(new Error('Codex 요청이 거절되었습니다(400)'), on), 'ai');
  assert.equal(failureReason(null, on), 'ai');
  assert.equal(failureReason(new Error('anything'), { online: false }), 'offline');
  assert.equal(failureReason(null, { health: { authRequired: true }, online: true }), 'login');
  assert.equal(failureReason(null, { health: { offline: true }, online: true }), 'offline');
});
