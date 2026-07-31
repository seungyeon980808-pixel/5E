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

/* ----- 3.5) 경사면 장면: 검산 리포트가 전부 ✔ 로 나와야 한다 -----
 * 이 툴의 계약은 "면에 정확히 붙는다"이므로, 응답에 ⚠ 가 하나라도 있으면 실패로 센다. */
const inclineFile = path.join(OUT, "mcp5e_incline.json");
await call("create_project", { path: inclineFile, artboard: { w: 110, h: 70 }, pageNames: ["경사면", "마찰"], overwrite: true });
const scene1 = await call("add_incline_scene", {
  path: inclineFile, page: "경사면",
  incline: { angleDeg: 30, length: 40, apex: "left" },
  ground: { length: 40 },
  blocks: [
    { on: "경사면", s: 0.7, size: 8, labelInner: "m", labelOuter: "A" },
    { on: "수평면", s: 0.45, size: 8, labelInner: "2m", labelOuter: "B" },
    { on: "경사면", s: 0.25, size: 8, phantom: true },
  ],
  friction: [{ on: "수평면", from: 0.15, to: 0.75 }],
  angleArc: true,
  dims: [{ kind: "height", label: "h" }],
  arrows: [{ on: "경사면", s: 0.5, direction: "down" }],
  captions: [{ text: "수평면", on: "수평면", s: 0.9 }],
});
// 반대 방향 + 실로 이은 두 블록 + 구간 치수선
const scene2 = await call("add_incline_scene", {
  path: inclineFile, page: "마찰",
  incline: { angleDeg: 37, height: 22, apex: "right" },
  ground: { length: 50, extendBack: 6 },
  blocks: [
    { on: "수평면", s: 0.35, size: 8, labelInner: "m" },
    { on: "수평면", s: 0.62, size: 8, labelInner: "3m" },
    { on: "경사면", s: 0.75, size: 8, labelOuter: "P", labelOuterPos: "right" },
  ],
  connectors: [{ from: 0, to: 1, kind: "실" }],
  friction: [{ on: "경사면", from: 0, to: 1 }],
  dims: [{ kind: "along", on: "수평면", from: 0.35, to: 0.62, label: "d" }],
  guides: [{ on: "경사면", s: 0.75, length: 24, lineKind: "기준선" }],
});
for (const [name, text] of [["경사면", scene1], ["마찰", scene2]]) {
  if (text.includes("⚠")) { failed++; console.log(`FAIL  add_incline_scene(${name}) 검산에 ⚠ 가 있습니다`); }
}
await call("validate_project", { path: inclineFile });
// 없는 면 이름·잘못된 각도는 그리기 전에 막혀야 한다
await call("add_incline_scene", { path: inclineFile, incline: { angleDeg: 30 }, blocks: [{ on: "천장", s: 0.5 }] }, { expectError: true });
await call("add_incline_scene", { path: inclineFile, incline: { angleDeg: 95 } }, { expectError: true });
await call("add_incline_scene", { path: inclineFile, incline: { angleDeg: 30 }, blocks: [{ on: "수평면" }], connectors: [{ from: 0, to: 9 }] }, { expectError: true });

/* ----- 3.7) 치수 표시: 연속 치수 + 세로 치수 -----
 * 기준점을 공유하는 두 치수를 한 번에 주면 가운데 연장선은 1개만 나와야 한다(총 3개). */
const dimFile = path.join(OUT, "mcp5e_dim.json");
await call("create_project", { path: dimFile, artboard: { w: 110, h: 70 }, overwrite: true });
await call("add_objects", {
  path: dimFile,
  objects: [
    { type: "line", p1: { x: -40, y: 10 }, p2: { x: 40, y: 10 } },
    { type: "rect", x: -30, y: 2, w: 8, h: 8, label: "A", labelType: "label" },
    { type: "rect", x: 10, y: 2, w: 8, h: 8, label: "B", labelType: "label" },
  ],
});
const dimText = await call("add_dimension", {
  path: dimFile,
  dims: [
    { from: [-30, 10], to: [0, 10], label: "L" },
    { from: [0, 10], to: [18, 10], label: "2L" },
    { from: { x: -30, y: 2 }, to: { x: -30, y: 10 }, direction: "vertical", side: "left", label: "h", caps: "bothBars" },
  ],
});
if (!/치수 표시 8개/.test(dimText)) { failed++; console.log("FAIL  add_dimension: 공유 연장선이 합쳐지지 않았습니다(치수선3 + 연장선5 = 8 기대)"); }
await call("validate_project", { path: dimFile });
await call("add_dimension", { path: dimFile, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }, { expectError: true });
await call("add_dimension", { path: dimFile, from: { x: 0, y: 0 } }, { expectError: true });

