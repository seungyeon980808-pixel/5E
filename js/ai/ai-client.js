/* ===== AI CLIENT (무료 AI API 어댑터: Pollinations.AI) ===== */
//
// 텍스트(챗) 호출 어댑터. 이미지 생성/변환은 다음 단계에서 이 모듈에 추가한다.
// - 익명 무료 티어는 요청 간격 제한(약 15초)이 있어 cooldown을 여기서 관리한다.
//   UI는 cooldownRemainingMs()로 남은 시간을 읽어 전송 버튼을 잠근다.
// - 토큰(무료 가입 시 발급)은 localStorage에만 두고 코드/저장소에 절대 넣지
//   않는다 (docs/IMAGE_TO_OBJECT_API_DESIGN_20260630.md §3 보안 요구사항).

const TEXT_ENDPOINT = "https://text.pollinations.ai/openai";
const TEXT_MODEL = "openai-fast";
const COOLDOWN_MS = 15000;
const TOKEN_KEY = "5e.ai.token";
// Pollinations 웹앱 식별자 (enter.pollinations.ai에 등록한 앱 도메인과 일치시킬 것).
// 미등록 상태의 익명 브라우저 요청은 Turnstile(봇 방지)에 걸려 403이 난다 — 2026-07-06 실측.
const APP_REFERRER = "5e-science-draw";

let lastRequestAt = 0;

/* ===== TOKEN (등록 티어 준비용 — 현재 챗은 토큰 없이도 동작) ===== */
export function getAiToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
export function setAiToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* localStorage 불가 환경에서는 세션 한정으로만 동작 */ }
}

/* ===== COOLDOWN ===== */
export function cooldownRemainingMs() {
  return Math.max(0, lastRequestAt + COOLDOWN_MS - Date.now());
}

/* ===== CHAT ===== */
// messages: [{role:"system"|"user"|"assistant", content:string}, ...]
// 성공 시 응답 텍스트를 반환하고, 실패 시 사용자에게 보여줄 한국어 Error를 던진다.
export async function chatCompletion(messages) {
  const headers = { "Content-Type": "application/json" };
  const token = getAiToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  lastRequestAt = Date.now();
  let res;
  try {
    res = await fetch(TEXT_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: TEXT_MODEL, max_tokens: 1500, referrer: APP_REFERRER, messages,
      }),
    });
  } catch {
    throw new Error("AI 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.");
  }

  if (res.status === 403) {
    // 익명 브라우저 접근은 Turnstile로 차단됨 — 무료 가입 토큰/앱 등록이 필요
    throw new Error(
      "AI 서비스 인증이 필요합니다. enter.pollinations.ai에서 무료 가입 후 " +
      "발급받은 토큰을 아래 [토큰 설정]에 입력해 주세요."
    );
  }
  if (res.status === 429) {
    throw new Error("무료 사용량 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!res.ok) {
    throw new Error(`AI 서버 오류가 발생했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`);
  }

  const data = await res.json().catch(() => null);
  const content = data && data.choices && data.choices[0] &&
    data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error("AI 응답이 비어 있습니다. 다시 시도해 주세요.");
  return String(content).trim();
}
