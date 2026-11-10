// 11-10: 그림 생성·글 읽기를 codex app-server(에이전트)를 거치지 않고 Codex 로그인으로 직접 부른다.
// 에이전트가 붙은 그림을 referenced_image_paths로 잘못 넘겨 즉시 실패하는 일을 피하려고 만들었다.
// 로그인 정보(auth.json)는 읽기만 한다. 토큰을 갱신하거나 파일을 쓰지 않는다(갱신은 Codex가 한다).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 1_000;
const IMAGE_URL_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function directError(code, message, { retryable = false, status = null } = {}) {
  const error = new Error(message);
  error.direct = true;
  error.code = code;
  error.retryable = retryable;
  error.status = status;
  return error;
}

// 11-10: 로그인 파일은 매번 읽는다(Codex가 토큰을 갱신하면 다음 시도가 새 토큰을 쓴다). 값은 어디에도 기록하지 않는다.
function readCodexAuth() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(path.join(home, "auth.json"), "utf8")); }
  catch { throw directError("DIRECT_AUTH", "Codex 로그인 정보를 읽지 못했습니다."); }
  const tokens = parsed?.tokens;
  if (!tokens?.access_token || !tokens?.account_id) throw directError("DIRECT_AUTH", "Codex 로그인 정보가 없습니다.");
  return { accessToken: tokens.access_token, accountId: tokens.account_id };
}

function buildBody({ model, text, attachments, image }) {
  if (typeof model !== "string" || !model) throw directError("DIRECT_INPUT", "모델이 지정되지 않았습니다.");
  if (typeof text !== "string") throw directError("DIRECT_INPUT", "요청 글이 문자열이 아닙니다.");
  if (!Array.isArray(attachments) || attachments.length > 16) throw directError("DIRECT_INPUT", "참고 이미지 수가 너무 많습니다.");
  for (const url of attachments) {
    if (typeof url !== "string" || !IMAGE_URL_PATTERN.test(url)) throw directError("DIRECT_INPUT", "PNG/JPEG/WebP 참고 이미지가 필요합니다.");
  }
  const body = {
    model,
    instructions: "",
    store: false,
    stream: true,
    input: [{
      role: "user",
      content: [
        ...attachments.map(url => ({ type: "input_image", image_url: url })),
        { type: "input_text", text },
      ],
    }],
  };
  // reasoning과 service_tier는 보내지 않는다(그림 모델에 복잡도로 전달돼 거절되거나 효과가 없다).
  if (image) {
    body.tools = [{ type: "image_generation", size: "auto", quality: "high" }];
    body.tool_choice = { type: "image_generation" };
  }
  return body;
}

// SSE 본문을 이벤트 객체 목록으로 바꾼다. 해석할 수 없는 줄은 건너뛴다.
function parseSse(text) {
  const events = [];
  for (const line of String(text).split("\n")) {
    if (!line.startsWith("data:")) continue;
    try { events.push(JSON.parse(line.slice(5).trim())); } catch {}
  }
  return events;
}

function imageFromEvents(events) {
  let failure = null;
  let image = null;
  for (const event of events) {
    if (event?.type === "response.failed" || event?.type === "error") failure = event.response?.error || event.error || event;
    if (event?.type === "response.output_item.done" && event.item?.type === "image_generation_call" && typeof event.item.result === "string" && event.item.result) {
      image = event.item.result;
    }
  }
  return { image, failure };
}

function textFromEvents(events) {
  let streamed = "";
  let done = "";
  for (const event of events) {
    if (event?.type === "response.output_text.delta" && typeof event.delta === "string") streamed += event.delta;
    if (event?.type === "response.output_text.done" && typeof event.text === "string") done = event.text;
  }
  return (streamed || done).trim();
}

