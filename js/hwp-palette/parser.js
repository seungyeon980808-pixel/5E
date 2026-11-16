// HwpPalette parser port, AGPL-3.0. See assets/hwp-palette/NOTICE.md.
import { CATALOG } from "./catalog.js?v=1.7.0-four-session-integration";
const normalized = (text) => String(text || "").replace(/\r\n?/g, "\n");
const token = /^\\([^\\\r\n]+?)\\$/;
const table = /^표\s*(\d+)\s*[*xX×]\s*(\d+)$/;
const paraOnly = new Set([
  "가운데정렬",
  "왼쪽정렬",
  "양쪽정렬",
  "줄간격",
  "들여쓰기",
  "내어쓰기",
  "왼쪽여백",
  "오른쪽여백",
  "어절단위 줄바꿈",
  "자간 자동조절",
]);
export function parseQuestion(text) {
  const data = {
    num: "",
    stem: "",
    material: "",
    material_type: "basic",
    material_flag: false,
    question: "",
    bogi: [],
    choices: [],
    choices_type: "5",
  };
  let mode = null;
  for (const line of normalized(text).split("\n")) {
    const s = line.trim();
    if (!s) continue;
    let m;
    if ((m = /^(번호:|번 호:)\s*(.*)$/.exec(s))) {
      data.num = m[2];
      mode = null;
    } else if ((m = /^(발문:|문:|발 문:)\s*(.*)$/.exec(s))) {
      data.stem = m[2];
      mode = "stem";
    } else if (s.startsWith("실험자료:")) {
      data.material_type = "experiment";
      data.material = "";
      mode = "material";
    } else if (s.startsWith("사진자료:")) {
      data.material_type = "photo";
      data.material = "";
      mode = "material";
    } else if ((m = /^(자료:|자 료:)\s*(.*)$/.exec(s))) {
      data.material = m[2];
      data.material_type = "basic";
      data.material_flag = true;
      mode = "material";
    } else if ((m = /^(질문:|질 문:)\s*(.*)$/.exec(s))) {
      data.question = m[2];
      mode = "question";
    } else if (/^(보기:|보 기:)/.test(s) || s === "보기") {
      mode = "bogi";
    } else if ((m = /^(선지[135]:|[135]선지:|선지:|선 지:)/.exec(s))) {
      data.choices_type = m[1].match(/[135]/)?.[0] || "5";
      mode = "choices";
    } else if (mode === "bogi") {
      data.bogi.push(s[1] === ":" ? s.slice(2).trim() : s);
    } else if (mode === "choices") {
      data.choices.push(s.replace(/^[①-⑤]\s*/, ""));
    } else if (["stem", "material", "question"].includes(mode)) {
      data[mode] += (data[mode] ? (mode === "material" ? "\n" : " ") : "") + s;
    }
  }
  return data;
}
export const recognizedQuestion = (d) =>
  !!(
    d.stem ||
    d.material_flag ||
    ["photo", "experiment"].includes(d.material_type) ||
    d.question ||
    d.bogi.length ||
    d.choices.length
  );
