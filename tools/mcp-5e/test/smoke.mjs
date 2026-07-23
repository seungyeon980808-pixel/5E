/* ===== SMOKE — 서버를 실제 stdio로 띄워 한 바퀴 돌린다 =====
 *
 *   node tools/mcp-5e/test/smoke.mjs [출력폴더]
 *
 * 출력 폴더를 주면 거기에 두 개의 .json(회로도·그래프)을 만든다. 기본은 OS 임시폴더.
 * 만들어진 파일은 5E에서 열어 눈으로 확인하는 용도다.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..", "server.js");
const OUT = path.resolve(process.argv[2] || tmpdir());

const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"] });
let id = 0, buf = "";
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stdout.on("data", (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r(msg); }
  }
});

function rpc(method, params) {
  const mid = ++id;
  return new Promise((res) => {
    pending.set(mid, res);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: mid, method, params }) + "\n");
  });
}

let failed = 0;
async function call(name, args, { expectError = false } = {}) {
  const r = await rpc("tools/call", { name, arguments: args });
  const text = r.result?.content?.[0]?.text ?? JSON.stringify(r.error);
  const isError = !!r.result?.isError || !!r.error;
  const ok = isError === expectError;
  if (!ok) failed++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${expectError ? " (오류 기대)" : ""}\n        ${text.split("\n").join("\n        ")}\n`);
  return text;
}

const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } });
console.log("initialize:", JSON.stringify(init.result.serverInfo), "\n");
const list = await rpc("tools/list", {});
console.log("tools:", list.result.tools.map((t) => t.name).join(", "), "\n");

/* ----- 1) 회로도: 전지 + 저항 2개 직렬 + 전압계 병렬 ----- */
const circuitFile = path.join(OUT, "mcp5e_circuit.json");
await call("create_project", { path: circuitFile, artboard: { w: 90, h: 60 }, overwrite: true });
await call("add_circuit", {
  path: circuitFile,
  box: { x: -30, y: -16, w: 60, h: 32 },
  elements: [
    { element: "dc_source", label: "V" },
    { element: "resistor", t: 0.3, label: "R_1" },
    { element: "resistor", t: 0.7, label: "R_2" },
  ],
});
await call("add_objects", {
  path: circuitFile,
  objects: [{ type: "text", x: -30, y: -21, text: "그림 1. 직렬 회로" }],
});
await call("validate_project", { path: circuitFile });

/* ----- 2) 그래프: 좌표평면 + sin(x) + 직선 ----- */
const graphFile = path.join(OUT, "mcp5e_graph.json");
await call("create_project", { path: graphFile, overwrite: true });
await call("add_graph", {
  path: graphFile,
  at: { x: 0, y: 0 },
  plane: { xMin: -6, xMax: 6, yMin: -3, yMax: 3, cellMm: 5, showGrid: true, labelX: "t", labelY: "v" },
  functions: [
    { expr: "sin(x)", label: "A" },
    { expr: "0.4*x", dashLength: 1.2, dashGap: 0.8 },
  ],
});
await call("validate_project", { path: graphFile });

/* ----- 3) 저수준 객체 + 광학 심볼 ----- */
await call("add_objects", {
  path: graphFile,
  objects: [
    { type: "rect", x: -40, y: -25, w: 14, h: 8, label: "A", labelType: "label" },
    { type: "optics", kind: "convex_lens", x: 34, y: -24, w: 8, h: 16 },
    { type: "line", p1: { x: -40, y: 22 }, p2: { x: -15, y: 22 }, lineMode: "arrow", arrowHead: "end" },
    { type: "anglearc", x: 0, y: 24, radius: 8, sweepAngle: 45, label: "θ" },
    // 일부러 아트보드 밖 — 경고가 뜨는지 확인용(오류는 아니다)
    { type: "rect", x: 60, y: 40, w: 10, h: 10 },
  ],
});

/* ----- 4) 실패해야 하는 입력들 (검증이 실제로 막는지) ----- */
await call("add_objects", { path: graphFile, objects: [{ type: "rectangle", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "rect", x: 0, y: 0, w: -5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "optics", kind: "banana", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "image", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_graph", { path: graphFile, at: { x: 45, y: 30 }, functions: [{ expr: "sin(" }] }, { expectError: true });

await call("list_objects", { path: circuitFile });

child.stdin.end();
console.log(failed ? `\n❌ 실패 ${failed}건` : `\n✅ 전부 통과 — 확인용 파일:\n   ${circuitFile}\n   ${graphFile}`);
process.exit(failed ? 1 : 0);
