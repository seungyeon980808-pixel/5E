/* ===== 5E AI 프록시 (Cloudflare Worker) =====
 *
 * 역할: 브라우저(5E 앱)의 요청을 받아, Pollinations 텍스트 API로 중계한다.
 * 왜 필요한가:
 *   - Pollinations는 브라우저에서 직접 오는 요청을 봇 차단(Turnstile)으로 막는다.
 *   - 서버(이 Worker)에서 보내는 요청은 통과한다.
 *   - 비밀키(sk_)를 브라우저에 노출하지 않고 Worker의 secret으로만 보관한다.
 *
 * 설정해야 할 것 (README.md 참고):
 *   - env.POLLINATIONS_TOKEN : Pollinations sk_ 토큰 (Worker Secret으로 등록)
 *   - 아래 ALLOWED_ORIGINS   : 5E 앱이 열리는 주소 목록 (본인 환경에 맞게 수정)
 */

// 이 프록시를 사용할 수 있는 출처(도메인) 화이트리스트.
// 여기에 없는 사이트에서의 요청은 거부해, 남의 사이트가 선생님 토큰을 쓰지 못하게 한다.
const ALLOWED_ORIGINS = [
  "http://localhost:8250",                       // 로컬 개발(ai-dev)
  "http://localhost:8000",                       // 로컬 개발(work-dev)
  "https://seungyeon980808-pixel.github.io",     // GitHub Pages 배포 도메인 (실제 배포 시 확인/수정)
];

const UPSTREAM = "https://text.pollinations.ai/openai";
const APP_REFERRER = "5e-science-draw";

function corsHeaders(origin) {
  // 허용된 출처면 그 출처를 그대로 반사, 아니면 첫 번째(기본)로 응답
  const allow = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "POST 요청만 허용됩니다." }, 405, origin);
    }
    // 출처 화이트리스트 검사
    if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return json({ error: "허용되지 않은 출처입니다." }, 403, origin);
    }
    // 토큰 미설정 방어
    if (!env.POLLINATIONS_TOKEN) {
      return json({ error: "서버에 토큰이 설정되지 않았습니다 (POLLINATIONS_TOKEN)." }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "잘못된 요청 형식입니다." }, 400, origin);
    }
    const messages = Array.isArray(body.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
      return json({ error: "messages 필드가 필요합니다." }, 400, origin);
    }

    // 남용 방지: 최근 8개 메시지, 각 4000자 상한으로 잘라 upstream에 전달
    const trimmed = messages.slice(-8).map(function (m) {
      return {
        role: String((m && m.role) || "user"),
        content: String((m && m.content) || "").slice(0, 4000),
      };
    });

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + env.POLLINATIONS_TOKEN,
        },
        body: JSON.stringify({
          model: typeof body.model === "string" ? body.model : "openai-fast",
          max_tokens: Math.min(Number(body.max_tokens) || 1000, 1500),
          referrer: APP_REFERRER,
          messages: trimmed,
        }),
      });
    } catch (e) {
      return json({ error: "AI 서버에 연결하지 못했습니다." }, 502, origin);
    }

    // upstream 응답(성공/실패 JSON)을 그대로 브라우저로 전달
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(origin)),
    });
  },
};
