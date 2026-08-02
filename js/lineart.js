/* ===== lineart.js — 컬러 SVG → 시험지용 흑백 선화 변환 =====
 *
 * 출처: _work/bio-assets/cleaner.html (11장에 실제로 돌려 눈으로 검증한 알고리즘).
 * 알고리즘 자체는 그대로 옮겼고, 앱에서 쓰기 위해 다음만 바꿨다.
 *   - fetch/쿼리스트링 입력 → 함수 인자(svgText, opts)
 *   - document.body 에 영구 부착 → 화면 밖 임시 컨테이너(작업 후 반드시 제거)
 *   - 선 굵기 비율 상수 → targetMm/lineMm 에서 역산
 *   - 결과를 문자열 + data URI 로 반환, 실패 시 예외 대신 null
 *
 * getBBox() 는 요소가 문서에 붙어 있어야 동작한다. 그래서 브라우저 전용 모듈이다.
 */

/* ===== 공개 규약 ===== */

export const LINEART_LEVELS = [
  { id: "L0", label: "전부", desc: "색만 벗김",       drop: false, dropLine: false, tiny: 0 },
  { id: "L1", label: "세밀", desc: "작은 조각 정리",   drop: true,  dropLine: false, tiny: 0.015 },
  { id: "L2", label: "표준", desc: "글자·지시선 제거", drop: true,  dropLine: true,  tiny: 0.035 },
  { id: "L3", label: "단순", desc: "큰 구조만",       drop: true,  dropLine: true,  tiny: 0.07  },
];

/* ===== 상수 (cleaner.html 그대로) ===== */

const DRAW = "path,circle,ellipse,rect,polygon,polyline,line";

const DROP_TAGS = [
  "text", "flowRoot", "switch", "tspan", "textPath", "linearGradient",
  "radialGradient", "filter", "pattern", "metadata", "title", "desc",
  "style", "image", "mask",
];

const PAINT = [
  "fill", "stroke", "style", "opacity", "fill-opacity", "stroke-opacity", "filter",
  "stroke-width", "stroke-dasharray", "stroke-miterlimit", "fill-rule", "color",
  "paint-order", "mask",
];

const SVG_NS = "http://www.w3.org/2000/svg";

/* 캔버스를 거의 다 덮는 배경 사각형 판정 기준 */
const BG_COVER = 0.95;

/* ===== 캐시 =====
 * 키: level|fill|targetMm|lineMm|svgText (선 굵기가 mm 인자에 걸리므로 함께 넣는다)
 * 최대 40개, 넘치면 가장 오래된 것부터 버린다(Map 은 삽입 순서를 지킨다).
 * 히트 시 매번 새 객체로 복사해 돌려준다 — 호출자가 결과를 만져도 캐시가 오염되지 않게.
 */
const CACHE = new Map();
const CACHE_MAX = 40;

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (!hit) return null;
  return { ...hit, viewBox: hit.viewBox.slice() };
}

