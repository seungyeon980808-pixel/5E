// HwpPalette storage/model port (AGPL-3.0). Browser transactions replace file writes.
import { CATALOG } from "./catalog.js?v=1.7.0-four-session-integration";
import { styleFields } from "./parser.js?v=1.7.0-four-session-integration";
import { zipSync, unzipSync } from "../../vendor/fflate/index.js";
export const CATEGORIES = ["서식", "문자", "템플릿", "양식"];
export const clone = (value) => structuredClone(value);
export const unique = (name, taken, spaced = true) => {
  let out = name,
    n = 2;
  while (taken.has(out)) out = spaced ? `${name} (${n++})` : `${name}${n++}`;
  return out;
};
export const walkBlocks = function* (blocks) {
  for (const b of blocks || []) {
    yield b;
    if (b.type === "stack") yield* walkBlocks(b.items);
  }
};
export const blockLabel = (b) =>
  b.name || b.value || b.template || b.form || b.key || "물감";
const id = () => crypto.randomUUID();
export const labelOf = (value) =>
  String(value || "")
    .trim()
    .replace(/[\\{}\r\n]/g, "");
export function deepMerge(base, override = {}) {
  const next = clone(base);
  for (const [key, value] of Object.entries(override || {})) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("설정 키가 올바르지 않습니다.");
    next[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      next[key] &&
      typeof next[key] === "object"
        ? deepMerge(next[key], value)
        : clone(value);
  }
  return next;
}
export function profileSpec(spec = {}) {
  const next = deepMerge(CATALOG.spec, spec);
  for (const [group, values] of Object.entries(next))
    for (const [key, value] of Object.entries(
      typeof values === "object" ? values : {},
    )) {
      if (
        typeof CATALOG.spec[group]?.[key] === "number" &&
        (!Number.isFinite(value) || Math.abs(value) > 100000)
      )
        throw new Error("조판 설정의 숫자가 올바르지 않습니다.");
      if (
        (key.endsWith("_mm") || key === "size_pt" || key === "line_spacing") &&
        typeof value === "number" &&
        value <= 0 &&
        !key.includes("margin")
      )
        throw new Error("너비·높이·글씨 크기·줄 간격은 0보다 커야 합니다.");
    }
  return next;
}
export function findFreeSpot(blocks, cols, span = 1, rows = 1, except = null) {
  const w = Math.max(1, Math.min(cols, span)),
    h = Math.max(1, rows);
  for (let row = 0; row < 2000; row++)
    for (let col = 0; col <= cols - w; col++) {
      if (
        !blocks.some(
          (b) =>
            b !== except &&
            row < (b.row || 0) + (b.rows || 1) &&
            row + h > (b.row || 0) &&
            col < (b.col || 0) + (b.span || 1) &&
            col + w > (b.col || 0),
        )
      )
        return { row, col };
    }
  throw new Error("팔레트에 빈 칸이 없습니다. 새 팔레트를 만들어주세요.");
}
export function defaultState() {
  const library = clone(CATALOG.library);
  for (const cat of CATEGORIES)
    for (const item of library[cat] || [])
      item.assetUrl = `assets/hwp-palette/fragments/${item.file}`;
  const tools = [];
  for (const t of CATALOG.tools.filter((t) => !t.hidden))
    tools.push({
      id: id(),
      type: "builtin",
      key: t.key,
      name: t.name,
      span: 4,
      rows: 2,
      ...findFreeSpot(tools, 8, 4, 2),
    });
  const tabs = [{ name: "메인", cols: 8, blocks: tools }];
  for (const [prefix, name] of [
    ["csat_science", "수능 시험지"],
  ]) {
    const blocks = [];
    for (const cat of ["양식", "템플릿"])
      for (const item of library[cat].filter((it) => it.subcat === prefix))
        blocks.push({
          id: id(),
          type: cat === "양식" ? "form" : "template",
          ref: item.id,
          name: item.name,
          span: 4,
          rows: 2,
          ...findFreeSpot(blocks, 8, 4, 2),
        });
    tabs.push({ name, cols: 8, blocks });
  }
  tabs.push({
    name: "빠른입력",
    cols: 8,
    blocks: CATALOG.builtins.slice(0, 20).map((item, i) => ({
      id: id(),
      type: "char",
      value: item.text,
      name: item.text,
      span: 1,
      rows: 1,
      row: Math.floor(i / 8),
      col: i % 8,
    })),
  });
  const single = clone(CATALOG.spec);
  single.layout.column_width_mm = 155;
  return {
    format: "5e-hwp-palette",
    version: 1,
    config: {
      palette_tabs: tabs,
      profiles: { "기본 2단": clone(CATALOG.spec), "기본 1단": single },
      active_profile: "기본 2단",
      main_tools_seeded: true,
      next_number: 1,
      use_number: true,
    },
    library,
    assets: {},
    photos: [],
  };
}
export function normalizeState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("팔레트 설정 형식이 올바르지 않습니다.");
  const out = clone(value);
  out.format = "5e-hwp-palette";
  out.version = 1;
  out.config ||= {};
  out.library ||= Object.fromEntries(CATEGORIES.map((c) => [c, []]));
  out.assets ||= {};
  out.photos ||= [];
  if (
    typeof out.assets !== "object" ||
    Array.isArray(out.assets) ||
    !Array.isArray(out.photos)
  )
    throw new Error("팔레트 파일 목록이 올바르지 않습니다.");
  if (
    !Array.isArray(out.config.palette_tabs) ||
    !out.config.palette_tabs.length
  )
    out.config.palette_tabs = defaultState().config.palette_tabs;
  if (out.config.palette_tabs.length > 100)
    throw new Error("팔레트는 최대 100개까지 가져올 수 있습니다.");
  for (const cat of CATEGORIES) {
    out.library[cat] ||= [];
    if (!Array.isArray(out.library[cat]) || out.library[cat].length > 5000)
      throw new Error("물감 목록이 올바르지 않습니다.");
    for (const item of out.library[cat]) {
      if (!item || typeof item !== "object")
        throw new Error("물감 정보가 올바르지 않습니다.");
      item.id ||= id();
      item.name = String(item.name || item.label || "물감");
      item.label = labelOf(item.label || item.name);
      item.tags = Array.isArray(item.tags) ? item.tags : [];
    }
  }
  if (!out.config.palette_tabs.some((t) => t.name === "메인"))
    out.config.palette_tabs.unshift({ name: "메인", cols: 8, blocks: [] });
  for (const tab of out.config.palette_tabs) {
    if (!tab || typeof tab !== "object")
      throw new Error("팔레트 정보가 올바르지 않습니다.");
    tab.name = String(tab.name || "팔레트");
    tab.cols = Math.max(8, Math.min(32, Number(tab.cols) || 15));
    if (!Array.isArray(tab.blocks) || tab.blocks.length > 2000)
      throw new Error("팔레트 물감 목록이 올바르지 않습니다.");
    tab.blocks = tab.blocks.filter(
      (b) =>
        !(b.type === "builtin" && ["reset_format", "library"].includes(b.key)),
    );
    for (const b of tab.blocks) {
      b.id ||= id();
      b.span = Math.max(
        1,
        Math.min(
          tab.cols,
          Number(b.span) || (["template", "form"].includes(b.type) ? 2 : 1),
        ),
      );
      b.rows = Math.max(1, Math.min(16, Number(b.rows) || 1));
      if (
        !Number.isInteger(b.row) ||
        !Number.isInteger(b.col) ||
        b.row < 0 ||
        b.col < 0 ||
        b.col + b.span > tab.cols
      )
        Object.assign(
          b,
          findFreeSpot(
            tab.blocks.filter((x) => x !== b && Number.isInteger(x.row)),
            tab.cols,
            b.span,
            b.rows,
          ),
        );
    }
    for (const b of walkBlocks(tab.blocks)) {
      b.id ||= id();
      if (!b.ref) {
        const cat = { template: "템플릿", form: "양식" }[b.type],
          item =
            cat &&
            out.library[cat].find(
              (it) => it.name === b[cat === "양식" ? "form" : "template"],
            );
        if (item) b.ref = item.id;
      }
    }
  }
  const main = out.config.palette_tabs.find((t) => t.name === "메인");
  if (
    ![...walkBlocks(main.blocks)].some(
      (b) => b.type === "builtin" && b.key === "convert",
    )
  )
    main.blocks.push({
      id: id(),
      type: "builtin",
      key: "convert",
      name: "마크다운 변환",
      span: 4,
      rows: 2,
      ...findFreeSpot(main.blocks, main.cols, 4, 2),
    });
  if (!out.config.profiles || !Object.keys(out.config.profiles).length)
    out.config.profiles = { "기본 2단": clone(CATALOG.spec) };
  for (const [name, spec] of Object.entries(out.config.profiles))
    out.config.profiles[name] = profileSpec(spec);
  if (!out.config.profiles[out.config.active_profile])
    out.config.active_profile = Object.keys(out.config.profiles)[0];
  out.config.next_number = Math.max(1, Number(out.config.next_number) || 1);
  out.config.use_number ??= true;
  return out;
}
export function libraryLookup(state) {
  const map = new Map(CATALOG.builtins.map((b) => [b.label, ["문자", b]]));
  // First connected folder wins filename collisions; registered content wins both.
  for (const photo of state.photos)
    if (!map.has(photo.label))
      map.set(photo.label, ["사진", { ...photo, path: photo.id }]);
  for (const cat of CATEGORIES)
    for (const it of state.library[cat]) {
      const item = { ...it };
      if (item.mix?.length) {
        item._mix_items = item.mix
          .map((ref) => state.library["템플릿"].find((m) => m.id === ref))
          .filter(Boolean);
        item.slot_count = item._mix_items.reduce(
          (n, m) => n + (+m.slot_count || 0),
          0,
        );
      }
      if (item.label) map.set(item.label, [cat, item]);
    }
  return map;
}
export function resolvedItem(state, block) {
  const cat = {
    template: "템플릿",
    form: "양식",
    function: "서식",
    char: "문자",
  }[block.type];
  return (
    cat &&
    state.library[cat].find(
      (it) =>
        it.id === block.ref ||
        (!block.ref && it.name === (block.template || block.form)),
    )
  );
}
export function styleActions(item) {
  if (item.actions?.length) return clone(item.actions);
  return Object.entries(styleFields(item)).map(([k, v]) => ({
    func: { 글꼴: "글씨체", 크기: "글씨크기" }[k] || k,
    ...(["굵게", "기울임", "밑줄"].includes(k)
      ? v
        ? {}
        : { value: false }
      : { value: v }),
  }));
}
export const bytesToBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
};
export const base64ToBytes = (text) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export async function itemBytes(state, item) {
  if (item.asset && state.assets[item.asset])
    return base64ToBytes(state.assets[item.asset]);
  if (item.assetUrl) {
    const response = await fetch(
      new URL(item.assetUrl, new URL("../../", import.meta.url)),
    );
    if (!response.ok)
      throw new Error(`조각 파일을 열지 못했습니다: ${item.name}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error(
    `조각 파일이 없습니다: ${item.name}. 물감 창고에서 파일을 다시 등록해주세요.`,
  );
}
function database(mode, operation) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("5e-hwp-palette", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("settings");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction("settings", mode);
      let result;
      const r = operation(tx.objectStore("settings"));
      if (r)
        r.onsuccess = () => {
          result = r.result;
        };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("팔레트 저장 실패"));
      };
    };
  });
}
export class PaletteStore {
  constructor() {
    this.state = null;
    this.undo = [];
    this.redo = [];
    this.listeners = new Set();
    this.queue = Promise.resolve();
  }
  async open() {
    const saved = await database("readonly", (s) => s.get("current"));
    this.state = saved ? normalizeState(saved) : defaultState();
    return this;
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  enqueue(task) {
    const pending = this.queue.catch(() => {}).then(task);
    this.queue = pending;
    return pending;
  }
  async persist(next, { record = true } = {}) {
    const value = normalizeState(next),
      previous = this.state;
    await database("readwrite", (s) => {
      s.put(value, "current");
      if (previous) s.put(previous, "backup");
    });
    if (record && previous) {
      this.undo.push(previous);
      if (this.undo.length > 40) this.undo.shift();
      this.redo = [];
    }
    this.state = value;
    for (const listener of this.listeners) listener(value);
    return value;
  }
  commit(next, options) {
    return this.enqueue(() => this.persist(next, options));
  }
  update(mutator) {
    return this.enqueue(async () => {
      const next = clone(this.state);
      await mutator(next);
      return this.persist(next);
    });
  }
  undoChange() {
    return this.enqueue(async () => {
      if (!this.undo.length) return;
      const prev = this.undo.at(-1),
        current = this.state;
      await this.persist(prev, { record: false });
      this.undo.pop();
      this.redo.push(current);
    });
  }
  redoChange() {
    return this.enqueue(async () => {
      if (!this.redo.length) return;
      const next = this.redo.at(-1),
        current = this.state;
      await this.persist(next, { record: false });
      this.redo.pop();
      this.undo.push(current);
    });
  }
  async recover() {
    const backup = await database("readonly", (s) => s.get("backup"));
    if (!backup) throw new Error("이전 팔레트 설정이 없습니다.");
    return this.commit(backup);
  }
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
export function unzipPalette(bytes) {
  if (bytes.byteLength > 128 * 1024 * 1024)
    throw new Error("가져올 파일은 128 MB 이하여야 합니다.");
  let total = 0;
  const entries = unzipSync(bytes, {
    filter: (entry) => {
      total += entry.originalSize;
      if (total > 256 * 1024 * 1024 || entry.originalSize > 64 * 1024 * 1024)
        throw new Error("압축 안의 파일이 너무 큽니다.");
      if (
        entry.name.startsWith("/") ||
        entry.name.includes("\\") ||
        entry.name.split("/").includes("..")
      )
        throw new Error("압축 안의 파일 경로가 올바르지 않습니다.");
      return !entry.name.endsWith("/");
    },
  });
  return entries;
}
export function readChip(bytes) {
  const files = unzipPalette(bytes),
    json = (name) =>
      files[name] ? JSON.parse(decoder.decode(files[name])) : null;
  const library = json("library.json");
  if (library?.version !== 1 || !Array.isArray(library.items))
    throw new Error(
      "지원하는 물감 칩이 아닙니다. library.json을 확인해주세요.",
    );
  const manifest = json("chip.json") || {};
  if (manifest.chip_version !== undefined && manifest.chip_version !== 1)
    throw new Error("지원하지 않는 칩 버전입니다.");
  return {
    files,
    manifest,
    tab: json("tab.json"),
    exam: json("exam.json"),
    items: library.items,
  };
}
export function installChip(current, chip) {
  const next = clone(current),
    idMap = new Map(),
    known = new Map(
      CATEGORIES.flatMap((c) => next.library[c])
        .filter((i) => i.origin_id)
        .map((i) => [i.origin_id, i.id]),
    );
  const labels = new Set(
    CATEGORIES.flatMap((c) => next.library[c]).map((i) => i.label),
  );
  const added = [];
  const report = { added: 0, reused: 0, renamed: [], lost: 0 };
  for (const rec of chip.items) {
    const cat = rec.category;
    if (!CATEGORIES.includes(cat))
      throw new Error(`알 수 없는 물감 분류입니다: ${cat}`);
    if (rec.origin_id && known.has(rec.origin_id)) {
      idMap.set(rec.origin_id, known.get(rec.origin_id));
      report.reused++;
      continue;
    }
    const item = clone(rec);
    item.id = id();
    item.name = unique(
      String(rec.name || "물감"),
      new Set(next.library[cat].map((i) => i.name)),
    );
    item.label = unique(labelOf(rec.label || rec.name), labels, false);
    labels.add(item.label);
    item.tags = [];
    item.subcat = "";
    delete item.origin;
    delete item._mix_items;
    item.from_chip = chip.manifest.name || "가져온 물감";
    if (rec.name !== item.name || rec.label !== item.label)
      report.renamed.push([rec.name, item.name, item.label]);
    if (item.file && !item.mix) {
      const raw = chip.files[`fragments/${item.file}`];
      if (!raw) throw new Error(`칩에 조각 파일이 없습니다: ${item.name}`);
      item.asset = id();
      next.assets[item.asset] = bytesToBase64(raw);
      delete item.assetUrl;
    }
    if (rec.origin_id) {
      idMap.set(rec.origin_id, item.id);
      known.set(rec.origin_id, item.id);
    }
    next.library[cat].push(item);
    added.push(item);
    report.added++;
  }
  for (const item of added)
    if (item.mix) item.mix = item.mix.map((ref) => idMap.get(ref) || ref);
  if (chip.tab) {
    const tab = clone(chip.tab);
    tab.name = unique(
      String(tab.name || chip.manifest.name || "받은 팔레트"),
      new Set(next.config.palette_tabs.map((t) => t.name)),
    );
    for (const b of walkBlocks(tab.blocks)) {
      b.id = id();
      if (b.ref) {
        if (idMap.has(b.ref)) b.ref = idMap.get(b.ref);
        else report.lost++;
      }
    }
    next.config.palette_tabs.push(tab);
    report.tab = tab.name;
  }
  return { state: normalizeState(next), report };
}
export async function exportChip(
  state,
  {
    tab = null,
    items = null,
    name = tab?.name || "물감 꾸러미",
    note = "",
    author = "",
  } = {},
) {
  const pairs = [],
    seen = new Set();
  function include(cat, item) {
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    pairs.push([cat, item]);
    if (item.mix)
      for (const ref of item.mix)
        include(
          "템플릿",
          state.library["템플릿"].find((i) => i.id === ref),
        );
  }
  if (items) for (const [cat, it] of items) include(cat, it);
  else if (tab)
    for (const b of walkBlocks(tab.blocks)) {
      if (b.ref) {
        const cat = {
          template: "템플릿",
          form: "양식",
          function: "서식",
          char: "문자",
        }[b.type];
        if (cat)
          include(
            cat,
            state.library[cat].find((i) => i.id === b.ref),
          );
      }
    }
  else
    for (const cat of CATEGORIES)
      for (const it of state.library[cat]) include(cat, it);
  const files = {},
    records = [];
  for (const [cat, it] of pairs) {
    const rec = clone(it);
    for (const key of [
      "id",
      "origin",
      "tags",
      "subcat",
      "from_chip",
      "origin_id",
      "asset",
      "assetUrl",
      "_mix_items",
    ])
      delete rec[key];
    rec.origin_id = it.id;
    rec.category = cat;
    if (["템플릿", "양식"].includes(cat) && !it.mix) {
      rec.file = `${it.id.replace(/[^\w-]/g, "_")}.${(it.file || "document.hwp").split(".").pop()}`;
      files[`fragments/${rec.file}`] = await itemBytes(state, it);
    }
    records.push(rec);
  }
  files["library.json"] = encoder.encode(
    JSON.stringify({ version: 1, items: records }),
  );
  files["chip.json"] = encoder.encode(
    JSON.stringify({
      chip_version: 1,
      name,
      note,
      author,
      made_with: "5E · HwpPalette 0.4.0-beta",
    }),
  );
  if (tab) files["tab.json"] = encoder.encode(JSON.stringify(tab));
  return new Blob([zipSync(files)], { type: "application/zip" });
}
export function importProfile(state, value) {
  const next = clone(state),
    name = unique(
      value.exam_scribe_profile || "가져온 조판 설정",
      new Set(Object.keys(next.config.profiles)),
    );
  const spec = value.spec || value;
  if (!spec.layout || !spec.font) throw new Error("조판 설정 파일이 아닙니다.");
  next.config.profiles[name] = profileSpec(spec);
  next.config.active_profile = name;
  return next;
}
export function mergeLegacyFiles(state, config, library, assets = {}) {
  const next = clone(state);
  if (config) next.config = { ...next.config, ...clone(config) };
  if (library) {
    for (const cat of CATEGORIES)
      if (library[cat]) next.library[cat] = clone(library[cat]);
    for (const cat of ["템플릿", "양식"])
      for (const it of next.library[cat])
        if (it.file && assets[it.file]) {
          it.asset = id();
          next.assets[it.asset] = bytesToBase64(assets[it.file]);
          delete it.assetUrl;
        }
  }
  return normalizeState(next);
}
export function removeItem(state, category, ref) {
  if (
    category === "템플릿" &&
    state.library["템플릿"].some((i) => i.mix?.includes(ref))
  )
    throw new Error(
      "꾸러미에서 사용하는 물감입니다. 꾸러미에서 먼저 빼주세요.",
    );
  state.library[category] = state.library[category].filter((i) => i.id !== ref);
  function prune(blocks) {
    return blocks
      .filter((b) => b.ref !== ref)
      .map((b) =>
        b.type === "stack" ? { ...b, items: prune(b.items || []) } : b,
      );
  }
  for (const tab of state.config.palette_tabs) tab.blocks = prune(tab.blocks);
}