/* ----- 3.8) 사선 배선(wires) — 삼각형 회로 -----
 * circuit 은 원래 p1/p2 라 어느 각도로도 놓인다. 없던 건 "구간을 따라 놓고 남은 곳을
 * 도선으로 잇는" 계산뿐이었다(2026-07-31 오진 정정). */
const wireFile = path.join(OUT, "mcp5e_wires.json");
await call("create_project", { path: wireFile, artboard: { w: 80, h: 62 }, overwrite: true });
await call("add_circuit", {
  path: wireFile,
  wires: [
    { from: [0, -24], to: [-16, -2], elements: [{ element: "resistor", label: "R" }] },
    { from: [0, -24], to: [16, -2], elements: [{ element: "resistor", label: "R" }] },
    { from: [-16, -2], to: [16, -2], elements: [{ element: "resistor", t: 0.3, label: "R" }, { element: "ammeter", t: 0.72, span: 11 }] },
    { from: [-32, 20], to: [32, 20], elements: [{ element: "dc_source", label: "V", span: 10 }] },
  ],
});
await call("validate_project", { path: wireFile });
await call("add_circuit", { path: wireFile }, { expectError: true });   // box·wires 둘 다 없음

/* ----- 3.9) 스탠드·레일 부착 ----- */
const rigFile = path.join(OUT, "mcp5e_rig.json");
await call("create_project", { path: rigFile, artboard: { w: 90, h: 60 }, overwrite: true });
await call("add_stand_rig", {
  path: rigFile, at: { x: -20, y: 20 },
  hang: [{ s: 0.75, kind: "spring", length: 14, label: "k", block: { size: 8, label: "m" } }],
});
await call("add_stand_rig", {
  path: rigFile,
  rail: { y: 12, from: 4, to: 40, items: [{ at: 0.28, size: 9, label: "A" }, { at: 0.72, size: 9, label: "B" }] },
});
await call("validate_project", { path: rigFile });

/* ----- 3.95) 오려낸 삽화 부품 ----- */
const partList = await call("add_part", {});
if (/hand_grip/.test(partList)) {
  const partFile = path.join(OUT, "mcp5e_part.json");
  await call("create_project", { path: partFile, artboard: { w: 60, h: 40 }, overwrite: true });
  const t2 = await call("add_part", {
    path: partFile, part: "hand_grip", gripAt: { x: 0, y: 0 }, w: 12,
    between: [{ type: "rect", x: 0, y: -4, w: 8, h: 8, fillLevel: 255, labelInner: "m" }],
  });
  if (!/3개 객체/.test(t2)) { failed++; console.log("FAIL  add_part: 뒤·물체·앞 3개가 아닙니다"); }
  await call("validate_project", { path: partFile });
}
await call("add_part", { part: "없는부품" }, { expectError: true });

/* ----- 4) 실패해야 하는 입력들 (검증이 실제로 막는지) ----- */
await call("add_objects", { path: graphFile, objects: [{ type: "rectangle", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "rect", x: 0, y: 0, w: -5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "optics", kind: "banana", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_objects", { path: graphFile, objects: [{ type: "image", x: 0, y: 0, w: 5, h: 5 }] }, { expectError: true });
await call("add_graph", { path: graphFile, at: { x: 45, y: 30 }, functions: [{ expr: "sin(" }] }, { expectError: true });

await call("list_objects", { path: circuitFile });

child.stdin.end();
console.log(failed ? `\n❌ 실패 ${failed}건` : `\n✅ 전부 통과 — 확인용 파일:\n   ${circuitFile}\n   ${graphFile}\n   ${inclineFile}`);
process.exit(failed ? 1 : 0);
