// 11-10: 직접 그림 호출 클라이언트 검사. 가짜 fetch로 성공·재시도·시간 초과·인증·빈 결과·취소를 확인한다.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDirectImageClient, readCodexAuth, buildBody, ENDPOINT } = require("./ai-direct-image.cjs");

const PNG_URL = "data:image/png;base64,aW1hZ2U=";
const AUTH = () => ({ accessToken: "secret-token-value", accountId: "acct-1" });
const sse = events => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("");
const imageSse = (b64 = "aW1hZ2U=") => sse([
  { type: "response.created" },
  { type: "response.output_item.done", item: { type: "image_generation_call", result: b64 } },
  { type: "response.completed" },
]);
const response = (status, body = "") => ({ status, text: async () => body });
const hangUntilAbort = init => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

// steps: 호출 순서대로 응답. 함수면 init을 받아 응답 또는 Promise를 돌려준다. 마지막 step이 계속 반복된다.
function fakeFetch(steps) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return typeof step === "function" ? step(init) : step;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function clientWith(fetchImpl, extra = {}) {
  const logs = [];
  const client = createDirectImageClient({
    fetchImpl, readAuth: AUTH, backoffMs: 0, timeoutMs: 50, log: entry => logs.push(entry), ...extra,
  });
  return { client, logs };
}

test("success sends the image tool body and returns a PNG data URL", async () => {
  const fetchImpl = fakeFetch([response(200, imageSse())]);
  const { client, logs } = clientWith(fetchImpl);
  const result = await client.generate({ model: "gpt-6-luna", text: "그림을 그려 줘", attachments: [PNG_URL] });
  assert.equal(result.imageDataUrl, "data:image/png;base64,aW1hZ2U=");
  assert.equal(result.attempts, 1);
  assert.equal(typeof result.ms, "number");
  const [call] = fetchImpl.calls;
  assert.equal(call.url, ENDPOINT);
  assert.equal(call.init.headers.Authorization, "Bearer secret-token-value");
  assert.equal(call.init.headers["chatgpt-account-id"], "acct-1");
  assert.equal(call.body.stream, true);
  assert.equal(call.body.store, false);
  assert.equal(Object.hasOwn(call.body, "reasoning"), false);
  assert.equal(Object.hasOwn(call.body, "service_tier"), false);
  assert.deepEqual(call.body.tools, [{ type: "image_generation", size: "auto", quality: "high" }]);
  assert.deepEqual(call.body.tool_choice, { type: "image_generation" });
  assert.deepEqual(call.body.input[0].content[0], { type: "input_image", image_url: PNG_URL });
  assert.equal(call.body.input[0].content.at(-1).type, "input_text");
  assert.deepEqual(logs.map(entry => entry.event), ["direct-send", "direct-done"]);
  // 기록에는 토큰이 들어가지 않는다.
  assert.equal(JSON.stringify(logs).includes("secret-token-value"), false);
});

test("a 500 response is retried and the second attempt succeeds", async () => {
  const fetchImpl = fakeFetch([response(500, "boom"), response(200, imageSse())]);
  const { client, logs } = clientWith(fetchImpl);
  const result = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] });
  assert.equal(result.attempts, 2);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(logs.find(entry => entry.event === "direct-error").code, "DIRECT_HTTP");
});

test("a per-attempt timeout is retried", async () => {
  const fetchImpl = fakeFetch([hangUntilAbort, response(200, imageSse())]);
  const { client, logs } = clientWith(fetchImpl, { timeoutMs: 20 });
  const result = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] });
  assert.equal(result.attempts, 2);
  assert.equal(logs.find(entry => entry.event === "direct-error").code, "DIRECT_TIMEOUT");
});

test("network errors are retried up to the retry limit then rejected", async () => {
  const fetchImpl = fakeFetch([() => { throw new TypeError("fetch failed"); }]);
  const { client } = clientWith(fetchImpl, { retries: 2 });
  await assert.rejects(client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }),
    error => error.code === "DIRECT_NETWORK");
  assert.equal(fetchImpl.calls.length, 3);
});

test("auth failures are thrown immediately without retry", async () => {
  const fetchImpl = fakeFetch([response(401, "nope")]);
  const { client } = clientWith(fetchImpl);
  await assert.rejects(client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }),
    error => error.code === "DIRECT_AUTH");
  assert.equal(fetchImpl.calls.length, 1);
});

