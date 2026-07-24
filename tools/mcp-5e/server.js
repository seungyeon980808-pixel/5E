#!/usr/bin/env node
/* ===== MCP SERVER — 5E 도면 생성기 =====
 *
 * stdio JSON-RPC 2.0(줄 단위). SDK를 쓰지 않고 직접 구현한 이유: 5E는 "빌드 없음 ·
 * 의존성 없음"이 규칙이고, 이 서버가 쓰는 프로토콜 표면은 initialize / tools/list /
 * tools/call 셋뿐이라 node_modules를 끌어올 이유가 없다.
 *
 * 실행:  node tools/mcp-5e/server.js
 * 등록:  claude mcp add 5e -- node "<이 파일의 절대경로>"
 */

import {
  makeProject, loadProject, saveProject, resolveProjectPath, pickPage,
  appendObjects, validateData, summarize, newObjectId, DEFAULT_ARTBOARD,
} from "./lib/project.js";
import { OBJECT_TYPE_IDS, TYPE_DOC, describeType, normalizeObject } from "./lib/schema.js";
import { buildCircuitLoop, buildGraph } from "./lib/builders.js";
import { startBridge, sendToApp, bridgeStatus } from "./lib/bridge.js";
import { existsSync } from "node:fs";

const PROTOCOL_VERSION = "2024-11-05";

/* ===== 툴 정의 ===== */
const XY = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"] };
const BOX = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } },
  required: ["x", "y", "w", "h"],
};
const PATH_PROP = { type: "string", description: "프로젝트 .json 파일의 절대경로" };
// 그리기 툴에서는 path가 선택 항목이다 — 생략하면 지금 열려 있는 앱 화면에 바로 들어간다.
const TARGET_PATH_PROP = {
  type: "string",
  description: "대상 .json 파일의 절대경로. **생략하면 지금 열려 있는 5E 화면에 바로 그린다**(기본).",
};
const PAGE_PROP = { description: "페이지 인덱스(0부터) 또는 이름/id. 생략하면 활성 페이지" };

