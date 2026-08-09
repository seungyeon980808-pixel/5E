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
import { createHash } from "node:crypto";
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

function partsSummary() {
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

/* Source-derived exam crops are intentionally much more restricted than the
 * original low-level buildPart helper.  The public MCP path below uses these
 * policies so a crop cannot silently become a generic hand asset. */
export const SAFE_PART_POLICY_VERSION = "5e-safe-exam-parts@1";

export const SAFE_PART_POLICIES = Object.freeze({
  hand_grip: Object.freeze({
    id: "hand_grip",
    sourceExamId: "p1_2025_06_19",
    requiredContext: "inclined-block-grip",
    allowedPanels: Object.freeze({
      p1_2023_09_20: "p1_2023_09_20#panel-1",
      p1_2025_06_19: "p1_2025_06_19#panel-1",
      p1_2027_06_18: "p1_2027_06_18#panel-1",
    }),
    scale: Object.freeze([0.5, 2]),
    hashes: Object.freeze({
      "hand_grip.png": "e254239271fe26e69d60a59117d5a2907115c5943c632a3686021e4831120fef",
      "hand_grip_back.png": "1ea737e90a318b794fdd3ff33b1ddcc662afbd352e53a790196c9826aecc923f",
      "hand_grip_front.png": "54f199c338f4abe059aaf81ce69732f202dc7bbebcdee10b7a8baf897abba6d5",
    }),
    contaminationScrub: Object.freeze({
      file: "hand_grip_front.png",
      reason: "isolated source-specific component outside the hand silhouette",
      cutout: Object.freeze({ type: "rect", x: 2 / 46, y: 68 / 110, w: 7 / 46, h: 15 / 110 }),
    }),
    doNotGeneralize: Object.freeze([
      "Only a single hand gripping a block in the audited inclined-target family is authorized.",
      "Do not use for rods, tools, pressing, touching, gloved work, two-hand actions, or a different view.",
    ]),
  }),
  hand_press: Object.freeze({
    id: "hand_press",
    sourceExamId: "p1_2024_11_08",
    requiredContext: "dashed-two-finger-spring-compression",
    allowedPanels: Object.freeze({ p1_2024_11_08: "p1_2024_11_08#panel-1" }),
    scale: Object.freeze([0.75, 1.5]),
    hashes: Object.freeze({
      "hand_press.png": "3f543b4935c4c0becd35920c51155b5f24c6fb1e561c98a1c8e040cbb34f51b4",
    }),
    contaminationScrub: null,
    doNotGeneralize: Object.freeze([
      "Exact dashed two-finger spring-compression scene only.",
      "Do not solidify, mirror, or reuse for gripping, pointing, touching, or laboratory handling.",
    ]),
  }),
});

export function safePartsSummary() {
  return [
    `안전 삽화 부품 ${Object.keys(SAFE_PART_POLICIES).length}개 (${SAFE_PART_POLICY_VERSION})`,
    "각 부품은 purpose, examId, panelRef, context가 감사 매니페스트와 정확히 일치할 때만 사용할 수 있습니다.",
    "  hand_grip  — inclined-block-grip; 허용 문항 3개; 앞/뒤 사이에는 무문자 rect 1개만 허용",
    "  hand_press — dashed-two-finger-spring-compression; p1_2024_11_08#panel-1 전용",
    "출처 래스터는 변경하지 않으며 hand_grip의 고립 표식은 비파괴 cutout으로 가립니다.",
  ].join("\n");
}

/* at        : 좌상단 좌표(기본 배치 기준)
 * gripAt    : 쥐는 선(앞/뒤 경계)을 이 점에 맞춘다 — 물체의 모서리 좌표를 그대로 준다.
 *             세로는 중심 정렬이라 물체 한가운데를 쥔 모양이 된다.
 * w / h     : 둘 다 생략하면 기출 인쇄 크기. 하나만 주면 비율 유지.
 * layer     : "both"(기본) | "back" | "front" — 나눠 부를 때 쓴다.
 * between   : 뒤 조각과 앞 조각 사이에 낄 객체들(= 쥐는 대상). 그리는 순서가 앞뒤다.
 */
function buildPart({ part, at, gripAt, w, h, layer = "both", between = [] }) {
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

const SAFE_PART_INPUT_FIELDS = new Set([
  "part", "purpose", "examId", "panelRef", "context", "mode",
  "at", "gripAt", "w", "h", "layer", "between",
]);
const FORBIDDEN_RENDER_KEYS = /^(?:text|source|formula|label(?:inner|outer)?|labeltype|labelpos|labelshow|terminalLabels?|arrow|arrowHead|startArrow|endArrow|leader|caption|number|symbol|showLabels?|showNumbers?|showSymbol|showAxisLabels?|showTickLabels|showLengthLabel)$/i;
const FORBIDDEN_OBJECT_TYPES = new Set(["text", "formula", "labeler"]);

function firstForbiddenRenderedField(value, pathPrefix = "between") {
  if (!value || typeof value !== "object") return null;
  if (FORBIDDEN_OBJECT_TYPES.has(value.type)) return `${pathPrefix}.type`;
  for (const [key, child] of Object.entries(value)) {
    const pathHere = `${pathPrefix}.${key}`;
    if (FORBIDDEN_RENDER_KEYS.test(key)) return pathHere;
    if (child && typeof child === "object") {
      const nested = firstForbiddenRenderedField(child, pathHere);
      if (nested) return nested;
    }
  }
  return null;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function verifySafePartFiles(policy) {
  for (const [file, expected] of Object.entries(policy.hashes)) {
    const abs = path.join(PARTS_DIR, file);
    if (!existsSync(abs)) return `안전 부품 원본 파일이 없습니다: ${file}`;
    if (sha256File(abs) !== expected) {
      return `안전 부품 원본 무결성 검증에 실패했습니다: ${file}. 출처 래스터를 수정하지 말고 다시 감사하십시오.`;
    }
  }
  return null;
}

function safePartScaleError(partRow, policy, w, h) {
  const [nativeW, nativeH] = partRow.mm;
  if (w != null && (!Number.isFinite(w) || w <= 0)) return "w는 양수 mm여야 합니다.";
  if (h != null && (!Number.isFinite(h) || h <= 0)) return "h는 양수 mm여야 합니다.";
  if (Number.isFinite(w) && Number.isFinite(h)) {
    const ratioError = Math.abs((w / h) / (nativeW / nativeH) - 1);
    if (ratioError > 0.005) return "출처 삽화의 종횡비를 바꿀 수 없습니다. w 또는 h 하나만 지정하십시오.";
  }
  const resolvedW = Number.isFinite(w) ? w : Number.isFinite(h) ? (h / nativeH) * nativeW : nativeW;
  const resolvedH = Number.isFinite(h) ? h : (resolvedW / nativeW) * nativeH;
  const scaleX = resolvedW / nativeW, scaleY = resolvedH / nativeH;
  const [minScale, maxScale] = policy.scale;
  if (scaleX < minScale || scaleX > maxScale || scaleY < minScale || scaleY > maxScale) {
    return `${partRow.id} 배율은 원본의 ${minScale}~${maxScale}배만 허용됩니다.`;
  }
  return null;
}

/**
 * Provenance-locked public wrapper for the two existing source-derived crops.
 * buildPart remains a low-level internal compositor; MCP calls use this guard.
 */
export function buildSafePart(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return { error: "부품 요청은 객체여야 합니다." };
  const extra = Object.keys(args).filter((key) => !SAFE_PART_INPUT_FIELDS.has(key));
  if (extra.length) return { error: `안전 부품에서 허용하지 않는 필드: ${extra.join(", ")}` };

  const { part, purpose, examId, panelRef, context, mode = "diagram" } = args;
  const policy = SAFE_PART_POLICIES[part];
  if (!policy) return { error: `안전하게 승인되지 않은 부품: ${String(part)}\n\n${safePartsSummary()}` };
  if (purpose !== "reference-reconstruction") {
    return { error: "purpose는 'reference-reconstruction'이어야 합니다. 기존 기출 장면 재구성 외 용도로 사용할 수 없습니다." };
  }
  if (mode !== "diagram") return { error: "안전 삽화 부품은 diagram 모드에서만 사용할 수 있습니다." };
  const requiredPanel = Object.hasOwn(policy.allowedPanels, examId) ? policy.allowedPanels[examId] : null;
  if (!requiredPanel || panelRef !== requiredPanel) {
    return { error: `${part}는 감사된 문항/패널 조합에만 허용됩니다. examId와 panelRef를 정확히 지정하십시오.` };
  }
  if (context !== policy.requiredContext) {
    return { error: `${part} context는 '${policy.requiredContext}'이어야 합니다.` };
  }
  if (args.layer != null && args.layer !== "both") return { error: "안전 래퍼는 앞/뒤 단독 레이어 사용을 허용하지 않습니다." };

  const partRow = loadParts().find((row) => row.id === part);
  if (!partRow) return { error: `부품 매니페스트에 ${part}가 없습니다.` };
  const integrityError = verifySafePartFiles(policy);
  if (integrityError) return { error: integrityError };
  const scaleError = safePartScaleError(partRow, policy, args.w, args.h);
  if (scaleError) return { error: scaleError };

  const between = args.between == null ? [] : args.between;
  if (!Array.isArray(between)) return { error: "between은 배열이어야 합니다." };
  if (part === "hand_grip") {
    if (!args.gripAt || !Number.isFinite(args.gripAt.x) || !Number.isFinite(args.gripAt.y) || args.at != null) {
      return { error: "hand_grip은 at 없이 gripAt:{x,y}로만 배치하십시오." };
    }
    if (between.length !== 1 || between[0]?.type !== "rect") {
      return { error: "hand_grip의 between에는 쥐는 무문자 rect 객체 정확히 1개만 허용됩니다." };
    }
    const held = between[0];
    if (![held.x, held.y, held.w, held.h].every(Number.isFinite) || held.w <= 0 || held.h <= 0) {
      return { error: "hand_grip의 rect에는 유효한 x,y,w,h가 필요합니다." };
    }
  } else {
    if (!args.at || !Number.isFinite(args.at.x) || !Number.isFinite(args.at.y) || args.gripAt != null) {
      return { error: "hand_press는 gripAt 없이 at:{x,y}로만 배치하십시오." };
    }
    if (between.length) return { error: "hand_press는 exact-scene-only 부품이므로 between 합성을 허용하지 않습니다." };
  }

  const forbidden = firstForbiddenRenderedField(between);
  if (forbidden) return { error: `그림형 안전 부품에는 문자·숫자·기호·화살표 필드를 넣을 수 없습니다: ${forbidden}` };

  const built = buildPart({
    part,
    at: args.at,
    gripAt: args.gripAt,
    w: args.w,
    h: args.h,
    layer: "both",
    between,
  });
  if (built.error) return built;

  const objects = built.objects.map((object) => {
    const out = { ...object };
    const sourceFile = object.srcPath ? path.basename(object.srcPath) : null;
    if (policy.contaminationScrub && sourceFile === policy.contaminationScrub.file) {
      out.cutouts = [{ ...policy.contaminationScrub.cutout }];
    }
    out.assetProvenance = {
      policyVersion: SAFE_PART_POLICY_VERSION,
      part,
      sourceExamId: policy.sourceExamId,
      authorizedExamId: examId,
      authorizedPanelRef: panelRef,
      purpose,
      context,
      sourceDerivedRaster: object.type === "image",
      contaminationScrub: policy.contaminationScrub && sourceFile === policy.contaminationScrub.file
        ? "non-destructive-normalized-cutout"
        : "none",
    };
    return out;
  });
  return {
    ...built,
    objects,
    policyVersion: SAFE_PART_POLICY_VERSION,
    provenance: {
      part,
      sourceExamId: policy.sourceExamId,
      authorizedExamId: examId,
      authorizedPanelRef: panelRef,
      sourceDerivedRaster: true,
      sourceFilesUnmodified: true,
      doNotGeneralize: [...policy.doNotGeneralize],
    },
    notes: [
      ...built.notes,
      `안전 정책 ${SAFE_PART_POLICY_VERSION}: ${examId} ${panelRef} 전용`,
      ...(policy.contaminationScrub ? ["고립 표식은 원본 변경 없이 정규화 cutout으로 제거"] : []),
    ],
  };
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function r2(v) { return Math.round(v * 100) / 100; }
