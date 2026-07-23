/* ===== LIVE — 열려 있는 앱에 실제로 그려 보는 통합 테스트 =====
 *
 *   1) 브라우저에서 5E를 http://localhost:<포트> 로 열어 둔다
 *   2) node tools/mcp-5e/test/live.mjs
 *
 * 앱이 붙을 때까지 최대 40초 기다린 뒤, 화면에 회로와 그래프를 그려 넣는다.
 * (앱을 먼저 켜 뒀다면 새로고침해야 통로를 다시 찾는다 — 앱은 켜질 때 한 번만 찾는다)
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.js");
const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"] });

let id = 0, buf = "";
const pending = new Map();
child.stdout.setEncoding("utf8");
child.stdout.on("data", (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
    if (!line) continue;
    const m = JSON.parse(line);
    const r = pending.get(m.id); if (r) { pending.delete(m.id); r(m); }
  }
});
const rpc = (method, params) => new Promise((res) => {
  const mid = ++id; pending.set(mid, res);
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: mid, method, params }) + "\n");
});
const call = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return { text: r.result?.content?.[0]?.text ?? "", isError: !!r.result?.isError };
};

await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "live", version: "0" } });

/* ----- 앱이 붙을 때까지 대기 ----- */
process.stdout.write("앱 연결을 기다리는 중");
let connected = false;
for (let i = 0; i < 40; i++) {
  const s = await call("app_status");
  if (s.text.startsWith("✅")) { connected = true; console.log("\n" + s.text + "\n"); break; }
  process.stdout.write(".");
  await new Promise((r) => setTimeout(r, 1000));
}
if (!connected) {
  console.log("\n\n앱이 붙지 않았습니다. 브라우저에서 5E를 localhost로 열고 새로고침한 뒤 다시 실행하세요.");
  const s = await call("app_status"); console.log(s.text);
  child.stdin.end(); process.exit(1);
}

let failed = 0;
async function step(label, name, args, { expectError = false } = {}) {
  const r = await call(name, args);
  const ok = r.isError === expectError;
  if (!ok) failed++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${label}\n        ${r.text.split("\n").join("\n        ")}\n`);
  return r.text;
}

await step("화면 비우기", "clear_app");
await step("회로 직접 그리기(파일 없이)", "add_circuit", {
  box: { x: -30, y: -18, w: 60, h: 26 },
  elements: [
    { element: "dc_source", label: "V" },
    { element: "resistor", t: 0.35, label: "R_1" },
    { element: "lamp", t: 0.75 },
  ],
});
await step("현재 화면 읽기", "read_app");
await step("주석 추가", "add_objects", {
  objects: [
    { type: "text", x: -30, y: 14, text: "그림 1. MCP가 화면에 직접 그린 회로" },
    { type: "labeler", p1: { x: 0, y: -18 }, p2: { x: 6, y: -25 }, text: "㉠" },
  ],
});
await step("잘못된 객체는 막히는가", "add_objects", { objects: [{ type: "rect", x: 0, y: 0, w: -3, h: 5 }] }, { expectError: true });

child.stdin.end();
console.log(failed ? `❌ 실패 ${failed}건` : "✅ 전부 통과 — 브라우저 화면을 확인하세요.");
process.exit(failed ? 1 : 0);