const TOOLS = [
  {
    name: "describe_schema",
    description:
      "5E 객체 타입 정보를 조회한다. type 없이 호출하면 21종 요약 목록, type을 주면 그 타입의 " +
      "기하 형식·기본값·허용값(enum)을 돌려준다. add_objects를 쓰기 전에 반드시 한 번 확인할 것.",
    inputSchema: {
      type: "object",
      properties: { type: { type: "string", enum: OBJECT_TYPE_IDS, description: "조회할 타입" } },
    },
  },
  {
    name: "create_project",
    description:
      "빈 5E 프로젝트 파일(.json)을 만든다. 단위는 mm(1 world unit = 1mm)이고 좌표 원점은 " +
      "아트보드 '중앙'(+x 오른쪽, +y 아래쪽)이다. 기본 아트보드 90×60mm → 그릴 수 있는 " +
      "범위는 x -45~45, y -30~30.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        artboard: { type: "object", properties: { w: { type: "number" }, h: { type: "number" } }, description: "페이지 크기(mm). 기본 90×60" },
        pageNames: { type: "array", items: { type: "string" }, description: "여러 페이지를 한 번에 만들 때" },
        overwrite: { type: "boolean", description: "기존 파일 덮어쓰기(기본 false)" },
      },
      required: ["path"],
    },
  },
  {
    name: "add_objects",
    description:
      "객체를 추가한다. path를 생략하면 지금 열려 있는 5E 화면에 즉시 나타난다(권장). " +
      "필드가 틀리면 하나도 넣지 않고 오류를 돌려준다(반쯤 들어간 도면을 만들지 않기 위해). " +
      "id/order는 자동 부여된다. 타입별 필드는 describe_schema 참고.",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP,
        objects: {
          type: "array",
          description: "추가할 객체 배열. 각 원소는 최소한 type과 기하 필드를 가져야 한다",
          items: { type: "object", properties: { type: { type: "string", enum: OBJECT_TYPE_IDS } }, required: ["type"] },
        },
      },
      required: ["objects"],
    },
  },
  {
    name: "add_circuit",
    description:
      "사각 폐회로를 만든다. box 둘레에 소자를 놓고 빈 구간은 도선으로 잇는다. 전원은 기본으로 " +
      "왼쪽 변, 나머지 소자는 윗변에 균등 배치된다. branches를 주면 위·아래 변을 잇는 세로 " +
      "가지(병렬 회로)가 추가된다. path를 생략하면 열려 있는 화면에 바로 그린다.",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP,
        box: { ...BOX, description: "회로 사각형의 좌상단과 크기(mm)" },
        elements: {
          type: "array",
          description: "회로 소자들",
          items: {
            type: "object",
            properties: {
              element: { type: "string", description: "resistor|dc_source|ac_source|capacitor|inductor|diode|lamp|ammeter|voltmeter|unknown" },
              side: { type: "string", enum: ["top", "right", "bottom", "left"], description: "놓을 변(생략 시 자동)" },
              t: { type: "number", description: "그 변에서의 위치 0~1(생략 시 균등 분포)" },
              span: { type: "number", description: "단자 간 거리 mm(기본 14)" },
              label: { type: "string", description: "소자 옆 라벨 (예: R_1)" },
            },
            required: ["element"],
          },
        },
        branches: {
          type: "array",
          description: "병렬 가지(위·아래 변을 잇는 세로선)",
          items: {
            type: "object",
            properties: {
              at: { type: "number", description: "가로 위치 0~1 (기본 0.5)" },
              elements: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      required: ["box", "elements"],
    },
  },
  {
    name: "add_graph",
    description:
      "좌표평면과 함수 그래프를 만든다. 수식은 앱과 같은 파서를 쓴다(sin cos tan log ln exp " +
      "sqrt abs, 상수 pi e, 연산자 + - * / ^, 각도는 라디안). 점 좌표는 앱과 동일한 샘플러로 " +
      "계산되므로 앱에서 열어도 모양이 어긋나지 않는다. path를 생략하면 열려 있는 화면에 바로 그린다.",
    inputSchema: {
      type: "object",
      properties: {
        path: TARGET_PATH_PROP,
        page: PAGE_PROP,
        at: { ...XY, description: "평면의 중심 좌표(mm)" },
        plane: {
          type: "object",
          description: "평면 설정. xMin/xMax/yMin/yMax(기본 -5..5), cellMm(한 칸 mm, 기본 4.8), " +
            "axisVariant(cross|quadrant|single), showGrid, labelX, labelY, showTickLabels 등",
        },
        functions: {
          type: "array",
          description: "그릴 함수들. 비우면 빈 좌표평면만 만든다",
          items: {
            type: "object",
            properties: {
              expr: { type: "string", description: "예: sin(x), x^2, 2*x+1" },
              domain: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
              range: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } },
              strokeWidth: { type: "number", description: "선 두께 mm(기본 0.3)" },
              dashLength: { type: "number" },
              dashGap: { type: "number" },
              label: { type: "string", description: "곡선 끝 라벨" },
            },
            required: ["expr"],
          },
        },
      },
      required: ["at"],
    },
  },
  {
    name: "app_status",
    description:
      "지금 열려 있는 5E 앱과 연결돼 있는지 확인한다. 앱에 바로 그리기 전에 이걸 먼저 부르고, " +
      "연결이 안 돼 있으면 안내 문구를 그대로 사용자에게 전달한다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_app",
    description:
      "지금 화면에 그려져 있는 것을 읽어 온다(객체 id·타입·좌표·아트보드 범위). 사용자가 " +
      "'이거 옆에 화살표 하나만 더' 처럼 현재 그림을 기준으로 말할 때 먼저 호출한다.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "remove_from_app",
    description: "열려 있는 화면에서 id로 객체를 지운다. 앱에서 Ctrl+Z로 되돌릴 수 있다.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "clear_app",
    description: "열려 있는 화면의 현재 페이지를 비운다. 되돌리기(Ctrl+Z) 가능.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_artboard",
    description:
      "열려 있는 화면의 아트보드(페이지) 크기를 mm로 바꾼다. 기출 그림을 재현할 때 원본의 " +
      "가로세로 비율을 먼저 맞추는 용도 — 정사각형에 가까운 원본을 기본 90×60에 그리면 " +
      "그림이 눌려 보인다. 크기를 바꾸면 그릴 수 있는 좌표 범위도 함께 바뀐다(±w/2, ±h/2).",
    inputSchema: {
      type: "object",
      properties: {
        w: { type: "number", description: "가로 mm" },
        h: { type: "number", description: "세로 mm" },
      },
      required: ["w", "h"],
    },
  },
  {
    name: "list_objects",
    description: "프로젝트에 들어 있는 페이지·객체 목록을 요약해서 본다. 수정 대상 id를 찾을 때 쓴다.",
    inputSchema: { type: "object", properties: { path: PATH_PROP }, required: ["path"] },
  },
  {
    name: "remove_objects",
    description: "id로 객체를 지운다.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP, page: PAGE_PROP, ids: { type: "array", items: { type: "string" } } },
      required: ["path", "ids"],
    },
  },
  {
    name: "validate_project",
    description:
      "저장된 파일이 5E에서 제대로 열릴지 검사한다. 앱의 로드 경로는 매우 관대해서 필드가 틀려도 " +
      "조용히 넘어가고 그림만 이상해지므로, 파일을 만든 뒤에는 항상 이걸로 확인한다.",
    inputSchema: { type: "object", properties: { path: PATH_PROP }, required: ["path"] },
  },
];

