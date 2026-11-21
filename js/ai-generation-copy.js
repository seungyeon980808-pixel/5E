import { aiErrorCode } from './ai-error-copy.js?v=1.7.0-four-session-integration';
// 11-20: AI 그림·그래프 「생성」의 실패·멈춤 문구. 변환(원본을 다시 그리기) 문구는 그대로 둔다.
// 생성은 원본이 없으므로 「입력과 코멘트는 보존」「원본 유지」 대신 「앞 결과는 그대로」라고 말하고,
// 못 낸 까닭을 셋으로 나눠 말한다: 인터넷 끊김(offline) · 로그인 없음(login) · AI 오류(ai).

export const GENERATION_STOPPED = '멈췄습니다 · 앞 결과는 그대로';

const FAILED = Object.freeze({
  ai: '생성하지 못했습니다 · 앞 결과는 그대로',
  offline: '인터넷이 끊겨 생성하지 못했습니다 · 앞 결과는 그대로',
  login: 'AI 로그인이 없어 생성하지 못했습니다 · 앞 결과는 그대로',
  install: 'Codex 프로그램을 찾지 못해 생성하지 못했습니다 · 앞 결과는 그대로',
});

export const generationFailedText = (reason = 'ai') => FAILED[reason] || FAILED.ai;

// 오류·엔진 상태로 원인을 고른다. 로그인 문구에 「연결」이 들어 있어 로그인을 먼저 본다.
export function failureReason(error, { health = null, online = globalThis.navigator?.onLine } = {}) {
  if (health?.authRequired) return 'login';
  if (health?.offline || online === false) return 'offline';
  const code = String(error?.code || '');
  // PATHFIX: Codex가 없음(설치 안내로) · 로그인 표식은 글보다 먼저 본다.
  const codex = aiErrorCode(error);
  if (code === 'GRAPH_CODEX_MISSING' || codex === 'CODEX_NOT_FOUND') return 'install';
  if (codex === 'CODEX_NOT_LOGGED_IN') return 'login';
  if (code === 'GRAPH_AUTH') return 'login';
  if (code === 'GRAPH_CONNECTION') return 'offline';
  const text = String(error?.message || error || '');
  if (/로그인|\b401\b|unauthori[sz]ed|not logged in/i.test(text)) return 'login';
  if (/인터넷|연결하지 못|연결이 끊|network|fetch failed|failed to fetch|internetdisconnected|offline|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(text)) return 'offline';
  return 'ai';
}