function cacheSet(key, value) {
  CACHE.set(key, value);
  while (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  return { ...value, viewBox: value.viewBox.slice() };
}

/* ===== 유틸 ===== */

/* level 은 보통 "L2" 같은 이름이지만, 고급 기능에서 세부값을 직접 줄 때는
   { id, drop, dropLine, tiny } 객체를 그대로 넘긴다. 이름표만 다를 뿐 쓰임은 같다. */
function levelOf(id) {
  if (id && typeof id === "object") {
    const base = LINEART_LEVELS.find((l) => l.id === id.id) || LINEART_LEVELS[2];
    return { ...base, ...id, id: id.id || "custom" };
  }
  return LINEART_LEVELS.find((l) => l.id === id) || LINEART_LEVELS[2];
}

/* 한글이 섞여도 깨지지 않는 base64 (btoa 는 라틴1만 받는다) */
function toDataUri(svg) {
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

function safeBBox(el) {
  try { return el.getBBox(); } catch (e) { return null; }
}

/* ===== 본체 =====
 * svgText: 원본 SVG 문자열
 * opts: { level:"L2", fill:"none"|"white", targetMm:45, lineMm:0.35 }
 * 반환: { svg, dataUri, kept, viewBox:[x,y,w,h], strokeWidth } · 실패 시 null
 */
export function toLineArt(svgText, opts = {}) {
  if (typeof svgText !== "string" || !svgText.trim()) return null;

  const o = opts || {};
  const lv = levelOf(o.level);
  const fill = o.fill === "none" ? "none" : "white";
  const targetMm = Number(o.targetMm) > 0 ? Number(o.targetMm) : 45;
  const lineMm = Number(o.lineMm) > 0 ? Number(o.lineMm) : 0.35;

  // 고급 기능에서 세부값을 직접 주면 id 가 전부 "custom" 이라, 이름만으로 키를 만들면
  // 값을 바꿔도 캐시가 옛 결과를 돌려준다. 실제로 결과를 가르는 값을 전부 넣는다.
  const key = `${lv.id}|${lv.drop}|${lv.dropLine}|${lv.tiny}|${fill}|${targetMm}|${lineMm}|${svgText}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let host = null;
  try {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const root = doc.documentElement;
    if (!root || root.localName !== "svg") return null;

    const svg = document.importNode(root, true);
    svg.removeAttribute("width");
    svg.removeAttribute("height");

    /* getBBox 는 문서에 붙어 있어야 동작한다 → 화면 밖 임시 컨테이너 */
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none";
    host.appendChild(svg);
    document.body.appendChild(host);

    /* --- viewBox 보정 ---
     * viewBox 가 없는 SVG 가 흔하다(width/height 만 있는 옛 파일). 그대로 두고 width 를
     * 100% 로 바꾸면 좌표계가 사라져 그림이 통째로 안 보인다 — 11장 중 5장이 그랬다.
     * 없으면 width/height 에서, 그것도 없으면 내용물의 실제 bbox 에서 만들어 준다. */
    let vb = (svg.getAttribute("viewBox") || "")
      .trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (vb.length !== 4 || !(vb[2] > 0) || !(vb[3] > 0) || vb.some((n) => !isFinite(n))) {
      const num = (v) => parseFloat(String(v || "").replace(/[^\d.\-]/g, ""));
      const w = num(root.getAttribute("width"));
      const h = num(root.getAttribute("height"));
      if (!(w > 0) || !(h > 0)) {
        const b = safeBBox(svg);
        vb = b ? [b.x, b.y, b.width || 100, b.height || 100] : [0, 0, 100, 100];
      } else {
        vb = [0, 0, w, h];
      }
      svg.setAttribute("viewBox", vb.join(" "));
    }
    const W = vb[2], H = vb[3];

    /* 선 굵기: 이 그림을 targetMm 폭으로 놓았을 때 lineMm 로 보이도록 역산 */
    const sw = W * (lineMm / targetMm);

    /* --- 색·글자·장식 요소 제거 --- */
    for (const t of DROP_TAGS) svg.querySelectorAll(t).forEach((el) => el.remove());

    /* 글자(윤곽선으로 변환된 것) 골라내기 — 작은 것 중 path/polygon 만.
     * 리보솜 점 같은 진짜 작은 구조는 circle/ellipse 라서 살아남는다. */
    if (lv.drop && lv.tiny > 0) {
      for (const el of [...svg.querySelectorAll("path,polygon")]) {
        const b = safeBBox(el);
        if (!b) continue;
        if (b.width / W < lv.tiny && b.height / H < lv.tiny) el.remove();
      }
    }

    /* 지시선 */
    if (lv.dropLine) svg.querySelectorAll("line,polyline").forEach((el) => el.remove());

    /* 캔버스를 거의 다 덮는 배경 사각형 제거 — 선화에서는 그림 둘레에 쓸데없는 테두리로 남는다 */
    for (const el of [...svg.querySelectorAll("rect,path")]) {
      const b = safeBBox(el);
      if (!b) continue;
      if (b.width / W > BG_COVER && b.height / H > BG_COVER) el.remove();
    }

    /* 빈 그룹 정리 */
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of [...svg.querySelectorAll("g")]) {
        if (!g.children.length) { g.remove(); changed = true; }
      }
    }

    /* --- 흑백 선화로 다시 칠하기 --- */
    for (const el of svg.querySelectorAll("*")) {
      for (const a of PAINT) el.removeAttribute(a);
    }
    for (const el of svg.querySelectorAll(DRAW)) {
      el.setAttribute("fill", fill === "none" ? "none" : "#ffffff");
      el.setAttribute("stroke", "#000000");
      el.setAttribute("stroke-width", sw.toFixed(3));
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("stroke-linecap", "round");
    }

    const kept = svg.querySelectorAll(DRAW).length;

    /* --- 상자를 실제 그림에 맞춰 줄인다 ---
     * 원본 SVG 는 그림 둘레에 빈 여백을 크게 두는 경우가 흔하다(실측: 단진자 도해는
     * 상자의 46%만 그림이고 가로 38%·세로 26%가 여백이었다). 그대로 두면 캔버스에서
     * 선택 상자가 그림보다 훨씬 크게 잡혀 배치가 어렵다.
     * 지우고 남은 것들의 실제 bbox 로 viewBox 를 다시 잡는다. 선 굵기의 절반을 여유로
     * 두어야 테두리가 잘리지 않는다(원본 여백이 부족해 잉크가 살짝 넘치는 파일도 있다). */
    if (kept > 0) {
      let ink = null;
      try { ink = svg.getBBox(); } catch (e) { ink = null; }
      if (ink && ink.width > 0 && ink.height > 0) {
        const pad = sw / 2;
        const nx = ink.x - pad, ny = ink.y - pad;
        const nw = ink.width + pad * 2, nh = ink.height + pad * 2;
        // 원본과 거의 같으면(여백이 3% 미만) 굳이 바꾸지 않는다 — 좌표가 흔들릴 이유가 없다
        const tighter = nw < vb[2] * 0.97 || nh < vb[3] * 0.97 || nx > vb[0] + 0.5 || ny > vb[1] + 0.5;
        if (tighter && Number.isFinite(nx) && Number.isFinite(ny)) {
          vb[0] = nx; vb[1] = ny; vb[2] = nw; vb[3] = nh;
          svg.setAttribute("viewBox", vb.join(" "));
        }
      }
    }

    /* xmlns 가 없으면 data URI 로 못 쓴다(실제로 겪은 함정) */
    if (!svg.getAttribute("xmlns")) svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("data-kept", String(kept));

    const out = new XMLSerializer().serializeToString(svg);
    return cacheSet(key, {
      svg: out,
      dataUri: toDataUri(out),
      kept,
      viewBox: [vb[0], vb[1], vb[2], vb[3]],
      strokeWidth: sw,
    });
  } catch (e) {
    return null;
  } finally {
    if (host && host.parentNode) host.parentNode.removeChild(host);
  }
}

/* 캐시 비우기 (디버깅·메모리 회수용) */
export function clearLineArtCache() {
  CACHE.clear();
}
