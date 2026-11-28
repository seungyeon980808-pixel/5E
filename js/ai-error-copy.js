// PATHFIX(11-20): AI 연결 오류를 화면에 보일 한국어로 바꾸는 공통 함수.
// Electron은 IPC 거절을 「Error invoking remote method 'codex:models': Error: spawn codex ENOENT」처럼 감싸 보낸다 —
// 이 머리말을 걷어 내고, main(desktop/codex-binary.cjs)이 붙인 고정 표식 [CODEX_…]이나 알려진 원문을 코드로 읽어 안내 글로 바꾼다.
// 원문은 detail로 남겨 오류 기록(ai-turns.log·화면 오류 기록)에 들어가게 한다.

export const CODEX_INSTALL_COMMANDS = Object.freeze({ mac: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh', windows: 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"', npm: 'npm i -g @openai/codex' });

const IPC_PREFIX = /^\s*(?:Error invoking remote method '[^']*':\s*)+(?:[A-Za-z]*Error:\s*)?/;
const MARKER = /^\s*\[(CODEX_[A-Z_]+)\]\s*/;

const COPY = Object.freeze({
  CODEX_NOT_FOUND: '이 컴퓨터에서 Codex 프로그램을 찾지 못했습니다. 설치한 뒤 「다시 찾기」를 누르면 멈춘 요청을 이어서 합니다.',
  CODEX_SPAWN_FAILED: 'Codex 프로그램을 실행하지 못했습니다. 다시 시도해도 같으면 Codex를 다시 설치해 주세요.',
  CODEX_EXITED: 'AI 연결 프로그램(Codex)이 멈췄습니다. 다시 실행하면 새로 띄웁니다.',
  CODEX_NOT_LOGGED_IN: 'GPT(ChatGPT 계정) 로그인이 필요합니다. 연결 정보의 「GPT 로그인」을 누르면 로그인한 뒤 이어서 합니다.',
  CODEX_LOGIN_FAILED: 'GPT 로그인을 마치지 못했습니다. 「GPT 로그인」을 다시 눌러 주세요.',
  CODEX_LOGIN_TIMEOUT: '로그인을 10분 안에 마치지 못했습니다. 「GPT 로그인」을 다시 눌러 주세요.',
});

const rawText = value => String(value?.message ?? value ?? '');

/** 「Error invoking remote method …: Error:」 머리말을 걷어 낸다(여러 겹이어도). */
export function stripIpcPrefix(value) {
  return rawText(value).replace(IPC_PREFIX, '');
}

/** 오류에서 안정된 코드를 읽는다: error.code → 고정 표식 → 알려진 원문. 모르면 ''. */
export function aiErrorCode(value) {
  const own = typeof value?.code === 'string' && /^CODEX_/.test(value.code) ? value.code : '';
  if (own) return own;
  const text = stripIpcPrefix(value);
  const marker = text.match(MARKER);
  if (marker) return marker[1];
  if (/\bENOENT\b|spawn codex|is not recognized as an internal or external command|내부 또는 외부 명령|command not found: codex/i.test(text)) return 'CODEX_NOT_FOUND';
  if (/Codex App Server exited|Codex App Server가 실행되지 않았습니다/i.test(text)) return 'CODEX_EXITED';
  return '';
}

/** 화면에 보일 한국어 한 줄. 알려진 코드는 안내 글, 그 밖은 머리말·표식을 걷은 원문. */
export function aiErrorText(value, fallback = 'AI 요청을 마치지 못했습니다.') {
  const code = aiErrorCode(value);
  if (COPY[code]) return COPY[code];
  const text = stripIpcPrefix(value).replace(MARKER, '').trim();
  return text || fallback;
}

/** { code, message(한국어), detail(원문, 머리말만 걷음), install, login } */
export function describeAiError(value) {
  const code = aiErrorCode(value);
  return { code, message: aiErrorText(value), detail: stripIpcPrefix(value).trim(), install: code === 'CODEX_NOT_FOUND', login: code === 'CODEX_NOT_LOGGED_IN' };
}

/** codex:status 결과가 「설치 안 됨」인지(로그인 안 됨과 구분). */
export function codexMissing(status) {
  const login = status?.login ?? status;
  return status?.installed === false || login?.installed === false;
}

/** 실패를 설치판 오류 기록(ai-turns.log, 도움말 > AI 오류 기록 열기)에 남긴다. 웹·검사 환경에서는 조용히 넘긴다. */
export function reportAiError(where, value, context = '') {
  try {
    const bridge = globalThis.fiveEDesktop?.diagnostics;
    if (typeof bridge?.logError !== 'function') return;
    const described = describeAiError(value);
    void Promise.resolve(bridge.logError({ where: String(where || ''), code: described.code || (typeof value?.code === 'string' ? value.code : ''),
      message: described.message, detail: described.detail, context: typeof context === 'string' ? context : JSON.stringify(context ?? '') })).catch(() => {});
  } catch { /* 기록 실패가 화면 동작을 막지 않게 */ }
}
