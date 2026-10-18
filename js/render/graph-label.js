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

import { SVG_NS, HALO_RATIO, applyGlyphHalo } from "./core.js?v=1.7.0-four-session-integration";
import { TEXT_FONT_FAMILY, EQUATION_FONT_FAMILY } from "../state.js?v=1.7.0-four-session-integration";
import { renderFormula, measureFormula } from "../formula.js?v=1.7.0-four-session-integration";
import { graphLabelUnitSource, graphLabelRuns } from '../graph/label-roles.js?v=1.7.0-four-session-integration';
export const GRAPH_LABEL_RENDER_VERSION = 'graph-label-v3-semantic-units';

function labelWeight(value) { return Number.isFinite(Number(value)) ? Math.max(100, Math.min(900, Number(value))) : 400; }

function el(tag) { return document.createElementNS(SVG_NS, tag); }

// 한글(자모·완성형) 판정. 공백·숫자·라틴은 비한글(=수식 런)으로 흘러 formula가 처리.
const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// 한글은 같은 font-size라도 라틴/수식보다 커 보인다 → 더 줄여 시각 균형(요구: 한글 더 작게).
const KO_SCALE = 0.72;
// 기호(영문·괄호·수식) 런은 한글과 같은 크기면 더 커 보인다 → 기본값에서 2pt 축소(요구).
// 1pt = 0.3528mm → 2pt ≈ 0.71mm. 최소 1mm 보장.
const MATH_TRIM_MM = 0.71;

// Legacy labels infer units from parentheses. Description graphs instead use
// declared units, leaving function arguments such as f(t) in variable type.

