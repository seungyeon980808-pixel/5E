const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { performance } = require("node:perf_hooks");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { buildEphemeralThreadStartParams } = require("./ai-thread-profile.cjs");

const root = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(root, "docs", "engine-v2", "benchmarks", "fast-scene-repeatability.v1.json");
const DEFAULT_REPORT = path.join(root, "docs", "engine-v2", "benchmarks", "FAST_SCENE_REPEATABILITY.md");
const requestedTimeoutMs = Number(process.env.FIVE_E_SCENE_BENCHMARK_TIMEOUT) || 120_000;
const timeoutMs = Math.min(120_000, Math.max(1_000, requestedTimeoutMs));
const TOOL_TYPE_PATTERN = /(commandexecution|websearch|imagegeneration|mcptoolcall|dynamictoolcall|filechange|toolcall)/i;

const CASES = Object.freeze([
  Object.freeze({
    id: "physics-series-circuit",
    subject: "physics",
    type: "circuit",
    title: "직렬 회로",
    request: "160×90 mm 아트보드 안에 단순 직렬 회로를 구성해 줘. 왼쪽에 직류 전원 1개, 위쪽에 열린 스위치 1개, 오른쪽에 저항 1개, 아래쪽에 전구 1개를 놓고, 네 부품을 사각 루프의 검은 도선으로 끊김 없이 연결해. 문자·숫자·기호·라벨·화살표는 만들지 말고 장식과 명암도 넣지 마.",
    validate: ({ scene, compiled }) => {
      const elements = compiled.objects.filter((object) => object.type === "circuit").map((object) => object.element);
      return checks([
        ["dc_source", elements.includes("dc_source"), elements],
        ["open_switch", compiled.objects.some((object) => object.type === "circuit" && object.element === "switch" && object.closed === false), elements],
        ["resistor", elements.includes("resistor"), elements],
        ["lamp", elements.includes("lamp"), elements],
        ["single_connected_network", linearSceneConnected(scene), linearSceneTopology(scene)],
      ]);
    },
  }),
  Object.freeze({
    id: "physics-pulley-spring",
    subject: "physics",
    type: "pulley-spring",
    title: "도르래와 용수철",
    request: "160×90 mm 아트보드 중앙에 상단 고정 도르래 1개를 그리고 줄이 도르래를 지나 양쪽으로 수직으로 내려오게 해 줘. 왼쪽 줄 끝에는 직사각형 추 1개를 매달고, 오른쪽 줄 끝은 세로 용수철의 위쪽 끝에 연결하며 용수철 아래쪽 끝에는 같은 크기의 직사각형 추 1개를 매달아. 접촉과 연결 관계가 분명해야 한다. 문자·숫자·기호·라벨·화살표·그림자는 만들지 마.",
    validate: ({ compiled }) => checks([
      ["pulley", compiled.objects.some((object) => object.type === "apparatus" && object.kind === "pulley"), countObjects(compiled, "apparatus")],
      ["spring", countObjects(compiled, "spring") >= 1, countObjects(compiled, "spring")],
      ["two_weights", countObjects(compiled, "rect") >= 2, countObjects(compiled, "rect")],
      ["rope", compiled.objects.filter((object) => ["line", "polyline", "curve"].includes(object.type)).length >= 2,
        compiled.objects.filter((object) => ["line", "polyline", "curve"].includes(object.type)).length],
    ]),
  }),
  Object.freeze({
    id: "earth-observatory-optics",
    subject: "earth-science",
    type: "lens-mirror",
    title: "관측 장치의 렌즈와 거울",
    request: "지구과학 관측 장치의 광학 부품 배치를 160×90 mm 아트보드에 단순화해 줘. 가로 광축을 따라 왼쪽에 큰 볼록렌즈 1개, 중앙 오른쪽에 45도로 기울어진 평면거울 1개, 가장 오른쪽에 세로 스크린 1개를 서로 겹치지 않게 놓아. 이 요구는 lens_mirror_screen_bench 고정 fixture와 정확히 일치하므로, 해당 motif 하나만 사용하고 options에는 lensKind=convex_lens와 mirrorRotation=45만 넣어. 세 부품은 모두 optics 요소로 작성해야 하며, 특히 평면거울은 반드시 type=optics, opticsKind=plane_mirror, rotation=45인 요소로 만들고 일반 line·polyline·curve로 대체하지 마. 광선 화살표와 문자·숫자·기호·라벨은 그리지 말고, 검은 선과 필요한 최소 회색만 사용해.",
    validate: ({ compiled }) => {
      const kinds = compiled.objects.filter((object) => object.type === "optics").map((object) => object.kind);
      return checks([
        ["convex_lens", kinds.includes("convex_lens"), kinds],
        ["plane_mirror", kinds.includes("plane_mirror"), kinds],
        ["screen", kinds.includes("screen"), kinds],
        ["three_optics", kinds.length >= 3, kinds.length],
      ]);
    },
  }),
  Object.freeze({
    id: "chemistry-vessel-particles",
    subject: "chemistry",
    type: "vessel-particles",
    title: "용기와 입자",
    request: "160×90 mm 아트보드에 서로 떨어진 두 용기를 배치해 줘. 왼쪽에는 액체가 높이의 약 45%까지 담긴 비커 1개를 놓고, 오른쪽에는 기체 입자 16개가 고르게 퍼진 밀폐 직사각형 입자 용기 1개를 놓아. 이 요구는 vessel_particle_comparison 고정 fixture와 정확히 일치하므로, 해당 motif 하나만 사용하고 options에는 vesselKind=beaker, liquid=0.45, particleState=gas, particleCount=16, particleShape=circle, mix=false만 넣어. 입자는 원형이고 운동 화살표는 없어야 한다. 문자·숫자·기호·라벨·그림자·광택은 만들지 마.",
    validate: ({ compiled }) => checks([
      ["beaker", compiled.objects.some((object) => object.type === "vessel" && object.kind === "beaker"), countObjects(compiled, "vessel")],
      ["liquid_level", compiled.objects.some((object) => object.type === "vessel" && object.liquid >= 0.35 && object.liquid <= 0.55),
        compiled.objects.filter((object) => object.type === "vessel").map((object) => object.liquid)],
      ["gas_particle_box", compiled.objects.some((object) => object.type === "particlebox" && object.state === "gas" && object.count >= 12),
        compiled.objects.filter((object) => object.type === "particlebox").map((object) => ({ state: object.state, count: object.count }))],
    ]),
  }),
  Object.freeze({
    id: "biology-population-graph",
    subject: "biology",
    type: "graph",
    title: "개체군 변화 그래프",
    request: "160×90 mm 아트보드 중앙에 시간에 따른 개체군 크기의 S자형 증가를 나타내는 그래프 1개를 구성해 줘. 축은 숫자·문자·화살표가 없는 검은 선이고 격자는 사용하지 마. 한 개의 매끄러운 곡선은 왼쪽 아래에서 시작해 중앙에서 빠르게 증가하고 오른쪽 위에서 완만하게 수평에 가까워져야 한다. 다른 장치는 추가하지 마.",
    validate: ({ scene, compiled }) => {
      const series = scene.elements?.find((element) => element.type === "graph")?.series?.[0]?.points || [];
      const increasingX = series.slice(1).every((point, index) => point[0] > series[index][0]);
      const nonDecreasingY = series.slice(1).every((point, index) => point[1] >= series[index][1]);
      return checks([
      ["coordinate_plane", countObjects(compiled, "coordplane") === 1, countObjects(compiled, "coordplane")],
      ["one_series", countObjects(compiled, "funcgraph") === 1, countObjects(compiled, "funcgraph")],
      ["enough_curve_points", compiled.objects.some((object) => object.type === "funcgraph" && Array.isArray(object.points) && object.points.length >= 5),
        compiled.objects.filter((object) => object.type === "funcgraph").map((object) => object.points?.length || 0)],
      ["monotonic_population_curve", increasingX && nonDecreasingY, series],
    ]);
    },
  }),
  Object.freeze({
    id: "chemistry-panel-flow",
    subject: "chemistry",
    type: "panel-flow",
    title: "3단계 입자 패널 흐름",
    request: "감사된 panel_flow 모티프 하나만 사용해 3단계 입자 상태 비교를 만들어 줘. panelType은 particlebox, panelCount는 3으로 하고, 왼쪽부터 기체 12개, 액체 12개, 고체 12개 상태를 사용해. 패널 사이에는 평범한 연결선만 두고 화살표·문자·숫자·기호·라벨은 넣지 마. 모티프 요청은 장면의 유일한 요소여야 한다.",
    validate: ({ scene, compiled, responseText }) => checks([
      ["uses_panel_flow_motif", isMotifResponse(responseText, "panel_flow"), responseText.slice(0, 120)],
      ["three_particle_panels", scene.elements?.filter((element) => element.type === "particlebox").length === 3,
        scene.elements?.filter((element) => element.type === "particlebox").length || 0],
      ["all_three_states", ["gas", "liquid", "solid"].every((state) => scene.elements?.some((element) => element.type === "particlebox" && element.state === state)),
        scene.elements?.filter((element) => element.type === "particlebox").map((element) => element.state) || []],
      ["two_connectors", countObjects(compiled, "line") >= 2, countObjects(compiled, "line")],
    ]),
  }),
  Object.freeze({
    id: "biology-dual-axis",
    subject: "biology",
    type: "dual-axis",
    title: "생물 지표 이중축",
    request: "감사된 dual_axis_plot 모티프 하나만 사용해 같은 시간축에서 두 생물 지표가 변하는 이중 y축 그래프를 만들어 줘. xRange는 [0,10], leftRange는 [0,10], rightRange는 [0,100], tickCount는 5로 하고, 왼쪽 계열은 4개 이상 점으로 증가 후 감소, 오른쪽 계열은 4개 이상 점으로 완만히 증가하게 해. 숫자·문자·기호·라벨·화살표는 넣지 말고 모티프 요청은 장면의 유일한 요소여야 한다.",
    validate: ({ scene, compiled, responseText }) => checks([
      ["uses_dual_axis_motif", isMotifResponse(responseText, "dual_axis_plot"), responseText.slice(0, 120)],
      ["coordinate_plane", countObjects(compiled, "coordplane") === 1, countObjects(compiled, "coordplane")],
      ["left_series", countObjects(compiled, "funcgraph") >= 1, countObjects(compiled, "funcgraph")],
      ["right_series", scene.elements?.some((element) => ["curve", "polyline"].includes(element.type)),
        scene.elements?.filter((element) => ["curve", "polyline"].includes(element.type)).length || 0],
      ["right_axis_and_ticks", countObjects(compiled, "line") >= 8, countObjects(compiled, "line")],
    ]),
  }),
  Object.freeze({
    id: "earth-contour-bundle",
    subject: "earth-science",
    type: "contour",
    title: "등치선 묶음",
    request: "감사된 contour_bundle 모티프 하나만 사용해 지구과학용 무라벨 등치선 묶음을 만들어 줘. variant는 nested, count는 5이고 충분한 바깥 여백을 남겨. 모든 선은 닫힌 검은 곡선이며 문자·숫자·기호·라벨·화살표·채움은 없어야 한다. 모티프 요청은 장면의 유일한 요소여야 한다.",
    validate: ({ scene, compiled, responseText }) => checks([
      ["uses_contour_motif", isMotifResponse(responseText, "contour_bundle"), responseText.slice(0, 120)],
      ["five_source_contours", scene.elements?.filter((element) => element.type === "curve").length === 5,
        scene.elements?.filter((element) => element.type === "curve").length || 0],
      ["five_compiled_contours", countObjects(compiled, "curve") === 5, countObjects(compiled, "curve")],
      ["closed_unfilled", compiled.objects.filter((object) => object.type === "curve").every((object) => object.closed === true && object.fillNone === true),
        compiled.objects.filter((object) => object.type === "curve").map((object) => ({ closed: object.closed, fillNone: object.fillNone }))],
    ]),
  }),
  Object.freeze({
    id: "physics-orthogonal-wiring",
    subject: "physics",
    type: "wiring",
    title: "직교 배선",
    request: "감사된 orthogonal_wiring 모티프 하나만 사용해 직교 배선 골격을 만들어 줘. 네 노드를 아트보드 안의 직사각형 네 모서리 부근에 놓고 네 변을 수평·수직 선으로 닫힌 회로처럼 연결해. showNodes는 true로 하고 대각선, 문자·숫자·기호·라벨·화살표는 넣지 마. 모티프 요청은 장면의 유일한 요소여야 한다.",
    validate: ({ scene, compiled, responseText }) => {
      const routes = scene.elements?.filter((element) => ["line", "polyline"].includes(element.type)) || [];
      const axisAligned = routes.every((element) => {
        const points = element.type === "line" ? [element.from, element.to] : element.points;
        return Array.isArray(points) && points.slice(1).every((point, index) => point[0] === points[index][0] || point[1] === points[index][1]);
      });
      return checks([
        ["uses_wiring_motif", isMotifResponse(responseText, "orthogonal_wiring"), responseText.slice(0, 120)],
        ["four_routes", routes.length === 4, routes.length],
        ["axis_aligned", axisAligned, routes],
        ["four_nodes", countObjects(compiled, "ellipse") === 4, countObjects(compiled, "ellipse")],
      ]);
    },
  }),
]);

