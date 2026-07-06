/* ===== AI CLIENT (5E AI 프록시 어댑터) ===== */
//
// 브라우저는 Pollinations를 직접 호출할 수 없다(봇 차단 Turnstile로 403). 그래서
// 실제 호출은 Cloudflare Worker 프록시(cloudflare-worker/)가 서버측에서 대신 하고,
// 브라우저는 그 Worker 주소로만 요청한다. 비밀 토큰은 Worker에만 있고 여기엔 없다.
//
// - 프록시 주소는 localStorage에만 둔다(비밀 아님, 배포 후 1회 입력). 코드/저장소에
//   하드코딩하지 않아 사람마다 다른 Worker를 쓸 수 있다.
// - 무료 등급 요청 간격(약 5초)을 cooldown으로 관리한다. UI는 cooldownRemainingMs()로
//   남은 시간을 읽어 전송 버튼을 잠근다.

const PROXY_URL_KEY = "5e.ai.proxyUrl";
const COOLDOWN_MS = 6000;

let lastRequestAt = 0;

/* ===== PROXY URL ===== */
export function getProxyUrl() {
  try { return localStorage.getItem(PROXY_URL_KEY) || ""; } catch { return ""; }
}
export function setProxyUrl(url) {
  try {
    if (url) localStorage.setItem(PROXY_URL_KEY, url);
    else localStorage.removeItem(PROXY_URL_KEY);
  } catch { /* localStorage 불가 환경: 이 세션에서는 설정 불가 */ }
}
export function hasProxy() {
  return !!getProxyUrl();
}

/* ===== COOLDOWN ===== */
export function cooldownRemainingMs() {
  return Math.max(0, lastRequestAt + COOLDOWN_MS - Date.now());
}

/* ===== CHAT ===== */
// messages: [{role:"system"|"user"|"assistant", content:string}, ...]
// 성공 시 응답 텍스트 반환, 실패 시 사용자에게 보여줄 한국어 Error를 던진다.
export async function chatCompletion(messages) {
  const proxy = getProxyUrl();
  if (!proxy) {
    throw new Error(
      "AI 프록시 주소가 설정되지 않았습니다. 하단 [프록시 설정]에서 Worker 주소를 입력해 주세요."
    );
  }

  lastRequestAt = Date.now();
  let res;
  try {
    res = await fetch(proxy, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch {
    throw new Error("AI 프록시에 연결하지 못했습니다. 주소와 인터넷 연결을 확인해 주세요.");
  }

  if (res.status === 403) {
    throw new Error(
      "프록시가 이 사이트의 요청을 거부했습니다. Worker의 허용 출처(ALLOWED_ORIGINS)에 " +
      "현재 주소가 들어 있는지 확인해 주세요."
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