test("a missing login file is a DIRECT_AUTH error and is not retried", async () => {
  const fetchImpl = fakeFetch([response(200, imageSse())]);
  const client = createDirectImageClient({
    fetchImpl, backoffMs: 0,
    readAuth: () => { throw Object.assign(new Error("no auth"), { direct: true, code: "DIRECT_AUTH" }); },
  });
  await assert.rejects(client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }),
    error => error.code === "DIRECT_AUTH");
  assert.equal(fetchImpl.calls.length, 0);
});

test("an empty image result is retried", async () => {
  const fetchImpl = fakeFetch([response(200, sse([{ type: "response.completed" }])), response(200, imageSse())]);
  const { client } = clientWith(fetchImpl);
  const result = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] });
  assert.equal(result.attempts, 2);
  assert.equal(result.imageDataUrl, "data:image/png;base64,aW1hZ2U=");
});

test("a failed response event is not retried and reports DIRECT_FAILED", async () => {
  const fetchImpl = fakeFetch([response(200, sse([{ type: "response.failed", response: { error: { message: "policy" } } }]))]);
  const { client } = clientWith(fetchImpl);
  await assert.rejects(client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }),
    error => error.code === "DIRECT_FAILED");
  assert.equal(fetchImpl.calls.length, 1);
});

test("aborting the caller signal rejects with DIRECT_ABORTED and does not retry", async () => {
  const fetchImpl = fakeFetch([hangUntilAbort, response(200, imageSse())]);
  const { client } = clientWith(fetchImpl, { timeoutMs: 5000 });
  const controller = new AbortController();
  const pending = client.generate({ model: "gpt-6-luna", text: "x", attachments: [], signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, error => error.code === "DIRECT_ABORTED");
  assert.equal(fetchImpl.calls.length, 1);
});

test("readText collects streamed output text", async () => {
  const fetchImpl = fakeFetch([response(200, sse([
    { type: "response.output_text.delta", delta: "라벨 " },
    { type: "response.output_text.delta", delta: "A" },
    { type: "response.completed" },
  ]))]);
  const { client } = clientWith(fetchImpl);
  const result = await client.readText({ model: "gpt-6-luna", text: "읽어 줘", attachments: [PNG_URL] });
  assert.equal(result.text, "라벨 A");
  assert.equal(Object.hasOwn(fetchImpl.calls[0].body, "tools"), false);
});

test("readText retries an empty answer", async () => {
  const fetchImpl = fakeFetch([response(200, sse([{ type: "response.completed" }])), response(200, sse([
    { type: "response.output_text.done", text: "ok" },
  ]))]);
  const { client } = clientWith(fetchImpl);
  const result = await client.readText({ model: "gpt-6-luna", text: "x" });
  assert.equal(result.text, "ok");
  assert.equal(result.attempts, 2);
});

test("buildBody rejects non-image attachments before any request", () => {
  assert.throws(() => buildBody({ model: "m", text: "x", attachments: ["data:text/plain;base64,aGk="], image: true }),
    error => error.code === "DIRECT_INPUT");
  assert.throws(() => buildBody({ model: "", text: "x", attachments: [], image: true }), error => error.code === "DIRECT_INPUT");
});

test("readCodexAuth reads the login file read-only and reports missing login as DIRECT_AUTH", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "5e-direct-auth-"));
  const previous = process.env.CODEX_HOME;
  try {
    process.env.CODEX_HOME = dir;
    assert.throws(() => readCodexAuth(), error => error.code === "DIRECT_AUTH");
    const file = path.join(dir, "auth.json");
    fs.writeFileSync(file, JSON.stringify({ tokens: { access_token: "a", account_id: "b" } }));
    const before = fs.readFileSync(file, "utf8");
    assert.deepEqual(readCodexAuth(), { accessToken: "a", accountId: "b" });
    assert.equal(fs.readFileSync(file, "utf8"), before);
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("main and the preview bridge are wired to the direct client with an agent switch and a fallback log", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const bridge = fs.readFileSync(path.join(__dirname, "..", "scripts", "local-codex-bridge.cjs"), "utf8");
  for (const source of [main, bridge]) {
    assert.match(source, /FIVE_E_IMAGE_TRANSPORT/);
    assert.match(source, /direct-fallback/);
    assert.match(source, /createDirectImageClient/);
  }
  assert.match(main, /codex:read-image-text/);
  assert.match(main, /type:\s*"image",\s*url:\s*attachment\.data/);
});