/* ===== 전달 경로: 파일이냐, 열려 있는 앱이냐 =====
 * path를 주면 .json 파일에 쓰고, 생략하면 지금 열려 있는 5E 화면에 바로 넣는다.
 * 검증은 두 경로 모두 똑같이 거친다 — 앱에 직접 넣는다고 규칙이 느슨해지지는 않는다.
 */
async function deliver({ path, page }, objects, label) {
  if (path) {
    const { abs, data } = await loadProject(path);
    const pg = pickPage(data, page);
    const r = appendObjects(pg, objects);
    if (!r.ok) throw new Error("추가하지 않았습니다 — 다음을 고치세요:\n" + r.errors.join("\n"));
    await saveProject(abs, data);
    return { where: `파일 ${pg.name}`, count: r.ids.length, total: pg.objects.length, warnings: r.warnings };
  }

  const info = await sendToApp("ping");        // 앱이 붙어 있는지 + 아트보드 확인
  const errors = [], warnings = [], normalized = [];
  objects.forEach((raw, i) => {
    const n = normalizeObject(raw, { artboard: info.artboard });
    n.errors.forEach((e) => errors.push(`[${i}] ${e}`));
    n.warnings.forEach((w) => warnings.push(`[${i}] ${raw && raw.type}: ${w}`));
    if (n.obj) normalized.push(n.obj);
  });
  if (errors.length) throw new Error("보내지 않았습니다 — 다음을 고치세요:\n" + errors.join("\n"));
  const res = await sendToApp("addObjects", { objects: normalized });
  return { where: `열려 있는 앱(${info.page})`, count: res.added, total: info.objects + res.added, warnings };
}

function deliverReport(head, d, extra = []) {
  return [
    `${head} → ${d.where} (총 ${d.total}개)`,
    ...extra,
    ...(d.warnings.length ? ["", "경고:", ...d.warnings] : []),
  ].join("\n");
}

