// 1.8.0 출제 하네스 엔진(harness-agent.cjs) 단위 검사. 진짜 Codex 대신 가짜 앱 서버(자식 프로세스 흉내)를 쓴다.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createHarnessAgent, LOCK_CONFIG, BASE_INSTRUCTIONS } = require("./harness-agent.cjs");

const TOOL = { name: "read_note", description: "시험용 메모 읽기", inputSchema: { type: "object", properties: {} } };
const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

// 가짜 자식: stdin에 쓴 줄은 sent에 쌓이고, push()로 stdout에 JSON 한 줄을 넣는다.
function fakeChild() {
  const child = new EventEmitter();
  child.sent = [];
  child.waiters = [];
  let buffer = "";
  child.stdin = new Writable({
    write(chunk, _enc, done) {
      buffer += chunk.toString();
      let at;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        const message = JSON.parse(line);
        child.sent.push(message);
        for (const w of [...child.waiters]) if (w.match(message)) { child.waiters.splice(child.waiters.indexOf(w), 1); w.resolve(message); }
      }
      done();
    },
  });
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.killed = false;
  child.kill = () => { child.killed = true; setImmediate(() => child.emit("exit", null, "SIGTERM")); return true; };
  child.push = message => child.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
  // 조건에 맞는 메시지가 (이미 왔거나) 올 때까지 기다린다.
  child.next = (match, seen = new Set()) => {
    const found = child.sent.find(m => !seen.has(m) && match(m));
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("기다린 메시지가 오지 않았습니다")), 2000);
      child.waiters.push({ match, resolve: m => { clearTimeout(timer); resolve(m); } });
    });
  };
  child.method = name => child.next(m => m.method === name);
  return child;
}

// 가짜 서버가 initialize·thread/start·turn/start에 자동으로 답하게 한 하네스 엔진.
function setup({ autoReply = true } = {}) {
  const events = [], children = [];
  const agent = createHarnessAgent({
    invocation: async args => ({ file: "fake-codex", args }),
    emit: event => events.push(event),
    cwd: path.join(os.tmpdir(), "5e-harness-agent-test"),
    spawnProcess: () => {
      const child = fakeChild();
      children.push(child);
      if (autoReply) {
        child.waiters.push({ match: m => m.method === "initialize", resolve: m => child.push({ id: m.id, result: {} }) });
        const onThread = { match: m => m.method === "thread/start", resolve: m => child.push({ id: m.id, result: { thread: { id: "thr-" + children.length } } }) };
        child.waiters.push(onThread);
        let turns = 0;
        const onTurn = () => ({ match: m => m.method === "turn/start", resolve: m => { child.push({ id: m.id, result: { turn: { id: "turn-" + (++turns) } } }); child.waiters.push(onTurn()); } });
        child.waiters.push(onTurn());
      }
      return child;
    },
  });
  const start = (extra = {}) => agent.call({ action: "start", conversation: "c1", text: "메모를 읽어 줘", instructions: "도구로만 일하세요.", tools: [TOOL], toolsVersion: "v1", ...extra });
  return { agent, events, children, start };
}
const until = async (check, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = check(); if (v) return v; await tick(); } throw new Error("조건이 채워지지 않았습니다"); };

test("start: initialize → 잠근 thread/start → turn/start 순서로 보낸다", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  const result = await h.start();
  assert.deepEqual({ ok: result.ok, threadId: result.threadId, turnId: result.turnId, fresh: result.fresh }, { ok: true, threadId: "thr-1", turnId: "turn-1", fresh: true });
  const methods = h.children[0].sent.map(m => m.method).filter(Boolean);
  assert.deepEqual(methods, ["initialize", "initialized", "thread/start", "turn/start"]);
  const params = h.children[0].sent.find(m => m.method === "thread/start").params;
  assert.deepEqual(params.dynamicTools, [{ type: "function", ...TOOL }]);
  assert.deepEqual(params.environments, []);
  assert.deepEqual(params.selectedCapabilityRoots, []);
  assert.equal(params.baseInstructions, BASE_INSTRUCTIONS);
  assert.equal(params.developerInstructions, "도구로만 일하세요.");
  assert.equal(params.approvalPolicy, "never");
  assert.equal(params.sandbox, "read-only");
  assert.deepEqual(params.config, LOCK_CONFIG);
  const turn = h.children[0].sent.find(m => m.method === "turn/start").params;
  assert.equal(turn.threadId, "thr-1");
  assert.deepEqual(turn.input, [{ type: "text", text: "메모를 읽어 줘" }]);
});

test("item/tool/call은 tool 알림으로 넘기고, tool-reply는 같은 요청 id로 답한다", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  await h.start();
  const child = h.children[0];
  child.push({ id: 77, method: "item/tool/call", params: { threadId: "thr-1", turnId: "turn-1", callId: "call-a", tool: "read_note", arguments: { page: 1 } } });
  const ev = await until(() => h.events.find(e => e.kind === "tool"));
  assert.equal(ev.conversation, "c1");
  assert.equal(ev.callId, "call-a");
  assert.equal(ev.tool, "read_note");
  assert.deepEqual(ev.arguments, { page: 1 });
  assert.deepEqual(await h.agent.call({ action: "tool-reply", conversation: "c1", callId: "call-a", result: { note: "안녕" }, ok: true }), { ok: true });
  const answer = await child.next(m => m.id === 77 && !m.method);
  assert.deepEqual(answer.result, { contentItems: [{ type: "inputText", text: JSON.stringify({ note: "안녕" }) }], success: true });
  // 이미 답한 부름·모르는 부름
  assert.deepEqual(await h.agent.call({ action: "tool-reply", conversation: "c1", callId: "call-a", result: 1 }), { ok: false, code: "HARNESS_NO_SUCH_CALL" });
  assert.deepEqual(await h.agent.call({ action: "tool-reply", conversation: "c1", callId: "nope", result: 1 }), { ok: false, code: "HARNESS_NO_SUCH_CALL" });
});

