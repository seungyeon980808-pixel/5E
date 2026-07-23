/* ===== PROJECT — .json 프로젝트 파일 읽기/쓰기 =====
 *
 * 파일 형식은 `js/project-io.js`의 serialize()가 내는 것과 동일해야 한다.
 * SCHEMA_VERSION "0.17" = pages[] 다중 페이지 구조.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeObject, bboxOf, OBJECT_TYPE_IDS } from "./schema.js";

export const SCHEMA_VERSION = "0.17";
export const DEFAULT_ARTBOARD = { w: 90, h: 60 };
const DEFAULT_LAYERS = [
  { id: 1, name: "레이어 1", visible: true },
  { id: 2, name: "레이어 2", visible: true },
  { id: 3, name: "레이어 3", visible: true },
];

let _seq = 0;
const stamp = () => Date.now().toString(36);
export const newObjectId = () => `obj_${stamp()}_m${++_seq}`;
export const newPageId = () => `page_${stamp()}_m${++_seq}`;

export function makePage(name, index = 0, artboard = DEFAULT_ARTBOARD) {
  return {
    id: newPageId(),
    name: name || `페이지 ${index + 1}`,
    meta: { number: "", points: "" },
    objects: [],
    guides: [],
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    artboard: { w: artboard.w, h: artboard.h },
  };
}

export function makeProject({ artboard = DEFAULT_ARTBOARD, pageNames = ["페이지 1"] } = {}) {
  const pages = pageNames.map((n, i) => makePage(n, i, artboard));
  return { version: SCHEMA_VERSION, pages, activePageId: pages[0].id };
}

/* ----- 경로 안전장치 -----
 * 사용자 지정 폴더 밖으로 쓰지 않도록 절대경로 + .json 확장자만 허용한다. */
export function resolveProjectPath(p) {
  if (!p || typeof p !== "string") throw new Error("path가 필요합니다");
  const abs = path.resolve(p);
  if (path.extname(abs).toLowerCase() !== ".json") {
    throw new Error(`프로젝트 파일은 .json 이어야 합니다: ${abs}`);
  }
  return abs;
}

export async function loadProject(p) {
  const abs = resolveProjectPath(p);
  if (!existsSync(abs)) throw new Error(`파일이 없습니다: ${abs}`);
  let data;
  try { data = JSON.parse(await readFile(abs, "utf8")); }
  catch (e) { throw new Error(`JSON 파싱 실패: ${e.message}`); }
  if (!data || !Array.isArray(data.pages)) {
    throw new Error("pages[]가 없습니다 — 5E 프로젝트 파일이 아니거나 구버전입니다(앱에서 한 번 열어 저장하면 변환됩니다)");
  }
  return { abs, data };
}

export async function saveProject(abs, data) {
  await writeFile(abs, JSON.stringify(data, null, 2), "utf8");
  return abs;
}

export function pickPage(data, pageRef) {
  if (pageRef === undefined || pageRef === null) {
    return data.pages.find((p) => p.id === data.activePageId) || data.pages[0];
  }
  if (typeof pageRef === "number") {
    const p = data.pages[pageRef];
    if (!p) throw new Error(`페이지 인덱스 ${pageRef}가 없습니다 (0..${data.pages.length - 1})`);
    return p;
  }
  const p = data.pages.find((q) => q.id === pageRef || q.name === pageRef);
  if (!p) throw new Error(`페이지 "${pageRef}"를 찾을 수 없습니다`);
  return p;
}

/* ----- 객체 여러 개를 한 페이지에 붙인다 (id/order 자동 부여) ----- */
export function appendObjects(page, rawObjects) {
  const errors = [];
  const warnings = [];
  const accepted = [];
  const used = new Set(page.objects.map((o) => o.id));

  rawObjects.forEach((raw, i) => {
    const r = normalizeObject(raw, { artboard: page.artboard });
    r.errors.forEach((e) => errors.push(`[${i}] ${e}`));
    r.warnings.forEach((w) => warnings.push(`[${i}] ${raw && raw.type}: ${w}`));
    if (!r.obj) return;
    let id = raw.id && !used.has(raw.id) ? raw.id : newObjectId();
    while (used.has(id)) id = newObjectId();
    used.add(id);
    accepted.push({ ...r.obj, id, order: page.objects.length + accepted.length });
  });

  // 하나라도 틀리면 아무것도 쓰지 않는다 — 반쯤 들어간 도면이 제일 고치기 어렵다.
  if (errors.length) return { ok: false, errors, warnings, ids: [] };
  page.objects.push(...accepted);
  return { ok: true, errors, warnings, ids: accepted.map((o) => o.id) };
}

/* ----- 전체 검증: 저장된 파일이 앱에서 제대로 열릴지 확인 ----- */
export function validateData(data) {
  const errors = [];
  const warnings = [];
  if (data.version !== SCHEMA_VERSION) {
    warnings.push(`version "${data.version}" (현재 ${SCHEMA_VERSION}) — 앱이 열 때 마이그레이션합니다`);
  }
  if (!data.pages.some((p) => p.id === data.activePageId)) {
    errors.push("activePageId가 어느 페이지와도 맞지 않습니다");
  }
  data.pages.forEach((page, pi) => {
    const tag = `페이지 ${pi + 1}(${page.name})`;
    if (!page.artboard || !(page.artboard.w > 0) || !(page.artboard.h > 0)) {
      errors.push(`${tag}: artboard 크기가 유효하지 않습니다`);
    }
    const ids = new Set();
    const planeIds = new Set(page.objects.filter((o) => o.type === "coordplane").map((o) => o.id));
    page.objects.forEach((o, oi) => {
      const where = `${tag} 객체 ${oi}(${o.type})`;
      if (!o.id) errors.push(`${where}: id가 없습니다`);
      else if (ids.has(o.id)) errors.push(`${where}: id 중복 "${o.id}"`);
      ids.add(o.id);
      if (!OBJECT_TYPE_IDS.includes(o.type)) errors.push(`${where}: 알 수 없는 type`);
      const r = normalizeObject(o, { artboard: page.artboard });
      r.errors.forEach((e) => errors.push(`${where}: ${e}`));
      r.warnings.forEach((w) => warnings.push(`${where}: ${w}`));
      if (o.type === "funcgraph" && o.planeId && !planeIds.has(o.planeId)) {
        errors.push(`${where}: planeId "${o.planeId}"인 coordplane이 없습니다`);
      }
      if (o.layerId && !(page.layers || []).some((l) => l.id === o.layerId)) {
        warnings.push(`${where}: layerId ${o.layerId}인 레이어가 없습니다`);
      }
    });
  });
  return { ok: errors.length === 0, errors, warnings };
}

/* ----- 사람이 읽을 요약 ----- */
export function summarize(data) {
  return data.pages.map((p, i) => ({
    index: i,
    id: p.id,
    name: p.name,
    artboard: p.artboard,
    objectCount: p.objects.length,
    objects: p.objects.map((o) => {
      const bb = bboxOf(o);
      return {
        id: o.id,
        type: o.type + (o.kind ? `:${o.kind}` : o.element ? `:${o.element}` : ""),
        label: o.label || o.text || o.expr || undefined,
        at: bb ? `${round(bb.x)},${round(bb.y)} ${round(bb.w)}×${round(bb.h)}` : `${round(o.x)},${round(o.y)}`,
      };
    }),
  }));
}
const round = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
