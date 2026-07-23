/* ===== RENDER/GRAPH-LABEL: 그래프용 혼합 라벨 렌더러 =====
 *
 * 축 이름·눈금·선끝·원점·안내선 라벨을 한 번에 처리하는 공용 렌더러.
 * 요구(사용자 명세):
 *   - 한글 = 기본 글씨체(돋움) 정자   / 영문 변수 = 물리량 글씨체(Latin Modern) 이탤릭
 *     → 한 문자열 안에서 자동 혼용 (스크립트별 런 분해)
 *   - 줄바꿈(\n) 지원 (한 줄로 안 끝나는 축 이름이 많음)
 *   - 수식(LaTeX 유사: v_0, t_2, \theta, \frac{a}{b}) 지원 — 영문/수식 런은 formula.js로 렌더
 *   - 라벨이 그래프 선 위에 뜨도록 얇은 흰 테두리(halo) — 겹쳐도 선이 부드럽게 끊김
 *
 * 좌표계: 월드 mm. size/x/y 전부 mm. formula.js와 동일한 정자-숫자/이탤릭-변수 규칙을 그대로 물려받는다.
 */

import { SVG_NS } from "./core.js?v=1.2.0";
import { TEXT_FONT_FAMILY, EQUATION_FONT_FAMILY } from "../state.js?v=1.2.0";
import { renderFormula, measureFormula } from "../formula.js?v=1.2.0";

function el(tag) { return document.createElementNS(SVG_NS, tag); }

// 한글(자모·완성형) 판정. 공백·숫자·라틴은 비한글(=수식 런)으로 흘러 formula가 처리.
const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// 한글은 같은 font-size라도 라틴/수식보다 커 보인다 → 더 줄여 시각 균형(요구: 한글 더 작게).
const KO_SCALE = 0.72;
// 기호(영문·괄호·수식) 런은 한글과 같은 크기면 더 커 보인다 → 기본값에서 2pt 축소(요구).
// 1pt = 0.3528mm → 2pt ≈ 0.71mm. 최소 1mm 보장.
const MATH_TRIM_MM = 0.71;

// 괄호 안은 "단위"로 본다(평가원 관례: 물리량 기호만 이탤릭, 단위는 정자).
// 예: "속도(m/s)" → 속도=한글 정자, (m/s)=라틴 정자(이탤릭 금지). 괄호 문자 자체도 정자.
// 괄호 안 한글은 그대로 한글체. ^·_ 첨자는 formula를 정자 모드로 태워 계속 동작(m/s^2).