// 11-10: precheck는 네트워크 없이 동기로 입력·로그인만 확인한다(보내기 응답을 기다리지 않게 하려고).
test("precheck is synchronous, makes no request, and throws for missing login or bad attachments", () => {
  const fetchImpl = fakeFetch([response(200, imageSse())]);
  const { client } = clientWith(fetchImpl);
  assert.equal(client.precheck({ model: "gpt-6-luna", text: "x", attachments: [PNG_URL], image: true }), undefined);
  assert.equal(fetchImpl.calls.length, 0);
  assert.throws(() => client.precheck({ model: "gpt-6-luna", text: "x", attachments: ["data:text/plain;base64,aGk="], image: true }),
    error => error.code === "DIRECT_INPUT");
  const noLogin = createDirectImageClient({
    fetchImpl, backoffMs: 0,
    readAuth: () => { throw Object.assign(new Error("no auth"), { direct: true, code: "DIRECT_AUTH" }); },
  });
  assert.throws(() => noLogin.precheck({ model: "gpt-6-luna", text: "x", attachments: [], image: true }),
    error => error.code === "DIRECT_AUTH");
  assert.equal(fetchImpl.calls.length, 0);
});

// generate는 응답이 나중에 와도 호출 즉시 돌아온다(보내기 응답과 생성 완료를 분리하는 전제).
test("generate stays pending until the image response arrives and does not block the caller's synchronous work", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const fetchImpl = fakeFetch([async () => { await gate; return response(200, imageSse()); }]);
  const { client } = clientWith(fetchImpl, { timeoutMs: 5000 });
  let settled = false;
  const pending = client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }).then(value => { settled = true; return value; });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(settled, false);
  release();
  assert.equal((await pending).imageDataUrl, "data:image/png;base64,aW1hZ2U=");
});

// main.cjs는 Electron 안에서만 돌아서 소스 연결을 확인한다: 보내기는 생성 완료를 기다리지 않고, 완료 이벤트는 같은 turnId로 보낸다.
test("main.cjs starts the direct image turn without awaiting the generation and finishes it through events", () => {
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(main, /const direct = startDirectImageTurn\(payload, owner, startedAt\);/);
  assert.doesNotMatch(main, /await directImageClient\.generate/);
  assert.match(main, /directImageClient\.precheck\(/);
  assert.match(main, /\.then\(\s*result => finishDirectImageTurn\(owner/);
  assert.match(main, /status: imageDataUrl \? "completed" : cancelled \? "interrupted" : "failed"/);
});

// PATHFIX(11-20): 401이면 Codex를 띄워 토큰을 새로 받게 한 뒤 한 번 더 보낸다(그래도 401이면 바로 던진다).
test("a 401 asks Codex to refresh the login once and retries", async () => {
  const fetchImpl = fakeFetch([response(401), response(200, imageSse())]);
  let refreshes = 0;
  const { client, logs } = clientWith(fetchImpl, { refreshAuth: async () => { refreshes += 1; return true; } });
  const result = await client.generate({ model: "gpt-6-luna", text: "그려 줘" });
  assert.equal(result.imageDataUrl, PNG_URL);
  assert.equal(refreshes, 1);
  assert.equal(fetchImpl.calls.length, 2);
  assert.ok(logs.some(entry => entry.event === "direct-auth-refresh" && entry.ok === true));
});
test("a failed refresh leaves the DIRECT_AUTH error and does not loop", async () => {
  const fetchImpl = fakeFetch([response(401)]);
  let refreshes = 0;
  const { client } = clientWith(fetchImpl, { refreshAuth: async () => { refreshes += 1; return refreshes === 1; } });
  await assert.rejects(client.generate({ model: "gpt-6-luna", text: "그려 줘" }), error => error.code === "DIRECT_AUTH");
  assert.equal(refreshes, 1);
  assert.equal(fetchImpl.calls.length, 2);
});
// 11-20: DIRECT_FAILED가 「완료하지 못했습니다」만 남기던 문제 — 실제 원인·요청 id·모델·걸린 시간을 오류와 기록에 남기고 비밀은 지운다.
const { redact, failureDetail } = require("./ai-direct-image.cjs");
const withHeaders = (status, body, headers = {}) => ({ status, text: async () => body, headers: { get: name => headers[name.toLowerCase()] ?? null } });

test("a failed response records the real reason, request id, model and elapsed time without secrets", async () => {
  const failed = sse([
    { type: "response.created", response: { id: "resp_123", model: "gpt-image-x" } },
    { type: "response.output_item.done", item: { type: "image_generation_call", id: "ig_1", status: "failed" } },
    { type: "response.failed", response: { id: "resp_123", status: "failed", model: "gpt-image-x",
      error: { code: "server_error", message: "Image generation failed. token secret-token-value Bearer abc.def data:image/png;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldY" } } },
  ]);
  const fetchImpl = fakeFetch([withHeaders(200, failed, { "x-request-id": "req-abc" })]);
  const { client, logs } = clientWith(fetchImpl);
  const error = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }).catch(e => e);
  assert.equal(error.code, "DIRECT_FAILED");
  assert.match(error.message, /Image generation failed/);
  assert.match(error.message, /server_error/);
  assert.equal(error.detail.requestId, "req-abc");
  assert.equal(error.detail.errorCode, "server_error");
  assert.equal(error.detail.responseId, "resp_123");
  assert.equal(error.detail.model, "gpt-image-x");
  assert.equal(error.detail.requestedModel, "gpt-6-luna");
  assert.equal(error.detail.imageCallStatus, "failed");
  assert.equal(typeof error.detail.elapsedMs, "number");
  const entry = logs.find(item => item.event === "direct-error");
  assert.equal(entry.code, "DIRECT_FAILED");
  assert.equal(entry.requestId, "req-abc");
  assert.equal(entry.errorCode, "server_error");
  assert.equal(entry.responseId, "resp_123");
  assert.equal(entry.responseModel, "gpt-image-x");
  assert.equal(entry.failedEvent, "response.failed");
  assert.match(entry.reason, /Image generation failed/);
  const dump = JSON.stringify({ logs, message: error.message, detail: error.detail });
  assert.doesNotMatch(dump, /secret-token-value/);
  assert.doesNotMatch(dump, /acct-1/);
  assert.doesNotMatch(dump, /Bearer abc/);
  assert.doesNotMatch(dump, /QUJDREVGR0hJSktMTU5PUFFSU1RVVldY/);
  assert.equal(fetchImpl.calls.length, 1, "실패 이벤트는 다시 보내지 않는다");
});

test("an 'error' stream event is reported as DIRECT_FAILED with its code and message", async () => {
  const fetchImpl = fakeFetch([response(200, sse([{ type: "error", code: "rate_limit_exceeded", message: "Too many image requests" }]))]);
  const { client, logs } = clientWith(fetchImpl);
  const error = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }).catch(e => e);
  assert.equal(error.code, "DIRECT_FAILED");
  assert.equal(error.detail.errorCode, "rate_limit_exceeded");
  assert.match(error.message, /Too many image requests/);
  assert.equal(logs.find(item => item.event === "direct-error").errorCode, "rate_limit_exceeded");
});