function countObjects(compiled, type) {
  return compiled.objects.filter((object) => object.type === type).length;
}

function parseResponseJson(responseText) {
  let source = String(responseText || "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

function isMotifResponse(responseText, motif) {
  const root = parseResponseJson(responseText);
  if (!root || typeof root !== "object") return false;
  if (root.type === "motif") return root.motif === motif;
  return Array.isArray(root.elements)
    && root.elements.length === 1
    && root.elements[0]?.type === "motif"
    && root.elements[0]?.motif === motif;
}

function linearSceneTopology(scene) {
  const nodes = new Map();
  const key = (point) => `${round(Number(point?.[0]), 3)},${round(Number(point?.[1]), 3)}`;
  const connect = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return;
    const ak = key(a), bk = key(b);
    if (!nodes.has(ak)) nodes.set(ak, new Set());
    if (!nodes.has(bk)) nodes.set(bk, new Set());
    nodes.get(ak).add(bk);
    nodes.get(bk).add(ak);
  };
  for (const element of scene?.elements || []) {
    if (element.type === "circuit" || element.type === "line") connect(element.from, element.to);
    else if (element.type === "polyline") {
      for (let index = 1; index < (element.points || []).length; index += 1) connect(element.points[index - 1], element.points[index]);
    }
  }
  if (!nodes.size) return { nodeCount: 0, componentCount: 0 };
  const unseen = new Set(nodes.keys());
  let componentCount = 0;
  while (unseen.size) {
    componentCount += 1;
    const stack = [unseen.values().next().value];
    while (stack.length) {
      const current = stack.pop();
      if (!unseen.delete(current)) continue;
      for (const neighbor of nodes.get(current) || []) if (unseen.has(neighbor)) stack.push(neighbor);
    }
  }
  return { nodeCount: nodes.size, componentCount };
}

function linearSceneConnected(scene) {
  const topology = linearSceneTopology(scene);
  return topology.nodeCount >= 4 && topology.componentCount === 1;
}

function checks(entries) {
  const items = entries.map(([name, pass, actual = null]) => ({ name, pass: pass === true, actual }));
  return { pass: items.every((item) => item.pass), checks: items };
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function codexInvocation(args) {
  if (process.platform !== "win32") return { file: "codex", args };
  return {
    file: process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "codex", ...args],
  };
}

function typeCounts(map) {
  return Object.fromEntries(Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)));
}