/* ===== 툴 구현 ===== */
const HANDLERS = {
  async describe_schema({ type }) {
    if (!type) {
      const lines = OBJECT_TYPE_IDS.map((t) => `- ${t}: ${TYPE_DOC[t]?.summary || ""} (필수: ${TYPE_DOC[t]?.required || "?"})`);
      return [
        `5E 객체 타입 ${OBJECT_TYPE_IDS.length}종 — 단위는 mm, 원점은 아트보드 '중앙', +x 오른쪽 / +y 아래쪽.`,
        "90×60mm 아트보드라면 그릴 수 있는 범위는 x -45~45, y -30~30 입니다.",
        ...lines,
        "",
        "자세한 필드는 describe_schema에 type을 지정해 다시 호출하세요.",
      ].join("\n");
    }
    const d = describeType(type);
    if (!d) return `알 수 없는 타입: ${type}`;
    return JSON.stringify(d, null, 2);
  },

  async create_project({ path, artboard, pageNames, overwrite }) {
    const abs = resolveProjectPath(path);
    if (existsSync(abs) && !overwrite) {
      throw new Error(`이미 있는 파일입니다: ${abs} (덮어쓰려면 overwrite: true)`);
    }
    const data = makeProject({
      artboard: artboard && artboard.w > 0 && artboard.h > 0 ? artboard : DEFAULT_ARTBOARD,
      pageNames: Array.isArray(pageNames) && pageNames.length ? pageNames : ["페이지 1"],
    });
    await saveProject(abs, data);
    const ab = data.pages[0].artboard;
    return [
      `만들었습니다: ${abs}`,
      `아트보드 ${ab.w}×${ab.h}mm, 페이지 ${data.pages.length}개`,
      `좌표계: 원점 (0,0)은 아트보드 '중앙', +x 오른쪽 / +y 아래쪽, 단위 mm`,
      `그릴 수 있는 범위: x ${-ab.w / 2} ~ ${ab.w / 2}, y ${-ab.h / 2} ~ ${ab.h / 2}`,
    ].join("\n");
  },

  async add_objects({ path, page, objects }) {
    if (!Array.isArray(objects) || !objects.length) throw new Error("objects 배열이 비었습니다");
    const d = await deliver({ path, page }, objects);
    return deliverReport(`${d.count}개 추가`, d);
  },

  async add_circuit({ path, page, box, elements, branches }) {
    const built = buildCircuitLoop({ box, elements, branches: branches || [] });
    const d = await deliver({ path, page }, built.objects);
    return deliverReport(
      `회로 ${d.count}개 객체 추가 (소자 ${elements.length}개 + 도선)`, d,
      built.warnings.length ? ["", "배치 경고:", ...built.warnings] : [],
    );
  },

  async add_graph({ path, page, at, plane, functions }) {
    const planeId = newObjectId();
    const built = buildGraph({ at, plane: plane || {}, functions: functions || [], planeId });
    if (built.error) throw new Error(built.error);
    const d = await deliver({ path, page }, [built.plane, ...built.graphs]);
    return deliverReport(
      `좌표평면 1개 + 함수 ${built.graphs.length}개 추가`, d,
      [`평면 id: ${planeId} (${built.plane.w.toFixed(1)}×${built.plane.h.toFixed(1)}mm)`,
        ...(built.warnings.length ? ["", "샘플링 경고:", ...built.warnings] : [])],
    );
  },

  /* ----- 열려 있는 앱 직결 ----- */
  async app_status() {
    const b = bridgeStatus();
    if (!b.port) return "❌ 로컬 통로를 열지 못했습니다 (포트 8579~8583 사용중)";
    if (!b.connected) {
      return [
        `통로는 열려 있습니다 (127.0.0.1:${b.port}) — 하지만 5E 앱이 붙어 있지 않습니다.`,
        "",
        "확인할 것:",
        "1. 앱을 http://localhost:… 로 열었는지 (파일 더블클릭(file://)으로는 안 됩니다)",
        "2. 이미 열었다면 새로고침 — 앱은 켜질 때 한 번만 통로를 찾습니다",
        "3. 연결되면 화면 왼쪽 아래에 'MCP 연결됨' 배지가 뜹니다",
      ].join("\n");
    }
    const info = await sendToApp("ping");
    return `✅ 연결됨 (127.0.0.1:${b.port}) — ${info.page}, 객체 ${info.objects}개, 아트보드 ${info.artboard.w}×${info.artboard.h}mm`;
  },

  async read_app() {
    const s = await sendToApp("getState");
    return JSON.stringify(s, null, 2);
  },

  async clear_app() {
    const r = await sendToApp("clear");
    return `${r.removed}개 지웠습니다 — 앱에서 Ctrl+Z로 되돌릴 수 있습니다.`;
  },

  async set_artboard({ w, h }) {
    const r = await sendToApp("setArtboard", { w, h });
    const a = r.artboard;
    return [
      `아트보드를 ${a.w}×${a.h}mm로 바꿨습니다.`,
      `그릴 수 있는 범위: x ${-a.w / 2} ~ ${a.w / 2}, y ${-a.h / 2} ~ ${a.h / 2}`,
    ].join("\n");
  },

  async remove_from_app({ ids }) {
    const r = await sendToApp("removeObjects", { ids });
    return `${r.removed}개 지웠습니다 (Ctrl+Z로 되돌리기 가능)`;
  },

  async list_objects({ path }) {
    const { data } = await loadProject(path);
    return JSON.stringify(summarize(data), null, 2);
  },

  async remove_objects({ path, page, ids }) {
    const { abs, data } = await loadProject(path);
    const pg = pickPage(data, page);
    const before = pg.objects.length;
    const set = new Set(ids);
    pg.objects = pg.objects.filter((o) => !set.has(o.id));
    pg.objects.forEach((o, i) => { o.order = i; });
    await saveProject(abs, data);
    return `${before - pg.objects.length}개 삭제 (남은 ${pg.objects.length}개)`;
  },

  async validate_project({ path }) {
    const { data } = await loadProject(path);
    const r = validateData(data);
    return [
      r.ok ? "✅ 이상 없음 — 5E에서 열 수 있습니다." : `❌ 오류 ${r.errors.length}건`,
      ...(r.errors.length ? ["", "오류:", ...r.errors] : []),
      ...(r.warnings.length ? ["", "경고:", ...r.warnings] : []),
    ].join("\n");
  },
};