test("a rejected HTTP request keeps the server's reason and request id", async () => {
  const body = JSON.stringify({ error: { message: "Unsupported model gpt-6-luna for image tool", type: "invalid_request_error" } });
  const fetchImpl = fakeFetch([withHeaders(400, body, { "openai-request-id": "req-400" })]);
  const { client, logs } = clientWith(fetchImpl);
  const error = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }).catch(e => e);
  assert.equal(error.code, "DIRECT_HTTP");
  assert.equal(error.status, 400);
  assert.equal(error.detail.requestId, "req-400");
  assert.match(error.detail.reason, /Unsupported model/);
  const entry = logs.find(item => item.event === "direct-error");
  assert.equal(entry.status, 400);
  assert.equal(entry.requestId, "req-400");
  assert.match(entry.reason, /Unsupported model/);
});

test("an empty result after retries keeps the last stream event for diagnosis", async () => {
  const fetchImpl = fakeFetch([response(200, sse([{ type: "response.created" }, { type: "response.in_progress" }]))]);
  const { client, logs } = clientWith(fetchImpl, { retries: 1 });
  const error = await client.generate({ model: "gpt-6-luna", text: "x", attachments: [] }).catch(e => e);
  assert.equal(error.code, "DIRECT_EMPTY");
  assert.equal(error.detail.lastEvent, "response.in_progress");
  assert.equal(error.detail.attempt, 2);
  assert.equal(logs.filter(item => item.event === "direct-error").length, 2);
});

test("redact hides tokens, keys, account ids and image data, and caps length", () => {
  const text = redact("Bearer abc.def.ghi eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlMTIz sk-abcdefghijklmnop acct-xyz data:image/png;base64,AAAABBBBCCCCDDDDEEEE", ["acct-xyz"]);
  assert.doesNotMatch(text, /abc\.def|eyJhbGci|sk-abcdef|acct-xyz|AAAABBBB/);
  assert.equal(redact("x".repeat(1000)).length <= 401, true);
  assert.equal(redact(null), null);
  assert.equal(failureDetail([{ type: "response.completed" }]), null);
});
