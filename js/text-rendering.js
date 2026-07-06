import {
  ROMAN_NUMERAL_FONT_FAMILY,
  splitRomanRuns,
  isEquationFontFamily,
} from "./state.js?v=0.51.1";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ----- 수식 글꼴 숫자 정자화 -----
 * LaTeX 수식 관례: 변수(영문자)는 이탤릭, 숫자는 정자(upright). 수식 글꼴(Latin
 * Modern)의 이탤릭은 숫자가 필기체 oldstyle로 나오므로, "이탤릭 수식 글꼴" 텍스트에
 * 한해 숫자 런만 font-style:normal 로 되돌린다. 글꼴 자체(Latin Modern)는 상속으로
 * 유지되어 정자 숫자 글리프가 쓰인다. 다른 글꼴/정체 텍스트는 건드리지 않는다. */
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

function wantsUprightDigits(fontFamily, fontStyle) {
  return fontStyle === "italic" && isEquationFontFamily(fontFamily);
}

// "123", "9.8", "1,000" 같은 숫자 런과 그 사이 텍스트를 분리한다.
function splitNumberRuns(str) {
  const runs = [];
  let last = 0, m;
  NUMBER_RE.lastIndex = 0;
  while ((m = NUMBER_RE.exec(str))) {
    if (m.index > last) runs.push({ text: str.slice(last, m.index), digit: false });
    runs.push({ text: m[0], digit: true });
    last = m.index + m[0].length;
  }
  if (last < str.length) runs.push({ text: str.slice(last), digit: false });
  return runs;
}

function applyRomanRunStyle(el) {
  if (el.namespaceURI === SVG_NS) {
    el.setAttribute("font-family", ROMAN_NUMERAL_FONT_FAMILY);
    el.setAttribute("font-style", "normal");
    el.setAttribute("font-weight", "normal");
    el.setAttribute("letter-spacing", "normal");
    return;
  }
  el.style.fontFamily = ROMAN_NUMERAL_FONT_FAMILY;
  el.style.fontStyle = "normal";
  el.style.fontWeight = "normal";
  el.style.letterSpacing = "normal";
}

export function fillSvgTextWithRomanRuns(parent, str) {
  const s = String(str ?? "");
  const runs = splitRomanRuns(s);
  const upright = wantsUprightDigits(
    parent.getAttribute("font-family"), parent.getAttribute("font-style")) && /\d/.test(s);
  if (!runs.some((r) => r.roman) && !upright) {
    parent.textContent = s;
    return;
  }
  for (const run of runs) {
    if (run.roman) {
      const ts = document.createElementNS(SVG_NS, "tspan");
      applyRomanRunStyle(ts);
      ts.textContent = run.text;
      parent.appendChild(ts);
    } else if (upright) {
      for (const sub of splitNumberRuns(run.text)) {
        if (sub.digit) {
          const ts = document.createElementNS(SVG_NS, "tspan");
          ts.setAttribute("font-style", "normal");
          ts.textContent = sub.text;
          parent.appendChild(ts);
        } else {
          parent.appendChild(document.createTextNode(sub.text));
        }
      }
    } else {
      parent.appendChild(document.createTextNode(run.text));
    }
  }
}

export function fillHtmlTextWithRomanRuns(parent, str) {
  const s = String(str ?? "");
  const runs = splitRomanRuns(s);
  const upright = wantsUprightDigits(
    parent.style.fontFamily, parent.style.fontStyle) && /\d/.test(s);
  if (!runs.some((r) => r.roman) && !upright) {
    parent.textContent = s;
    return;
  }
  for (const run of runs) {
    if (run.roman) {
      const span = document.createElement("span");
      span.className = "roman-numeral-run";
      applyRomanRunStyle(span);
      span.textContent = run.text;
      parent.appendChild(span);
    } else if (upright) {
      for (const sub of splitNumberRuns(run.text)) {
        if (sub.digit) {
          const span = document.createElement("span");
          span.style.fontStyle = "normal";
          span.textContent = sub.text;
          parent.appendChild(span);
        } else {
          parent.appendChild(document.createTextNode(sub.text));
        }
      }
    } else {
      parent.appendChild(document.createTextNode(run.text));
    }
  }
}