// 오프스크린 캔버스로 한글 런 폭 측정(getBBox 회피, 앱 관례). mm를 px로 취급해도
// 폭이 폰트크기에 선형 비례하므로 mm 폭이 그대로 나온다(돋움은 시스템 폰트라 측정 신뢰 가능).
let _measureCtx = null;
function measureKo(text, sizeMm) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${sizeMm}px ${TEXT_FONT_FAMILY}`;
  return _measureCtx.measureText(text).width;
}

// 한 줄을 한글 / 수식(이탤릭) / 단위(괄호 안, 정자) 런으로 분해. 인접 동종 문자는 합친다.
// kind: "ko"(한글 정자) | "math"(formula 이탤릭) | "unit"(formula 정자 — 괄호+괄호 안 라틴)
function splitRuns(line) {
  const runs = [];
  let cur = "", curKind = null, depth = 0;
  const push = () => { if (cur !== "") runs.push({ kind: curKind, text: cur }); cur = ""; };
  for (const ch of line) {
    let kind;
    if (ch === "(") { depth++; kind = "unit"; }
    else if (ch === ")") kind = "unit";
    else if (HANGUL_RE.test(ch)) kind = "ko";               // 괄호 안이라도 한글은 한글체
    else kind = depth > 0 ? "unit" : "math";
    if (curKind === null) { curKind = kind; cur = ch; }
    else if (kind === curKind) cur += ch;
    else { push(); curKind = kind; cur = ch; }
    if (ch === ")") depth = Math.max(0, depth - 1);
  }
  push();
  return runs;
}

// formula.js 결과 <g>의 글리프 색을 라벨 색으로 통일(투명 히트 rect는 제거).
function recolorFormula(g, color) {
  g.querySelectorAll("rect").forEach((r) => { if (r.getAttribute("fill") === "transparent") r.remove(); });
  g.querySelectorAll("text, tspan, path, line, polygon").forEach((n) => {
    if (n.getAttribute("fill") !== "none" && n.getAttribute("fill") !== "transparent") n.setAttribute("fill", color);
    if (n.getAttribute("stroke") && n.getAttribute("stroke") !== "none") n.setAttribute("stroke", color);
  });
}

// 한 줄을 baseline y=0, 좌측 x=0 기준의 <g>로 빌드. { g, width, ascent, descent } 반환.
// ascent/descent는 실제 렌더 내용 기준(한글은 koSize) — 줄바꿈 간격을 촘촘히 쌓기 위함(요구).
// upright=true면 영문·수식 런까지 정자로 렌더한다(요구: 라벨러 표시점 A·B·C…는 기울임 없음).
// 점 이름은 변수가 아니라 '이름표'라 이탤릭이 어울리지 않는다 — 단위 런과 같은 처리로 통일.
function buildLine(line, size, color, upright = false) {
  const g = el("g");
  let cx = 0, asc = 0, desc = 0;
  for (const run of splitRuns(line)) {
    if (run.text === "") continue;
    if (run.kind === "ko") {
      const koSize = size * KO_SCALE;                // 한글만 살짝 축소(요구)
      const t = el("text");
      t.setAttribute("x", cx);
      t.setAttribute("y", 0);
      t.setAttribute("font-size", koSize);
      t.setAttribute("font-family", TEXT_FONT_FAMILY);
      t.setAttribute("font-style", "normal");        // 한글은 절대 이탤릭 금지(요구 2)
      t.setAttribute("fill", color);
      t.setAttribute("dominant-baseline", "alphabetic");
      t.textContent = run.text;
      g.appendChild(t);
      cx += measureKo(run.text, koSize);
      asc = Math.max(asc, koSize * 0.82);            // 한글 실제 높이(koSize 기준)
      desc = Math.max(desc, koSize * 0.18);
    } else {
      // 영문/수식 런: formula.js(첨자·분수·그리스·함수정자)로 렌더.
      // math=변수 이탤릭 / unit(괄호·단위)=정자 — fontStyle만 바꾸면 formula가 둘 다 처리.
      const style = (run.kind === "unit" || upright) ? "normal" : "italic";
      const mSize = Math.max(1, size - MATH_TRIM_MM);   // 기호는 한글 대비 2pt 작게(요구)
      const fh = { family: EQUATION_FONT_FAMILY, weight: "normal", style };
      const m = measureFormula(run.text, mSize, fh);
      const fg = renderFormula({ source: run.text, x: cx, y: -m.ascent, fontSize: mSize, fontFamily: EQUATION_FONT_FAMILY, fontStyle: style });
      recolorFormula(fg, color);
      // 단위 런 정자 강제: resolveTextFontStyle이 수식 글꼴을 무조건 이탤릭으로 되돌리므로
      // (state.js — 일반 수식 객체용 규칙), 여기서 글리프 스타일만 정자로 덮어쓴다.
      // 폭은 위 measureFormula가 이미 normal 기준으로 쟀으니 어긋나지 않는다.
      if (run.kind === "unit" || upright) {
        fg.querySelectorAll("text, tspan").forEach((t) => t.setAttribute("font-style", "normal"));
      }
      g.appendChild(fg);
      cx += m.w;
      // 공백만인 런(줄 안의 띄어쓰기·들여쓰기용)은 가로 폭만 차지하고 줄 높이(ascent/descent)엔
      // 기여하지 않는다. 안 그러면 공백의 수식-글꼴 높이가 한글 줄 높이를 부풀려, 스페이스를
      // 넣는 순간 위·아래 줄 간격이 벌어진다(사용자 보고 버그).
      if (run.text.trim() !== "") {
        asc = Math.max(asc, m.ascent);
        desc = Math.max(desc, m.descent);
      }
    }
  }
  if (asc === 0 && desc === 0) { asc = size * 0.78; desc = size * 0.22; } // 빈 줄 fallback
  return { g, width: cx, ascent: asc, descent: desc };
}

// 라벨 <text> 들에 흰 테두리 halo 부여(그래프 선 위에서 깔끔히 끊김; makeUprightLabel 방식).
function applyHalo(wrap, size) {
  wrap.querySelectorAll("text, tspan").forEach((t) => {
    t.setAttribute("paint-order", "stroke");
    t.setAttribute("stroke", "white");
    t.setAttribute("stroke-width", size * 0.16);
    t.setAttribute("stroke-linejoin", "round");
  });
}

/* ----- PUBLIC: 혼합 라벨을 SVG <g>로 렌더 -----
 * renderGraphLabel(source, {
 *   x, y,                     // 앵커 기준점(mm)
 *   size = 3.5,               // 글자 크기(mm)
 *   color = "#000",
 *   anchor = "start",         // 가로: "start" | "middle" | "end"
 *   vAlign = "baseline",      // 세로: "baseline"(첫 줄 baseline=y) | "top" | "middle" | "bottom"
 *   halo = true,
 *   lineGap = 1.3,            // 줄 간격(×size)
 *   upright = false,          // true면 영문·수식도 정자(라벨러 표시점처럼 '이름표'인 라벨)
 * }) → <g> | null(빈 문자열)
 */
// 줄 사이 여백(×size). 균일 lineHeight 대신 각 줄의 실제 ascent/descent로 촘촘히 쌓아
// 줄바꿈 간격을 크게 줄인다(요구: 위아래 간격 훨씬 좁게). 첫 baseline=0 기준 상대 baseline 배열.
const INTERLINE_GAP = 0.12;

export function renderGraphLabel(source, opts = {}) {
  const text = source == null ? "" : String(source);
  if (text.trim() === "") return null;
  const { x = 0, y = 0, size = 3.5, color = "#000", anchor = "start", vAlign = "baseline", halo = true, upright = false } = opts;

  const lines = text.split("\n").map((l) => buildLine(l, size, color, upright));
  const n = lines.length;
  const gap = size * INTERLINE_GAP;
  // 상대 baseline: 이전 줄 descent + 여백 + 현재 줄 ascent 만큼 내려간다(각 줄 실제 높이 기준).
  const baseYs = [0];
  for (let i = 1; i < n; i++) baseYs[i] = baseYs[i - 1] + lines[i - 1].descent + gap + lines[i].ascent;
  const ascent = lines[0].ascent;
  const descent = lines[n - 1].descent;
  const blockBottom = baseYs[n - 1] + descent; // 첫 baseline 기준 블록 하단
  let firstBaseY;
  if (vAlign === "top") firstBaseY = y + ascent;
  else if (vAlign === "bottom") firstBaseY = y - blockBottom;
  else if (vAlign === "middle") firstBaseY = y + (ascent - blockBottom) / 2;
  else firstBaseY = y; // baseline

  const wrap = el("g");
  lines.forEach((ln, i) => {
    const dx = anchor === "end" ? -ln.width : anchor === "middle" ? -ln.width / 2 : 0;
    ln.g.setAttribute("transform", `translate(${x + dx}, ${firstBaseY + baseYs[i]})`);
    wrap.appendChild(ln.g);
  });
  if (halo) applyHalo(wrap, size);
  return wrap;
}

// 라벨 블록의 대략 크기(배치 계산용). { w, ascent, descent, h }.
export function measureGraphLabel(source, size = 3.5, upright = false) {
  const text = source == null ? "" : String(source);
  if (text.trim() === "") return { w: 0, ascent: 0, descent: 0, h: 0 };
  const lines = text.split("\n").map((l) => buildLine(l, size, "#000", upright));
  const w = Math.max(...lines.map((l) => l.width), 0);
  const gap = size * INTERLINE_GAP;
  let h = lines[0].ascent + lines[0].descent;
  for (let i = 1; i < lines.length; i++) h += gap + lines[i].ascent + lines[i].descent;
  return { w, ascent: lines[0].ascent, descent: lines[lines.length - 1].descent, h };
}