/* ===== 로컬 통로 기동 =====
 * 서버가 뜰 때 바로 연다. 앱은 켜질 때 이 포트를 찾아 붙으므로, 통로가 먼저 있어야
 * "앱을 열어 두면 바로 그려지는" 흐름이 성립한다. 포트가 전부 막혀 있어도 파일 경로는
 * 그대로 동작하므로 서버를 죽이지는 않는다. */
await startBridge();

/* ===== JSON-RPC over stdio ===== */
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) { send({ jsonrpc: "2.0", id, result }); }
function replyError(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION;
    return reply(id, {
      protocolVersion: requested,
      capabilities: { tools: {} },
      serverInfo: { name: "mcp-5e", version: "0.1.0" },
    });
  }
  if (method === "ping") return reply(id, {});
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name;
    const fn = HANDLERS[name];
    if (!fn) return replyError(id, -32601, `알 수 없는 툴: ${name}`);
    try {
      const text = await fn((params && params.arguments) || {});
      return reply(id, { content: [{ type: "text", text: String(text) }] });
    } catch (e) {
      // 툴 오류는 프로토콜 오류가 아니라 isError 결과로 돌려준다 — 모델이 읽고 고칠 수 있게.
      return reply(id, { content: [{ type: "text", text: `오류: ${e.message}` }], isError: true });
    }
  }
  if (typeof id === "number" || typeof id === "string") {
    return replyError(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
  // notification(id 없음)은 응답하지 않는다.
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { replyError(null, -32700, "JSON 파싱 실패"); continue; }
    handle(msg).catch((e) => replyError(msg.id ?? null, -32603, e.message));
  }
});
process.stdin.on("end", () => process.exit(0));