function effectiveCallCount(started, completed, predicate) {
  const types = new Set([...started.keys(), ...completed.keys()]);
  let count = 0;
  for (const type of types) {
    if (predicate(type)) count += Math.max(started.get(type) || 0, completed.get(type) || 0);
  }
  return count;
}

class AppServerClient {
  constructor() {
    this.child = null;
    this.rl = null;
    this.pending = new Map();
    this.rpcId = 0;
    this.stderr = [];
    this.active = null;
  }

  async start() {
    const launch = codexInvocation(["app-server", "--stdio"]);
    this.child = spawn(launch.file, launch.args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.stderr.on("data", (buffer) => {
      const line = String(buffer).trim();
      if (line) this.stderr.push(line);
      if (this.stderr.length > 40) this.stderr.shift();
    });
    this.child.on("error", (error) => this.#failAll(error));
    this.child.on("exit", (code, signal) => {
      if (code !== 0 && this.child) this.#failAll(new Error(`Codex app-server exited (${code ?? signal}): ${this.stderr.join("\n")}`));
    });
    this.rl = createInterface({ input: this.child.stdout });
    this.rl.on("line", (line) => this.#onLine(line));
    await this.rpc("initialize", {
      clientInfo: { name: "5e-fast-scene-repeatability", title: "5E Fast Scene Repeatability", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized");
  }

  #onLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id != null && this.pending.has(message.id)) {
      const state = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) state.reject(new Error(message.error.message || "Codex RPC failed"));
      else state.resolve(message.result);
      return;
    }
    const active = this.active;
    if (!active) return;
    const messageThreadId = message.params?.threadId || message.params?.turn?.threadId || null;
    const messageTurnId = message.params?.turnId || message.params?.turn?.id || null;
    if (messageThreadId && messageThreadId !== active.threadId) return;
    if (active.turnId && messageTurnId && messageTurnId !== active.turnId) return;
    const item = message.params?.item;
    if (item?.type && message.method === "item/started") active.started.set(item.type, (active.started.get(item.type) || 0) + 1);
    if (item?.type && message.method === "item/completed") active.completed.set(item.type, (active.completed.get(item.type) || 0) + 1);
    if (message.method === "item/completed" && item?.type === "agentMessage" && item.phase !== "commentary") {
      active.finalMessage = String(item.text || "").trim();
      active.finalMessageAt = performance.now();
    }
    if (message.method === "error") {
      active.eventErrors.push(String(message.params?.error?.message || message.params?.message || "Unknown App Server error"));
    }
    if (message.method === "turn/completed") active.resolve(message.params?.turn || {});
  }

  #failAll(error) {
    for (const state of this.pending.values()) state.reject(error);
    this.pending.clear();
    if (this.active) this.active.reject(error);
  }

  rpc(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin?.writable) {
        reject(new Error("Codex app-server stdin is not writable."));
        return;
      }
      const id = ++this.rpcId;
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  notify(method, params = {}) {
    if (this.child?.stdin?.writable) this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  beginTurn(threadId) {
    if (this.active) throw new Error("A repeatability turn is already active.");
    const state = {
      threadId,
      turnId: null,
      finalMessage: "",
      finalMessageAt: null,
      eventErrors: [],
      started: new Map(),
      completed: new Map(),
      resolve: null,
      reject: null,
      promise: null,
    };
    state.promise = new Promise((resolve, reject) => {
      state.resolve = resolve;
      state.reject = reject;
    });
    this.active = state;
    return state;
  }

  endTurn(state) {
    if (this.active === state) this.active = null;
  }

  stop() {
    const child = this.child;
    this.child = null;
    if (this.rl) this.rl.close();
    this.rl = null;
    if (child && !child.killed) child.kill();
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

function failedCompile(error) {
  return {
    valid: false,
    supported: false,
    objects: [],
    warnings: [],
    errors: [{ code: "compile_exception", path: "$", message: error?.message || String(error) }],
    unsupported: [],
    stats: { inputElements: 0, outputObjects: 0, compileMs: 0, requiresRasterFallback: false },
  };
}

async function runCaseOnce({ client, model, item, runNumber, scenePromptModule, sceneCompilerModule }) {
  const runStartedAt = performance.now();
  const modelInput = scenePromptModule.buildFastScenePrompt({ mode: "diagram", request: item.request });
  let threadId = null;
  let turnId = null;
  let turnState = null;
  let turnRequestedAt = null;
  let turnCompletedAt = null;
  let compileStartedAt = null;
  let compileEndedAt = null;
  let completed = {};
  let scene = null;
  let compiled = failedCompile(new Error("Turn did not reach compilation."));
  let structure = { pass: false, checks: [] };
  let terminalError = null;
  try {
    const cwd = process.env.APPDATA ? path.join(process.env.APPDATA, "5e-desktop") : root;
    const thread = await client.rpc("thread/start", buildEphemeralThreadStartParams({
      purpose: "scene",
      model,
      serviceTier: "priority",
      cwd,
    }));
    threadId = thread?.thread?.id;
    if (!threadId) throw new Error("Fast-scene benchmark thread was not created.");
    turnState = client.beginTurn(threadId);
    turnRequestedAt = performance.now();
    const turn = await client.rpc("turn/start", {
      threadId,
      input: [{ type: "text", text: modelInput }],
      model,
      effort: "low",
      serviceTier: "priority",
    });
    turnId = turn?.turn?.id || null;
    turnState.turnId = turnId;
    completed = await withTimeout(turnState.promise, timeoutMs, `${item.id} run ${runNumber}`);
    turnCompletedAt = performance.now();
    compileStartedAt = performance.now();
    try {
      scene = sceneCompilerModule.expandAiMotifScene(turnState.finalMessage);
      compiled = sceneCompilerModule.compileFastSceneWithMotifs(turnState.finalMessage, {
        mode: "diagram",
        layerId: 1,
        idPrefix: `repeatability_${item.id}`,
      });
      structure = item.validate({ scene, compiled, responseText: turnState.finalMessage });
    } catch (error) {
      compiled = failedCompile(error);
      structure = { pass: false, checks: [{ name: "compile_exception", pass: false, actual: error?.message || String(error) }] };
    }
    compileEndedAt = performance.now();
  } catch (error) {
    terminalError = error?.message || String(error);
    if (turnState?.eventErrors?.length) terminalError = `${terminalError}; ${turnState.eventErrors.at(-1)}`;
  }

  const state = turnState || { finalMessage: "", finalMessageAt: null, eventErrors: [], started: new Map(), completed: new Map() };
  const imageCalls = effectiveCallCount(state.started, state.completed, (type) => type === "imageGeneration");
  const toolCalls = effectiveCallCount(state.started, state.completed, (type) => TOOL_TYPE_PATTERN.test(type));
  const criticalWarnings = compiled.warnings.filter((warning) => warning.code === "outside_artboard");
  const genericChecks = {
    turnCompleted: completed.status === "completed",
    valid: compiled.valid === true,
    supported: compiled.supported === true,
    hasObjects: compiled.objects.length > 0,
    noCompileErrors: compiled.errors.length === 0,
    noCriticalWarnings: criticalWarnings.length === 0,
    noImageCalls: imageCalls === 0,
    noToolCalls: toolCalls === 0,
    structure: structure.pass === true,
  };
  const pass = Object.values(genericChecks).every(Boolean) && !terminalError;
  const now = performance.now();
  const finalEnd = compileEndedAt || turnCompletedAt || now;
  const result = {
    run: runNumber,
    pass,
    status: completed.status || (terminalError ? "error" : "unknown"),
    terminalError: terminalError || completed.error?.message || completed.error || state.eventErrors.at(-1) || null,
    timingsMs: {
      total: round(finalEnd - runStartedAt),
      model: turnRequestedAt == null || turnCompletedAt == null ? null : round(turnCompletedAt - turnRequestedAt),
      finalMessage: turnRequestedAt == null || state.finalMessageAt == null ? null : round(state.finalMessageAt - turnRequestedAt),
      compileWall: compileStartedAt == null || compileEndedAt == null ? null : round(compileEndedAt - compileStartedAt, 3),
      compileReported: round(Number(compiled.stats?.compileMs || 0), 3),
    },
    compile: {
      valid: compiled.valid,
      supported: compiled.supported,
      inputElements: compiled.stats?.inputElements || 0,
      objectCount: compiled.objects.length,
      objectTypes: Object.fromEntries(Array.from(compiled.objects.reduce((map, object) => {
        map.set(object.type, (map.get(object.type) || 0) + 1);
        return map;
      }, new Map()).entries()).sort(([a], [b]) => a.localeCompare(b))),
      warnings: compiled.warnings,
      errors: compiled.errors,
      unsupported: compiled.unsupported,
      criticalWarningCount: criticalWarnings.length,
    },
    structure,
    genericChecks,
    safety: {
      imageCalls,
      toolCalls,
      startedItemTypes: typeCounts(state.started),
      completedItemTypes: typeCounts(state.completed),
    },
    hashes: {
      responseSha256: sha256(state.finalMessage),
      sceneSha256: scene == null ? null : sha256(canonicalJson(scene)),
    },
    responseText: state.finalMessage,
    scene,
    threadId,
    turnId,
  };
  if (turnState) client.endTurn(turnState);
  return result;
}

function median(values) {
  const numeric = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numeric.length) return null;
  const mid = Math.floor(numeric.length / 2);
  return numeric.length % 2 ? numeric[mid] : round((numeric[mid - 1] + numeric[mid]) / 2);
}

function summarizeCase(item) {
  const passCount = item.runs.filter((run) => run.pass).length;
  return {
    passCount,
    runCount: item.runs.length,
    reproducible: item.runs.length >= 3 && passCount >= 2,
    imageCalls: item.runs.reduce((sum, run) => sum + run.safety.imageCalls, 0),
    toolCalls: item.runs.reduce((sum, run) => sum + run.safety.toolCalls, 0),
    medianTotalMs: median(item.runs.map((run) => run.timingsMs.total)),
    medianModelMs: median(item.runs.map((run) => run.timingsMs.model)),
    medianCompileMs: median(item.runs.map((run) => run.timingsMs.compileWall)),
    uniqueResponseHashes: new Set(item.runs.map((run) => run.hashes.responseSha256).filter(Boolean)).size,
    uniqueSceneHashes: new Set(item.runs.map((run) => run.hashes.sceneSha256).filter(Boolean)).size,
  };
}

function updateSummary(document) {
  document.cases.forEach((item) => { item.summary = summarizeCase(item); });
  const runs = document.cases.flatMap((item) => item.runs);
  const subjectCounts = {};
  for (const item of document.cases) subjectCounts[item.subject] = (subjectCounts[item.subject] || 0) + 1;
  document.summary = {
    caseCount: document.cases.length,
    runCount: runs.length,
    reproducibleCases: document.cases.filter((item) => item.summary.reproducible).length,
    allCasesMeetTwoOfThree: document.cases.length >= 8 && document.cases.every((item) => item.summary.reproducible),
    totalImageCalls: runs.reduce((sum, run) => sum + run.safety.imageCalls, 0),
    totalToolCalls: runs.reduce((sum, run) => sum + run.safety.toolCalls, 0),
    zeroImageGeneration: runs.every((run) => run.safety.imageCalls === 0),
    zeroUnexpectedTools: runs.every((run) => run.safety.toolCalls === 0),
    subjectCounts,
    medianTotalMs: median(runs.map((run) => run.timingsMs.total)),
    medianModelMs: median(runs.map((run) => run.timingsMs.model)),
    medianCompileMs: median(runs.map((run) => run.timingsMs.compileWall)),
  };
  document.updatedAt = new Date().toISOString();
  return document;
}

function cloneCorrectionHistory(document) {
  return Array.isArray(document?.correctionHistory)
    ? structuredClone(document.correctionHistory)
    : [];
}

function validateBenchmarkDocument(document, expectedVersions = {}) {
  const errors = [];
  if (document?.schema !== "5e-fast-scene-repeatability@1") errors.push("Unexpected benchmark schema.");
  if (expectedVersions.promptVersion && document?.configuration?.promptVersion !== expectedVersions.promptVersion) {
    errors.push(`Saved prompt version ${document?.configuration?.promptVersion || "(missing)"} does not match current ${expectedVersions.promptVersion}.`);
  }
  if (expectedVersions.motifCatalogVersion && document?.configuration?.motifCatalogVersion !== expectedVersions.motifCatalogVersion) {
    errors.push(`Saved motif catalog version ${document?.configuration?.motifCatalogVersion || "(missing)"} does not match current ${expectedVersions.motifCatalogVersion}.`);
  }
  if (!Array.isArray(document?.cases) || document.cases.length < 8) errors.push("At least 8 benchmark cases are required.");
  const subjectSet = new Set((document?.cases || []).map((item) => item.subject));
  if (subjectSet.size < 4) errors.push("All four science subjects must be represented.");
  for (const item of document?.cases || []) {
    if (typeof item.request !== "string" || !item.request.trim()) errors.push(`${item.id}: exact request is missing.`);
    if (typeof item.modelInput !== "string" || !item.modelInput.trim()) errors.push(`${item.id}: exact model input is missing.`);
    if (!Array.isArray(item.runs) || item.runs.length < 3) errors.push(`${item.id}: at least 3 runs are required.`);
    const passCount = Array.isArray(item.runs) ? item.runs.filter((run) => run.pass).length : 0;
    if (passCount < 2) errors.push(`${item.id}: ${passCount}/3 runs passed; at least 2 are required.`);
    for (const run of item.runs || []) {
      if (run.safety?.imageCalls !== 0) errors.push(`${item.id} run ${run.run}: imageGeneration call detected.`);
      if (run.safety?.toolCalls !== 0) errors.push(`${item.id} run ${run.run}: unexpected tool call detected.`);
      for (const field of ["total", "model", "compileWall"]) {
        if (!Number.isFinite(run.timingsMs?.[field])) errors.push(`${item.id} run ${run.run}: ${field} timing is missing.`);
      }
      if (!run.hashes?.responseSha256 || !run.hashes?.sceneSha256) errors.push(`${item.id} run ${run.run}: response/scene hash is missing.`);
    }
  }
  if (document?.summary?.totalImageCalls !== 0 || document?.summary?.zeroImageGeneration !== true) errors.push("Summary does not prove zero imageGeneration calls.");
  return { ok: errors.length === 0, errors };
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function renderMarkdown(document) {
  updateSummary(document);
  const verification = validateBenchmarkDocument(document);
  const lines = [
    "# Fast-scene repeatability benchmark",
    "",
    `- Generated: ${document.updatedAt}`,
    `- Model: ${document.configuration.model}`,
    `- Runtime profile: effort=\`${document.configuration.effort}\`, service tier=\`${document.configuration.serviceTier}\`, image tools disabled`,
    `- Cases/runs: ${document.summary.caseCount} cases, ${document.summary.runCount} independent ephemeral-thread runs`,
    `- Reproducibility: ${document.summary.reproducibleCases}/${document.summary.caseCount} cases meet at least 2/3 passes`,
    `- Image generation calls: ${document.summary.totalImageCalls}`,
    `- Unexpected tool calls: ${document.summary.totalToolCalls}`,
    `- Verification: **${verification.ok ? "PASS" : "FAIL"}**`,
    "",
    "Timing definitions: `total` is fresh thread creation through local compile; `model` is turn request through `turn/completed`; `compile` is local motif expansion and 5E object compilation. All values are milliseconds.",
    "",
    "## Case summary",
    "",
    "| Case | Subject | Type | Passes | Median total | Median model | Median compile | Response hashes | Scene hashes |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const item of document.cases) {
    const summary = item.summary;
    lines.push(`| ${escapeCell(item.title)} | ${item.subject} | ${item.type} | ${summary.passCount}/${summary.runCount} | ${summary.medianTotalMs} | ${summary.medianModelMs} | ${summary.medianCompileMs} | ${summary.uniqueResponseHashes} | ${summary.uniqueSceneHashes} |`);
  }
  lines.push("", "## Individual runs", "", "| Case | Run | Pass | total | model | compile | objects | warnings | errors | image | tools | response hash | scene hash |", "| --- | ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const item of document.cases) {
    for (const run of item.runs) {
      lines.push(`| ${escapeCell(item.id)} | ${run.run} | ${run.pass ? "yes" : "no"} | ${run.timingsMs.total} | ${run.timingsMs.model} | ${run.timingsMs.compileWall} | ${run.compile.objectCount} | ${run.compile.warnings.length} | ${run.compile.errors.length} | ${run.safety.imageCalls} | ${run.safety.toolCalls} | ${run.hashes.responseSha256?.slice(0, 12) || "-"} | ${run.hashes.sceneSha256?.slice(0, 12) || "-"} |`);
    }
  }
  lines.push("", "## Exact requests", "");
  for (const item of document.cases) {
    lines.push(`### ${item.title} (\`${item.id}\`)`, "", item.request, "", `Full wrapped model input SHA-256: \`${item.modelInputSha256}\`. The full exact wrapped input and every raw response are preserved in \`fast-scene-repeatability.v1.json\`.`, "");
  }
  if (!verification.ok) lines.push("## Verification failures", "", ...verification.errors.map((error) => `- ${error}`), "");
  lines.push("## Re-run", "", "```powershell", "node desktop/benchmark-scene-repeatability.cjs", "node desktop/benchmark-scene-repeatability.cjs --verify", "# Re-run only one failed case while preserving other cases:", "node desktop/benchmark-scene-repeatability.cjs --case physics-series-circuit", "```", "");
  return `${lines.join("\n")}\n`;
}

function writeDocument(document, outputPath, reportPath, writeReport = true) {
  updateSummary(document);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  if (writeReport) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, renderMarkdown(document), "utf8");
  }
}

function parseArgs(argv) {
  const result = { runs: 3, caseIds: [], output: DEFAULT_OUTPUT, report: DEFAULT_REPORT, verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--runs") result.runs = Number(argv[++i]);
    else if (arg === "--case") result.caseIds.push(...String(argv[++i] || "").split(",").filter(Boolean));
    else if (arg === "--output") result.output = path.resolve(argv[++i]);
    else if (arg === "--report") result.report = path.resolve(argv[++i]);
    else if (arg === "--verify") result.verify = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(result.runs) || result.runs < 1 || result.runs > 3) throw new RangeError("--runs must be an integer from 1 to 3.");
  return result;
}

async function benchmark(options) {
  const scenePromptModule = await import(`${pathToFileURL(path.join(root, "js", "ai-scene-prompt.js")).href}?repeatability=${Date.now()}`);
  const sceneCompilerModule = await import(`${pathToFileURL(path.join(root, "js", "ai-motif-catalog.js")).href}?repeatability=${Date.now()}`);
  const selected = options.caseIds.length ? CASES.filter((item) => options.caseIds.includes(item.id)) : [...CASES];
  if (selected.length !== (options.caseIds.length || CASES.length)) {
    const found = new Set(selected.map((item) => item.id));
    throw new RangeError(`Unknown case id(s): ${options.caseIds.filter((id) => !found.has(id)).join(", ")}`);
  }

  const savedDocument = fs.existsSync(options.output)
    ? JSON.parse(fs.readFileSync(options.output, "utf8"))
    : null;
  let document;
  if (options.caseIds.length && savedDocument) {
    document = savedDocument;
  } else {
    document = {
      schema: "5e-fast-scene-repeatability@1",
      createdAt: new Date().toISOString(),
      updatedAt: null,
      configuration: {
        model: null,
        effort: "low",
        serviceTier: "priority",
        speed: "Fast",
        timeoutMs,
        independentEphemeralThreadPerRun: true,
        imageGenerationAllowed: false,
        runsPerCase: options.runs,
        promptVersion: scenePromptModule.FAST_SCENE_PROMPT_VERSION,
        motifCatalogVersion: sceneCompilerModule.MOTIF_CATALOG_VERSION,
      },
      setupTimingsMs: {},
      cases: [],
      correctionHistory: cloneCorrectionHistory(savedDocument),
      summary: {},
    };
  }

  const previousConfiguration = { ...(document.configuration || {}) };
  if (!Array.isArray(document.correctionHistory)) document.correctionHistory = [];

  const client = new AppServerClient();
  const setupStarted = performance.now();
  try {
    await client.start();
    const initializedAt = performance.now();
    const catalog = await client.rpc("model/list", { limit: 100, includeHidden: false });
    const catalogAt = performance.now();
    const models = Array.isArray(catalog?.data) ? catalog.data : [];
    const luna = models.find((entry) => /luna/i.test(`${entry.model || entry.id} ${entry.displayName || ""}`));
    const model = process.env.FIVE_E_SCENE_BENCHMARK_MODEL || luna?.model || luna?.id || null;
    if (!model) throw new Error("Luna model was not found in the local Codex catalog.");
    document.configuration.model = model;
    document.configuration.runsPerCase = options.runs;
    document.configuration.promptVersion = scenePromptModule.FAST_SCENE_PROMPT_VERSION;
    document.configuration.motifCatalogVersion = sceneCompilerModule.MOTIF_CATALOG_VERSION;
    document.setupTimingsMs = {
      initialize: round(initializedAt - setupStarted),
      modelCatalog: round(catalogAt - initializedAt),
      total: round(catalogAt - setupStarted),
    };

    for (const item of selected) {
      const modelInput = scenePromptModule.buildFastScenePrompt({ mode: "diagram", request: item.request });
      const caseDocument = {
        id: item.id,
        subject: item.subject,
        type: item.type,
        title: item.title,
        request: item.request,
        modelInput,
        modelInputSha256: sha256(modelInput),
        runs: [],
        summary: {},
      };
      const existingIndex = document.cases.findIndex((candidate) => candidate.id === item.id);
      if (existingIndex >= 0) {
        const priorCase = document.cases[existingIndex];
        document.correctionHistory.push({
          archivedAt: new Date().toISOString(),
          caseId: item.id,
          reason: process.env.FIVE_E_SCENE_CORRECTION_NOTE || "Selected-case rerun; prior request, responses and measurements preserved before replacement.",
          priorPromptVersion: previousConfiguration.promptVersion || null,
          priorMotifCatalogVersion: previousConfiguration.motifCatalogVersion || null,
          replacementPromptVersion: scenePromptModule.FAST_SCENE_PROMPT_VERSION,
          replacementMotifCatalogVersion: sceneCompilerModule.MOTIF_CATALOG_VERSION,
          priorCase,
        });
        document.cases.splice(existingIndex, 1, caseDocument);
      }
      else document.cases.push(caseDocument);
      document.cases.sort((a, b) => CASES.findIndex((item) => item.id === a.id) - CASES.findIndex((item) => item.id === b.id));

      for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
        process.stderr.write(`[fast-scene] ${item.id} ${runNumber}/${options.runs} ... `);
        const result = await runCaseOnce({ client, model, item, runNumber, scenePromptModule, sceneCompilerModule });
        caseDocument.runs.push(result);
        writeDocument(document, options.output, options.report, false);
        process.stderr.write(`${result.pass ? "PASS" : "FAIL"} total=${result.timingsMs.total}ms model=${result.timingsMs.model}ms compile=${result.timingsMs.compileWall}ms image=${result.safety.imageCalls}\n`);
      }
      writeDocument(document, options.output, options.report, false);
    }
  } finally {
    client.stop();
  }
  writeDocument(document, options.output, options.report, true);
  return document;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.verify) {
    const scenePromptModule = await import(`${pathToFileURL(path.join(root, "js", "ai-scene-prompt.js")).href}?verify=${Date.now()}`);
    const sceneCompilerModule = await import(`${pathToFileURL(path.join(root, "js", "ai-motif-catalog.js")).href}?verify=${Date.now()}`);
    const document = JSON.parse(fs.readFileSync(options.output, "utf8"));
    updateSummary(document);
    const verification = validateBenchmarkDocument(document, {
      promptVersion: scenePromptModule.FAST_SCENE_PROMPT_VERSION,
      motifCatalogVersion: sceneCompilerModule.MOTIF_CATALOG_VERSION,
    });
    console.log(JSON.stringify({ ok: verification.ok, errors: verification.errors, summary: document.summary }, null, 2));
    if (!verification.ok) process.exitCode = 1;
    return;
  }
  const document = await benchmark(options);
  const verification = validateBenchmarkDocument(document);
  console.log(JSON.stringify({ ok: verification.ok, errors: verification.errors, output: options.output, report: options.report, summary: document.summary }, null, 2));
  if (!verification.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error?.message || String(error), stack: error?.stack || null }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  CASES,
  DEFAULT_OUTPUT,
  DEFAULT_REPORT,
  canonicalJson,
  cloneCorrectionHistory,
  codexInvocation,
  parseArgs,
  renderMarkdown,
  summarizeCase,
  timeoutMs,
  updateSummary,
  validateBenchmarkDocument,
};
