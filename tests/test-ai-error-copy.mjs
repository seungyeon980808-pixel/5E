// PATHFIX(11-20): IPC 거절 머리말 걷기·코드 읽기·한국어 안내(js/ai-error-copy.js)와 그것을 쓰는 분류기들.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripIpcPrefix, aiErrorCode, aiErrorText, describeAiError, codexMissing } from '../js/ai-error-copy.js';
import { describeGraphFailure } from '../js/graph/reconstruction-error.js';
import { failureReason, generationFailedText } from '../js/ai-generation-copy.js';
import { classifyAiError } from '../js/ai-engines.js';

const enoent = new Error("Error invoking remote method 'codex:models': Error: spawn codex ENOENT");
const marked = new Error("Error invoking remote method 'codex:models': Error: [CODEX_NOT_FOUND] 이 컴퓨터에서 Codex 프로그램을 찾지 못했습니다.");

test('Electron 머리말을 걷고 코드를 읽는다', () => {
  assert.equal(stripIpcPrefix(enoent), 'spawn codex ENOENT');
  assert.equal(aiErrorCode(enoent), 'CODEX_NOT_FOUND');
  assert.equal(aiErrorCode(marked), 'CODEX_NOT_FOUND');
  assert.equal(aiErrorCode({ ok: false, code: 'CODEX_LOGIN_FAILED', message: '[CODEX_LOGIN_FAILED] x' }), 'CODEX_LOGIN_FAILED');
  assert.equal(aiErrorCode(new Error("Error invoking remote method 'codex:send': Error: [CODEX_EXITED] 멈춤")), 'CODEX_EXITED');
  assert.equal(aiErrorCode(new Error('평범한 오류')), '');
});
test('화면 글은 한국어, 영어 원문·표식이 남지 않는다', () => {
  for (const error of [enoent, marked]) {
    const text = aiErrorText(error);
    assert.match(text, /Codex 프로그램을 찾지 못했습니다/);
    assert.doesNotMatch(text, /Error invoking|ENOENT|\[CODEX_/);
  }
  assert.equal(aiErrorText(new Error("Error invoking remote method 'codex:send': Error: 이전 AI 작업을 종료하고 있습니다.")), '이전 AI 작업을 종료하고 있습니다.');
  const described = describeAiError(enoent);
  assert.equal(described.install, true);
  assert.equal(described.detail, 'spawn codex ENOENT', '원문은 detail로 남긴다(오류 기록용)');
});
test('설치 안 됨과 로그인 안 됨을 나눈다', () => {
  assert.equal(codexMissing({ installed: false, login: { installed: false, loggedIn: null } }), true);
  assert.equal(codexMissing({ installed: true, login: { installed: true, loggedIn: false } }), false);
  assert.equal(codexMissing({ login: { loggedIn: false } }), false, '예전 main(installed 없음)은 설치된 것으로 본다');
});
test('그래프 복원 실패·생성 실패·엔진 분류도 같은 코드로', () => {
  const graph = describeGraphFailure(enoent);
  assert.equal(graph.code, 'GRAPH_CODEX_MISSING');
  assert.doesNotMatch(graph.message, /Error invoking|ENOENT/);
  assert.equal(graph.detail, 'spawn codex ENOENT');
  assert.equal(describeGraphFailure(new Error("Error invoking remote method 'codex:send': Error: [CODEX_NOT_LOGGED_IN] 만료")).code, 'GRAPH_AUTH');
  assert.equal(failureReason(enoent, { online: true }), 'install');
  assert.match(generationFailedText('install'), /Codex 프로그램/);
  assert.equal(classifyAiError(marked), 'auth', '다시 불러도 소용없는 고장 — 연결 화면으로');
  assert.equal(classifyAiError(new Error("Error invoking remote method 'codex:read-image-text': Error: Codex 응답 오류(503)")), 'transport');
});