export function styleFields(item = {}) {
  if (!item.actions?.length) return { ...item.fields };
  const out = {},
    keys = {
      굵게: "굵게",
      기울임: "기울임",
      밑줄: "밑줄",
      글씨체: "글꼴",
      글씨크기: "크기",
      자간: "자간",
      글자색: "글자색",
    };
  for (const a of item.actions)
    if (keys[a.func]) out[keys[a.func]] = a.value ?? true;
  return out;
}
export function resolveStyle(tok, lookup, warnings = []) {
  const t = tok.trim();
  if (!t) return null;
  if (["굵게", "기울임", "밑줄"].includes(t)) return { [t]: true };
  if (paraOnly.has(t)) {
    warnings.push(
      `'${t}'는 문단 전체에 걸리는 서식이라 줄 일부에는 쓸 수 없습니다 — 팔레트의 '서식 조합' 블럭을 쓰세요`,
    );
    return null;
  }
  const entry = lookup.get(t);
  if (entry?.[0] === "서식") return styleFields(entry[1]);
  let m;
  if ((m = /^(?:크기|글씨크기)?\s*(-?\d+(?:\.\d+)?)$/.exec(t)))
    return { 크기: Number(m[1]) };
  if ((m = /^자간\s*(-?\d+)$/.exec(t))) return { 자간: Number(m[1]) };
  if ((m = /^색\s*(.+)$/.exec(t))) {
    const names = {
        검정: "000000",
        빨강: "FF0000",
        파랑: "0000FF",
        초록: "008000",
        노랑: "FFFF00",
        회색: "808080",
        흰색: "FFFFFF",
      },
      h = names[m[1].trim()] || m[1].trim().replace(/^#/, "");
    if (/^[\da-f]{6}$/i.test(h))
      return {
        글자색:
          parseInt(h.slice(0, 2), 16) +
          (parseInt(h.slice(2, 4), 16) << 8) +
          (parseInt(h.slice(4, 6), 16) << 16),
      };
    warnings.push(
      `모르는 색입니다: '${m[1].trim()}' (쓸 수 있는 이름: 검정, 빨강, 파랑, 초록, 노랑, 회색, 흰색 또는 #RRGGBB)`,
    );
    return null;
  }
  if ((m = /^글꼴\s*(.+)$/.exec(t))) return { 글꼴: m[1].trim() };
  const fonts = CATALOG.fonts.filter((f) => f.startsWith(t));
  if (CATALOG.fonts.includes(t) || fonts.length === 1)
    return { 글꼴: CATALOG.fonts.includes(t) ? t : fonts[0] };
  warnings.push(
    `모르는 서식입니다: \\${t}  (등록한 서식 라벨이거나 굵게·기울임·밑줄·숫자·색·글꼴이어야 합니다)`,
  );
  return null;
}
export function buildSegments(text, lookup = new Map(), warnings = []) {
  function read(start, style = null, depth = 0, stop = false) {
    const segments = [];
    let buf = "",
      i = start;
    function flush() {
      if (buf) {
        segments.push({ text: buf, style: style ? { ...style } : null });
        buf = "";
      }
    }
    while (i < text.length) {
      if (text[i] === "\\") {
        if (text.startsWith("\\수식{", i)) {
          let n = i + 4,
            nest = 1;
          for (; n < text.length; n++) {
            if (text[n] === "{") nest++;
            else if (text[n] === "}" && !--nest) break;
          }
          flush();
          const source = text.slice(i + 4, n).trim();
          if (n === text.length) warnings.push("수식을 닫는 } 가 없습니다");
          if (!source) warnings.push("수식 원문이 비어 있습니다");
          segments.push({
            text: "",
            style: style ? { ...style } : null,
            formula: source,
          });
          i = Math.min(n + 1, text.length);
          continue;
        }
        const next = text[i + 1];
        if (next === "\\" || next === "}") {
          buf += next;
          i += 2;
          continue;
        }
        let j = i,
          toks = [];
        while (text[j] === "\\") {
          const m = /^\\([^\\{}\r\n]+)/.exec(text.slice(j));
          if (!m) break;
          toks.push(...m[1].split(",").map((x) => x.trim()));
          j += m[0].length;
        }
        if (toks.length && text[j] === "{") {
          if (depth > 8) warnings.push("서식이 너무 깊게 중첩됐습니다");
          else {
            const fields = { ...style };
            let valid = true;
            for (const t of toks) {
              const delta = resolveStyle(t, lookup, warnings);
              if (delta === null) {
                valid = false;
                break;
              }
              Object.assign(fields, delta);
            }
            if (valid) {
              flush();
              const sub = read(j + 1, fields, depth + 1, true);
              segments.push(...sub.segments);
              i = sub.end;
              continue;
            }
          }
        }
        const lab = /^\\([^\\\r\n]+?)\\/.exec(text.slice(i));
        if (lab) {
          const name = lab[1].trim(),
            entry = lookup.get(name);
          if (entry?.[0] === "문자") buf += entry[1].text;
          else if (entry?.[0] === "사진") {
            flush();
            segments.push({
              text: "",
              style: style ? { ...style } : null,
              image: entry[1].path || entry[1].id,
            });
          } else {
            if (["템플릿", "양식"].includes(entry?.[0]))
              warnings.push(
                `${entry[0]} 라벨은 한 줄에 단독으로 써주세요: \\${name}\\`,
              );
            else if (entry?.[0] === "서식")
              warnings.push(
                `서식은 적용할 내용이 필요합니다: \\${name}{내용} 처럼 써주세요`,
              );
            else
              warnings.push(
                `등록되지 않은 라벨: \\${name}\\ (라이브러리·내장 문자·사진 폴더 어디에도 없습니다)`,
              );
            buf += lab[0];
          }
          i += lab[0].length;
          continue;
        }
        buf += "\\";
        i++;
      } else if (text[i] === "}" && stop) {
        flush();
        return { segments, end: i + 1 };
      } else buf += text[i++];
    }
    if (stop) warnings.push("서식을 닫는 } 가 없습니다");
    flush();
    return { segments, end: i };
  }
  return read(0).segments.filter((s) => s.text || s.image || s.formula);
}
const rich = (segs) => segs.some((s) => s.style || s.image || s.formula);
export function buildLibraryPlan(text, lookup = new Map()) {
  const lines = normalized(text).split("\n"),
    warnings = [],
    ops = [];
  const slot = (raw) => {
    const segs = buildSegments(raw, lookup, warnings);
    return rich(segs) ? segs : segs.map((s) => s.text).join("");
  };
  const newInsert = (s) => {
    const m = token.exec(s);
    if (!m) return false;
    const e = lookup.get(m[1].trim());
    return !e || ["템플릿", "양식"].includes(e[0]);
  };
  function readRows(source, start, rows, cols) {
    const grid = [];
    let j = start;
    while (grid.length < rows && j < source.length) {
      const s = source[j];
      if (!s.trim()) {
        j++;
        continue;
      }
      if (newInsert(s.trim())) break;
      const parts = s.split(/(?<!&)&(?!&)/);
      if (parts.length > cols)
        warnings.push(
          `${grid.length + 1}번째 줄의 칸이 ${parts.length}개인데 표는 ${cols}칸입니다 — 넘치는 칸은 버립니다`,
        );
      grid.push(
        parts
          .slice(0, cols)
          .map((p) =>
            p.trim() === "-" ? null : slot(p.replaceAll("&&", "&")),
          ),
      );
      j++;
    }
    return { grid, end: j };
  }
  function readBlock(start) {
    let j = start,
      inner = [],
      closed = false;
    while (j < lines.length) {
      let s = lines[j].trim();
      if (j === start) s = s.slice(1);
      const escaped = s.endsWith("\\}") && !token.test(s.slice(0, -1).trim());
      const formulaOwn = /\\수식\{[^]*\}$/.test(s) && !s.endsWith("}}");
      if (s.endsWith("}") && !escaped && !formulaOwn) {
        s = s.slice(0, -1);
        closed = true;
      }
      inner.push(s);
      j++;
      if (closed) break;
    }
    if (!closed)
      warnings.push(
        "덩어리를 닫는 } 가 없습니다 — { 로 시작했으면 } 로 닫아주세요",
      );
    const body = [];
    for (let k = 0; k < inner.length; ) {
      const s = inner[k].trim();
      if (!s) {
        k++;
        continue;
      }
      const label = token.exec(s)?.[1],
        tm = label && !lookup.has(label) && table.exec(label);
      if (tm && +tm[1] >= 1 && +tm[1] <= 50 && +tm[2] >= 1 && +tm[2] <= 50) {
        const result = readRows(inner, k + 1, +tm[1], +tm[2]);
        body.push({
          kind: "table",
          rows: +tm[1],
          cols: +tm[2],
          grid: result.grid,
        });
        k = result.end;
      } else {
        if (tm)
          warnings.push(
            `표 크기가 범위를 벗어났습니다: ${+tm[1]}x${+tm[2]} (1~50 사이여야 합니다)`,
          );
        body.push(slot(inner[k++]));
      }
    }
    return { value: { kind: "multiline", lines: body }, end: j };
  }
  for (let i = 0; i < lines.length; ) {
    const s = lines[i].trim(),
      m = token.exec(s),
      label = m?.[1].trim(),
      entry = label && lookup.get(label);
    if (entry && ["템플릿", "양식"].includes(entry[0])) {
      const item = entry[1],
        fills = [];
      let j = i + 1;
      while (
        fills.length < (Number(item.slot_count) || 0) &&
        j < lines.length
      ) {
        const cand = lines[j].trim();
        if (!cand) {
          j++;
          continue;
        }
        if (newInsert(cand)) break;
        if (cand === "-") {
          fills.push(null);
          j++;
        } else if (cand.startsWith("{")) {
          const b = readBlock(j);
          fills.push(b.value);
          j = b.end;
        } else fills.push(slot(lines[j++]));
      }
      if (item._mix_items?.length) {
        let at = 0;
        for (const child of item._mix_items) {
          ops.push([
            "template",
            child,
            fills.slice(at, at + (+child.slot_count || 0)),
          ]);
          at += +child.slot_count || 0;
        }
      } else ops.push([entry[0] === "양식" ? "form" : "template", item, fills]);
      i = j;
      continue;
    }
    const tm = label && !entry && table.exec(label);
    if (tm) {
      const rows = +tm[1],
        cols = +tm[2];
      if (rows < 1 || rows > 50 || cols < 1 || cols > 50) {
        warnings.push(
          `표 크기가 범위를 벗어났습니다: ${rows}x${cols} (1~50 사이여야 합니다)`,
        );
        ops.push(["line", s]);
        i++;
        continue;
      }
      const r = readRows(lines, i + 1, rows, cols);
      ops.push(["table", rows, cols, r.grid]);
      i = r.end;
      continue;
    }
    const segs = buildSegments(lines[i++], lookup, warnings);
    ops.push(
      rich(segs)
        ? ["rich_line", segs]
        : ["line", segs.map((s) => s.text).join("")],
    );
  }
  return { ops, warnings };
}
export const splitSelectionUnits = (text) =>
  normalized(text)
    .split(/[\n\t]/)
    .filter((s) => s.trim());
export const formatChoice = (value) => {
  const s = value.trim();
  return /^[ㄱ-ㅎ,·、\s]+$/.test(s) && /[ㄱ-ㅎ]/.test(s)
    ? [...s].filter((c) => /[ㄱ-ㅎ]/.test(c)).join(", ")
    : s;
};