function createDirectImageClient({
  fetchImpl = globalThis.fetch,
  readAuth = readCodexAuth,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  backoffMs = DEFAULT_BACKOFF_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  log = () => {},
} = {}) {
  const safeLog = entry => { try { log(entry); } catch {} };

  // 한 번의 요청. 성공하면 SSE 본문 전체를 돌려주고, 실패는 code/retryable을 붙인 오류로 던진다.
  async function postOnce(body, signal) {
    const auth = readAuth();
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "chatgpt-account-id": auth.accountId,
          "OpenAI-Beta": "responses=experimental",
          originator: "codex_cli_rs",
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) throw directError("DIRECT_AUTH", "Codex 로그인이 만료되었거나 권한이 없습니다.", { status: res.status });
      if (res.status === 429 || res.status >= 500) throw directError("DIRECT_HTTP", `Codex 응답 오류(${res.status})`, { retryable: true, status: res.status });
      if (res.status !== 200) throw directError("DIRECT_HTTP", `Codex 요청이 거절되었습니다(${res.status})`, { status: res.status });
      return await res.text();
    } catch (error) {
      if (error?.direct) throw error;
      if (signal?.aborted) throw directError("DIRECT_ABORTED", "AI 작업이 취소되었습니다.");
      if (timedOut) throw directError("DIRECT_TIMEOUT", "Codex 응답 시간이 초과되었습니다.", { retryable: true });
      throw directError("DIRECT_NETWORK", "Codex 서버에 연결하지 못했습니다.", { retryable: true });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  // 재시도 정책: 네트워크·429·5xx·시간 초과·빈 결과만 다시 보낸다. 인증 오류는 바로 던져 호출자가 기존 경로로 넘긴다.
  async function run({ kind, model, body, signal, parse }) {
    const started = Date.now();
    for (let attempt = 1; ; attempt += 1) {
      safeLog({ event: "direct-send", kind, model, attempt });
      try {
        const events = parseSse(await postOnce(body, signal));
        const value = parse(events);
        if (!value) throw directError("DIRECT_EMPTY", "결과가 비어 있습니다.", { retryable: true });
        safeLog({ event: "direct-done", kind, model, attempt, ms: Date.now() - started });
        return { value, attempts: attempt, ms: Date.now() - started };
      } catch (error) {
        const aborted = error?.code === "DIRECT_ABORTED" || signal?.aborted === true;
        safeLog({ event: "direct-error", kind, model, attempt, code: error?.code || "DIRECT_UNKNOWN", status: error?.status ?? null,
          ms: Date.now() - started, message: aborted ? null : String(error?.message || error).slice(0, 200) });
        if (aborted) throw error.code === "DIRECT_ABORTED" ? error : directError("DIRECT_ABORTED", "AI 작업이 취소되었습니다.");
        if (!error?.retryable || attempt > retries) throw error;
        await sleep(backoffMs * attempt);
      }
    }
  }

  // 그림 한 장을 만든다. 결과는 PNG data URL이다.
  async function generate({ model, text, attachments = [], signal } = {}) {
    const body = buildBody({ model, text, attachments, image: true });
    const { value, attempts, ms } = await run({ kind: "image", model, body, signal,
      parse: events => {
        const { image, failure } = imageFromEvents(events);
        if (image) return `data:image/png;base64,${image}`;
        if (failure) throw directError("DIRECT_FAILED", "Codex가 그림 생성을 완료하지 못했습니다.", { status: null });
        return null;
      } });
    return { imageDataUrl: value, attempts, ms };
  }

  // 글만 읽는다(라벨 읽기 등). 도구 없이 출력 글을 모은다.
  async function readText({ model, text, attachments = [], signal } = {}) {
    const body = buildBody({ model, text, attachments, image: false });
    const { value, attempts, ms } = await run({ kind: "text", model, body, signal, parse: events => textFromEvents(events) || null });
    return { text: value, attempts, ms };
  }

  // 11-10: 그림 요청을 보내기 전에 동기로 확인한다(입력 형식·로그인 파일). 실패하면 바로 던져 호출자가 에이전트 경로로 넘긴다.
  // 네트워크 호출은 하지 않는다. 그래서 응답을 기다리지 않고 바로 돌려줄 수 있다.
  function precheck({ model, text, attachments = [], image = true } = {}) {
    buildBody({ model, text, attachments, image });
    readAuth();
  }

  return { generate, readText, precheck };
}

module.exports = { createDirectImageClient, readCodexAuth, buildBody, parseSse, ENDPOINT };