test("우리 요청과 번호가 같은 서버 요청을 답으로 착각하지 않는다", async t => {
  const h = setup({ autoReply: false }); t.after(() => h.agent.stop());
  const started = h.start();
  const child = await until(() => h.children[0]);
  const init = await child.method("initialize");
  assert.equal(init.id, "h1");
  // 같은 id "h1"로 서버가 요청을 보낸다 → initialize의 답으로 받으면 안 된다.
  child.push({ id: "h1", method: "item/tool/requestUserInput", params: {} });
  const refused = await child.next(m => m.id === "h1" && m.error);
  assert.equal(refused.error.code, -32601);
  let settled = false; started.then(() => { settled = true; }, () => { settled = true; });
  await tick(20);
  assert.equal(settled, false, "initialize가 서버 요청으로 끝나 버렸다");
  child.push({ id: "h1", result: {} });
  const thread = await child.method("thread/start");
  child.push({ id: thread.id, result: { thread: { id: "thr-x" } } });
  const turn = await child.method("turn/start");
  child.push({ id: turn.id, result: { turn: { id: "turn-x" } } });
  assert.equal((await started).threadId, "thr-x");
});

test("승인 요청은 decline, 그 밖의 모르는 서버 요청은 JSON-RPC 오류", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  await h.start();
  const child = h.children[0];
  child.push({ id: 5, method: "item/commandExecution/requestApproval", params: { threadId: "thr-1" } });
  child.push({ id: 6, method: "item/fileChange/requestApproval", params: { threadId: "thr-1" } });
  child.push({ id: 7, method: "mcpServer/elicitation/request", params: { threadId: "thr-1" } });
  assert.deepEqual((await child.next(m => m.id === 5 && !m.method)).result, { decision: "decline" });
  assert.deepEqual((await child.next(m => m.id === 6 && !m.method)).result, { decision: "decline" });
  const other = await child.next(m => m.id === 7 && !m.method);
  assert.equal(other.result, undefined);
  assert.equal(other.error.code, -32601);
});

test("허용 밖 단계(commandExecution·mcpToolCall)가 시작되면 leak 알림과 turn/interrupt", async t => {
  for (const itemType of ["commandExecution", "mcpToolCall"]) {
    const h = setup(); t.after(() => h.agent.stop());
    await h.start();
    const child = h.children[0];
    child.push({ method: "item/started", params: { threadId: "thr-1", turnId: "turn-1", item: { id: "i1", type: itemType } } });
    const leak = await until(() => h.events.find(e => e.kind === "leak"));
    assert.equal(leak.itemType, itemType);
    const stop = await child.method("turn/interrupt");
    assert.deepEqual(stop.params, { threadId: "thr-1", turnId: "turn-1" });
    assert.equal(h.events.some(e => e.kind === "item"), false);
  }
});

test("일하는 중 다시 start는 HARNESS_TURN_ACTIVE, 나쁜 도구 이름은 HARNESS_BAD_TOOLS", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  await h.start();
  await assert.rejects(h.start(), { code: "HARNESS_TURN_ACTIVE" });
  for (const name of ["Read-Note", "1abc", "", "a".repeat(41)]) {
    await assert.rejects(h.start({ conversation: "c2", tools: [{ ...TOOL, name }] }), { code: "HARNESS_BAD_TOOLS" });
  }
  await assert.rejects(h.start({ conversation: "c2", tools: [TOOL, TOOL] }), { code: "HARNESS_BAD_TOOLS" });
  await assert.rejects(h.start({ conversation: "c2", tools: [] }), { code: "HARNESS_BAD_TOOLS" });
});

test("turn/completed는 상태를 담은 done, 차례 중 자식이 꺼지면 failed done", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  await h.start();
  const child = h.children[0];
  child.push({ method: "turn/completed", params: { threadId: "thr-1", turn: { id: "turn-1", status: "completed" } } });
  const done = await until(() => h.events.find(e => e.kind === "done"));
  assert.equal(done.status, "completed");
  assert.equal(done.turnId, "turn-1");
  // 같은 대화 두 번째 차례(같은 스레드) 중에 자식이 꺼진다.
  const second = await h.start();
  assert.equal(second.fresh, false);
  child.emit("exit", 1, null);
  const failed = await until(() => h.events.filter(e => e.kind === "done")[1]);
  assert.equal(failed.status, "failed");
  assert.equal(failed.code, "HARNESS_SERVER_STOPPED");
});

test("등록하지 않은 도구 부름은 success:false로 답하고 화면에 넘기지 않는다", async t => {
  const h = setup(); t.after(() => h.agent.stop());
  await h.start();
  const child = h.children[0];
  child.push({ id: 91, method: "item/tool/call", params: { threadId: "thr-1", turnId: "turn-1", callId: "call-z", tool: "delete_everything", arguments: {} } });
  const answer = await child.next(m => m.id === 91 && !m.method);
  assert.equal(answer.result.success, false);
  assert.match(answer.result.contentItems[0].text, /등록되지 않은 도구/);
  assert.equal(h.events.some(e => e.kind === "tool"), false);
});