// 오프스크린 캔버스로 한글 런 폭 측정(getBBox 회피, 앱 관례). mm를 px로 취급해도
// 폭이 폰트크기에 선형 비례하므로 mm 폭이 그대로 나온다(돋움은 시스템 폰트라 측정 신뢰 가능).
let _measureCtx = null;
function measureKo(text, sizeMm, weight = 400) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} ${sizeMm}px ${TEXT_FONT_FAMILY}`;
  return _measureCtx.measureText(text).width;
}

// 한 줄을 한글 / 수식(이탤릭) / 단위(괄호 안, 정자) 런으로 분해. 인접 동종 문자는 합친다.
// kind: "ko"(한글 정자) | "math"(formula 이탤릭) | "unit"(formula 정자 — 괄호+괄호 안 라틴)
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
// Source observations describe visible glyph height, not CSS em size. Keep the
// editor's legacy size policy separate so it cannot shrink measured exam labels.
function sourceEmSize(height, family, sample, weight) {
  if (!_measureCtx) _measureCtx = document.createElement("canvas").getContext("2d");
  _measureCtx.font = `${weight} 128px ${family}`;
  const m = _measureCtx.measureText(sample);
  const ratio = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / 128;
  return height / (Number.isFinite(ratio) && ratio > 0 ? ratio : 0.75);
}
function mathSize(size, weight, sourceHeight) {
  return sourceHeight ? sourceEmSize(size, EQUATION_FONT_FAMILY, "H0", weight) : Math.max(1, size - MATH_TRIM_MM);
}
function buildPlainLine(line, size, color, upright = false, weight = 400, sourceHeight = false, parenthesesAreUnits = true) {
  const g = el("g");
  let cx = 0, asc = 0, desc = 0;
  for (const run of graphLabelRuns(line, parenthesesAreUnits)) {
    if (run.text === "") continue;
    if (run.kind === "ko") {
      const koSize = sourceHeight ? sourceEmSize(size, TEXT_FONT_FAMILY, "가", weight) : size * KO_SCALE;                // legacy graphs retain their visual balance
      const t = el("text");
      t.setAttribute("x", cx);
      t.setAttribute("y", 0);
      t.setAttribute("font-size", koSize);
      t.setAttribute("font-weight", weight);
      t.setAttribute("font-family", TEXT_FONT_FAMILY);
      t.setAttribute("font-style", "normal");        // 한글은 절대 이탤릭 금지(요구 2)
      t.setAttribute("fill", color);
      t.setAttribute("dominant-baseline", "alphabetic");
      t.textContent = run.text;
      g.appendChild(t);
      cx += measureKo(run.text, koSize, weight);
      asc = Math.max(asc, koSize * 0.82);            // 한글 실제 높이(koSize 기준)
      desc = Math.max(desc, koSize * 0.18);
    } else {
      // 영문/수식 런: formula.js(첨자·분수·그리스·함수정자)로 렌더.
      // math=변수 이탤릭 / unit(괄호·단위)=정자 — fontStyle만 바꾸면 formula가 둘 다 처리.
      const style = (run.kind === "unit" || upright) ? "normal" : "italic";
      const mSize = mathSize(size, weight, sourceHeight);   // measured source height bypasses the legacy trim
      const fh = { family: EQUATION_FONT_FAMILY, weight: String(weight), style };
      const m = measureFormula(run.text, mSize, fh);
      // halo:false 필수 — renderFormula의 기본 halo는 글리프에 '흰색 stroke'를 건다. 그런데
      // 바로 아래 recolorFormula가 stroke를 라벨 색(검정)으로 덮어써서, 흰 테두리가 '검은
      // 테두리'로 바뀌어 글자가 굵은 슬랩체처럼 뭉개진다(눈금 숫자 굵기 버그).
      // 축 이름처럼 halo가 필요한 경우는 renderGraphLabel이 applyHalo로 따로 씌우므로
      // (그쪽은 stroke를 흰색으로 다시 설정) 여기서 formula 자체 halo는 꺼야 한다.
      const fg = renderFormula({ source: run.text, x: cx, y: -m.ascent, fontSize: mSize, fontFamily: EQUATION_FONT_FAMILY, fontStyle: style, fontWeight: String(weight), halo: false });
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

// Graph-local LaTeX formatting: keep balanced groups and fractions intact before
// script/font splitting. The shared formula parser intentionally has a smaller
// command vocabulary; graph labels must not print formatting commands literally.
function graphMathNodes(source, depth = 0) {
  if (depth > 16) return [{ kind: 'literal', text: source }];
  let i = 0; const nodes = [];
  const group = () => {
    while (/\s/.test(source[i] || '') && i < source.length) i++;
    if (source[i] !== '{') return null;
    const start = ++i; let level = 1;
    while (i < source.length) {
      if (source[i] === '\\' && /[{}]/.test(source[i + 1] || '')) { i += 2; continue; }
      if (source[i] === '{') level++;
      if (source[i] === '}' && --level === 0) { const body = source.slice(start,i); i++; return body; }
      i++;
    }
    return null;
  };
  const literal = text => { const prev=nodes.at(-1); if(prev?.kind==='literal') prev.text+=text; else nodes.push({kind:'literal',text}); };
  while (i < source.length) {
    if (source[i] === '\\') {
      const delimiter = /^\\(left|right)\s*([()[\]|.])/.exec(source.slice(i));
      if (delimiter) {
        nodes.push({ kind: 'delimiter', text: delimiter[2] === '.' ? '' : delimiter[2], opening: delimiter[1] === 'left' });
        i += delimiter[0].length; continue;
      }
      const start=i, match=/^\\(mathrm|text|frac)\b/.exec(source.slice(i));
      if (match) {
        i+=match[0].length; const body=group();
        if (body !== null) {
          if (match[1] === 'frac') { const den=group(); if(den !== null) {nodes.push({kind:'frac',num:graphMathNodes(body,depth+1),den:graphMathNodes(den,depth+1)});continue;} }
          else {nodes.push({kind:'upright',nodes:graphMathNodes(body,depth+1)});continue;}
        }
        i=start;
      }
      if(source[i+1]===';') {nodes.push({kind:'space',em:5/18});i+=2;continue;}
      if(source[i+1]===',') {nodes.push({kind:'space',em:3/18});i+=2;continue;}
      const command=/^\\[A-Za-z]+/.exec(source.slice(i));
      if(command) {literal(command[0]);i+=command[0].length;continue;}
    }
    if ((source[i]==='^'||source[i]==='_') && nodes.length) {
      const kind=source[i++]==='^'?'sup':'sub';let body;
      // 교사는 10^14, 10^-3, s^-1처럼 중괄호 없이 쓴다. 위첨자 뒤 숫자 묶음(앞의 −까지)은 한꺼번에 올린다. 중괄호는 그대로.
      const run=kind==='sup'&&source[i]!=='{'?/^[-−]?\d+/.exec(source.slice(i)):null;
      if(source[i]==='{') body=group(); else if(run){body=run[0].replace('-','−');i+=run[0].length;} else body=source[i++] || '';
      if(body!==null) {const last=nodes.pop(); const node=last.kind==='scripts'?last:{kind:'scripts',base:[last]};node[kind]=graphMathNodes(body,depth+1);nodes.push(node);continue;}
    }
    if(source[i]==='{') {const start=i,body=group();if(body!==null){nodes.push({kind:'group',nodes:graphMathNodes(body,depth+1)});continue;}i=start;}
    literal(source[i++]);
  }
  return nodes;
}
function buildGraphMath(nodes,size,color,upright,weight,sourceHeight=false,parenthesesAreUnits=true) {
  const g=el('g');let width=0,ascent=0,descent=0,unitDepth=0;
  const put=(child,x,y)=>{child.g.setAttribute('transform',`translate(${x},${y})`);g.appendChild(child.g);};
  const F=mathSize(size,weight,sourceHeight), scaled=ratio=>sourceHeight?size*ratio:F*ratio+MATH_TRIM_MM;
  for(const node of nodes) {
    let b;
    const inUnit = upright || (parenthesesAreUnits && unitDepth > 0);
    if(node.kind==='delimiter') {
      if(node.opening) unitDepth++;
      b=node.text ? buildPlainLine(node.text,size,color,true,weight,sourceHeight) : {g:el('g'),width:0,ascent:0,descent:0};
      if(!node.opening) unitDepth=Math.max(0,unitDepth-1);
    }
    else if(node.kind==='literal') b=buildPlainLine(node.text,size,color,inUnit,weight,sourceHeight,parenthesesAreUnits);
    else if(node.kind==='space') b={g:el('g'),width:F*node.em,ascent:0,descent:0};
    else if(node.kind==='upright'||node.kind==='group') b=buildGraphMath(node.nodes,size,color,node.kind==='upright'||inUnit,weight,sourceHeight,parenthesesAreUnits);
    else if(node.kind==='frac') {
      const n=buildGraphMath(node.num,scaled(.88),color,inUnit,weight,sourceHeight,parenthesesAreUnits),d=buildGraphMath(node.den,scaled(.88),color,inUnit,weight,sourceHeight,parenthesesAreUnits);
      const pad=F*.05,inner=Math.max(n.width,d.width),bar=-F*.22,nb=bar-F*.08-n.descent,db=bar+F*.08+d.ascent,fg=el('g');
      n.g.setAttribute('transform',`translate(${pad+(inner-n.width)/2},${nb})`);d.g.setAttribute('transform',`translate(${pad+(inner-d.width)/2},${db})`);
      const rule=el('line');rule.setAttribute('x1',pad*.45);rule.setAttribute('x2',inner+2*pad-pad*.45);rule.setAttribute('y1',bar);rule.setAttribute('y2',bar);rule.setAttribute('stroke',color);rule.setAttribute('stroke-width',Math.max(F*.035,.08));rule.setAttribute('stroke-linecap','round');fg.append(rule,n.g,d.g);
      b={g:fg,width:inner+2*pad,ascent:n.ascent-nb,descent:db+d.descent};
    } else if(node.kind==='scripts') {
      b=buildGraphMath(node.base,size,color,inUnit,weight,sourceHeight,parenthesesAreUnits);let sw=0;
      for(const [kind,dy] of [['sup',-F*.42],['sub',F*.2]]) if(node[kind]) {const script=buildGraphMath(node[kind],scaled(.66),color,inUnit,weight,sourceHeight,parenthesesAreUnits);script.g.setAttribute('transform',`translate(${b.width+F*.02},${dy})`);b.g.append(script.g);sw=Math.max(sw,script.width);b.ascent=Math.max(b.ascent,script.ascent-dy);b.descent=Math.max(b.descent,script.descent+dy);}
      b.width+=sw+F*.04;
    }
    if(b){put(b,width,0);width+=b.width;ascent=Math.max(ascent,b.ascent);descent=Math.max(descent,b.descent);}
  }
  return {g,width,ascent,descent};
}
function buildLine(line,size,color,upright=false,weight=400,sourceHeight=false,parenthesesAreUnits=true) {
  return (/\\(?:mathrm|text|left|right)\b|\\;/.test(line) || (/\\frac\b/.test(line) && HANGUL_RE.test(line)))
    ? buildGraphMath(graphMathNodes(line),size,color,upright,weight,sourceHeight,parenthesesAreUnits)
    : buildPlainLine(line,size,color,upright,weight,sourceHeight,parenthesesAreUnits);
}

// 라벨 <text> 들에 흰 테두리 halo 부여(그래프 선 위에서 깔끔히 끊김; makeUprightLabel 방식).
/* 가림(할로)은 core.applyGlyphHalo가 단일 출처다 — 캔버스 라벨과 그래프 라벨이
 * 같은 굵기·같은 모양으로 나온다. 그림마다 다르게 주려면 opts.haloRatio를 넘긴다. */
export { HALO_RATIO, graphMathNodes };

/* ----- PUBLIC: 혼합 라벨을 SVG <g>로 렌더 -----
 * renderGraphLabel(source, {
 *   x, y,                     // 앵커 기준점(mm)
 *   size = 3.5,               // 글자 크기(mm)
 *   color = "#000",
 *   anchor = "start",         // 가로: "start" | "middle" | "end"
 *   vAlign = "baseline",      // 세로: "baseline"(첫 줄 baseline=y) | "top" | "middle" | "bottom"
 *   halo = true,
 *   lineGap = 1.3,            // 줄 간격(×size)
 *   sourceHeight = false,     // true: size is observed cap/glyph height, not em
 *   upright = false,          // true면 영문·수식도 정자(라벨러 표시점처럼 '이름표'인 라벨)
 * }) → <g> | null(빈 문자열)
 */
// 줄 사이 여백(×size). 균일 lineHeight 대신 각 줄의 실제 ascent/descent로 촘촘히 쌓아
// 줄바꿈 간격을 크게 줄인다(요구: 위아래 간격 훨씬 좁게). 첫 baseline=0 기준 상대 baseline 배열.
const INTERLINE_GAP = 0.12;

export function renderGraphLabel(source, opts = {}) {
  const text = graphLabelUnitSource(source, opts.unit);
  if (text.trim() === "") return null;
  if (opts.orientation === 'vertical') {
    // Korean syllables stack upright; a formula run stays intact (fractions/scripts
    // must not be split into individual braces or operators).
    const tokens = text.split(/([가-힣ᄀ-ᇿ㄰-㆏])/u).map(t => t.trim()).filter(Boolean);
    return renderGraphLabel(tokens.join('\n'), { ...opts, orientation: 'horizontal' });
  }
  const { x = 0, y = 0, size = 3.5, color = "#000", anchor = "start", vAlign = "baseline", halo = true, upright = false, haloRatio } = opts;

  const lines = text.split("\n").map((l) => buildLine(l, size, color, upright, labelWeight(opts.weight ?? opts.fontWeight), opts.sourceHeight === true, opts.parenthesesAreUnits !== false));
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
  // 가림은 <b>글자 모양대로</b>만 한다(아래 applyHalo). 예전엔 줄 전체를 흰 사각형으로
  // 덮었는데, 글자 사이로 선이 비치는 문제를 잡으려다 라벨이 흰 블록을 깔고 앉은 꼴이
  // 됐다(2026-07-26 교사 지적: "얇은 영역으로 가리라고 했지 두껍게 가리라고 한 적 없다").
  // 글자 사이 틈은 halo 굵기를 조금 키우는 것으로 충분히 막힌다 — 캔버스의 텍스트 도구가
  // 쓰는 방식과 같아져 그래프 안팎의 라벨이 같은 모양으로 보인다.
  lines.forEach((ln, i) => {
    const dx = anchor === "end" ? -ln.width : anchor === "middle" ? -ln.width / 2 : 0;
    ln.g.setAttribute("transform", `translate(${x + dx}, ${firstBaseY + baseYs[i]})`);
    wrap.appendChild(ln.g);
  });
  if (opts.orientation === "rotate") wrap.setAttribute("transform", `rotate(-90 ${x} ${y})`);
  if (halo) applyGlyphHalo(wrap, size, haloRatio);
  return wrap;
}

// 라벨 블록의 대략 크기(배치 계산용). { w, ascent, descent, h }.
export function measureGraphLabel(source, size = 3.5, upright = false, weight = 400, sourceHeight = false, roles = {}) {
  const text = graphLabelUnitSource(source, roles.unit);
  if (text.trim() === "") return { w: 0, ascent: 0, descent: 0, h: 0 };
  const lines = text.split("\n").map((l) => buildLine(l, size, "#000", upright, labelWeight(weight), sourceHeight, roles.parenthesesAreUnits !== false));
  const w = Math.max(...lines.map((l) => l.width), 0);
  const gap = size * INTERLINE_GAP;
  let h = lines[0].ascent + lines[0].descent;
  for (let i = 1; i < lines.length; i++) h += gap + lines[i].ascent + lines[i].descent;
  return { w, ascent: lines[0].ascent, descent: lines[lines.length - 1].descent, h };
}
