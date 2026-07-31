/* ===== PARTS — 기출 원본에서 오려낸 삽화 부품 =====
 *
 * 사람·손·차량 같은 삽화는 **그리지 않는다**. 기출 PDF 안에 600dpi 원본이 있으므로
 * 거기서 오려 쓴다(tools/pdf-figure-extract.py → tools/cutout-part.py).
 * 이 모듈은 그 결과물(assets/exam-parts/manifest.json)을 읽어 배치 좌표만 계산한다.
 *
 * 두 조각(앞/뒤)이 왜 필요한가 — 물체를 '쥔' 그림은 한 장으로는 안 된다.
 * 손바닥은 물체 뒤, 손가락은 물체 앞에 있어야 쥔 것으로 보인다. 그래서 부품은
 * 쥐는 선에서 잘려 있고, 이 빌더는 [뒤 조각 → (물체) → 앞 조각] 순서로 객체를
 * 만들어 준다. 그리는 순서가 곧 앞뒤이므로 between 에 준 객체가 그 사이에 낀다.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTS_DIR = path.resolve(HERE, "..", "..", "..", "assets", "exam-parts");
const MANIFEST = path.join(PARTS_DIR, "manifest.json");

export function loadParts() {
  if (!existsSync(MANIFEST)) return [];
  try {
    const rows = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function partsSummary() {
  const rows = loadParts();
  if (!rows.length) {
    return "부품이 아직 없습니다. tools/cutout-part.py 로 기출 원본에서 오려 넣으세요.";
  }
  return [
    `부품 ${rows.length}개 (assets/exam-parts) — 크기는 기출 인쇄 크기 그대로입니다.`,
    ...rows.map((r) => {
      const two = r.split ? " · 앞/뒤 두 조각" : "";
      const kw = r.keywords && r.keywords.length ? ` [${r.keywords.join(" ")}]` : "";
      return `  ${r.id.padEnd(14)} ${r.name}  ${r.mm[0]}×${r.mm[1]}mm${two}${kw}`;
    }),
  ].join("\n");
}

/* at        : 좌상단 좌표(기본 배치 기준)
 * gripAt    : 쥐는 선(앞/뒤 경계)을 이 점에 맞춘다 — 물체의 모서리 좌표를 그대로 준다.
 *             세로는 중심 정렬이라 물체 한가운데를 쥔 모양이 된다.
 * w / h     : 둘 다 생략하면 기출 인쇄 크기. 하나만 주면 비율 유지.
 * layer     : "both"(기본) | "back" | "front" — 나눠 부를 때 쓴다.
 * between   : 뒤 조각과 앞 조각 사이에 낄 객체들(= 쥐는 대상). 그리는 순서가 앞뒤다.
 */
export function buildPart({ part, at, gripAt, w, h, layer = "both", between = [] }) {
  const rows = loadParts();
  const p = rows.find((r) => r.id === part);
  if (!p) {
    return { error: `모르는 부품: ${part}\n\n${partsSummary()}` };
  }
  const [mmW, mmH] = p.mm;
  const W = num(w, Number.isFinite(h) ? (h / mmH) * mmW : mmW);
  const H = num(h, (W / mmW) * mmH);
  const warnings = [];

  const src = (f) => path.join(PARTS_DIR, f);
  const splitX = p.split && p.split.axis === "x" ? (p.split.px / p.px[0]) * W : null;
  const splitY = p.split && p.split.axis === "y" ? (p.split.px / p.px[1]) * H : null;

  // 배치 기준점 → 좌상단
  let x0, y0;
  if (gripAt && Number.isFinite(gripAt.x) && Number.isFinite(gripAt.y)) {
    x0 = gripAt.x - (splitX === null ? W / 2 : splitX);
    y0 = gripAt.y - (splitY === null ? H / 2 : splitY);
  } else if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    x0 = at.x; y0 = at.y;
  } else {
    return { error: "at 또는 gripAt 중 하나는 있어야 합니다" };
  }

  const objects = [];
  const push = (file, x, y, ww, hh) =>
    objects.push({ type: "image", srcPath: src(file), x: r2(x), y: r2(y), w: r2(ww), h: r2(hh) });

  if (!p.split) {
    if (between.length) warnings.push(`${part}은(는) 한 조각짜리라 between 은 그냥 위에 얹힙니다`);
    push(p.files.full, x0, y0, W, H);
    objects.push(...between);
  } else if (p.split.axis === "x") {
    if (layer !== "front") push(p.files.back, x0, y0, splitX, H);
    objects.push(...between);
    if (layer !== "back") push(p.files.front, x0 + splitX, y0, W - splitX, H);
  } else {
    if (layer !== "front") push(p.files.back, x0, y0, W, splitY);
    objects.push(...between);
    if (layer !== "back") push(p.files.front, x0, y0 + splitY, W, H - splitY);
  }

  const grip = p.split
    ? (p.split.axis === "x" ? `쥐는 선 x=${r2(x0 + splitX)}` : `쥐는 선 y=${r2(y0 + splitY)}`)
    : "한 조각(쥐는 선 없음)";
  return {
    objects,
    warnings,
    notes: [
      `${p.name}(${p.id}) — ${r2(W)}×${r2(H)}mm, ${grip}`,
      `출처: ${p.source && p.source.src ? p.source.src : "?"} ${p.source && p.source.note ? `— ${p.source.note}` : ""}`,
      ...(between.length ? [`사이에 낀 객체 ${between.length}개 — 뒤 조각은 가려지고 앞 조각이 그 위에 옵니다`] : []),
    ],
  };
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function r2(v) { return Math.round(v * 100) / 100; }
