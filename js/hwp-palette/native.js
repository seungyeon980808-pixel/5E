// Native RHWP execution of HwpPalette operations. AGPL-3.0.
import { CATALOG } from "./catalog.js";
import { physicalImageSize, convertExamImage } from "./image.js";
import {
  parseQuestion,
  recognizedQuestion,
  buildSegments,
  buildLibraryPlan,
  formatChoice,
} from "./parser.js";
import {
  libraryLookup,
  itemBytes,
  base64ToBytes,
  clone,
  styleActions,
  profileSpec,
} from "./model.js";
import { zipSync, unzipSync } from "../../vendor/fflate/index.js";
import { xmlDocument } from "./workbook.js";
import {
  inSubdocument,
  stageSubdocument,
  stageDocument,
  detachedDocument,
  installDocumentHistory,
  REPLACE_DETACHED,
} from "./subdocuments.js";
import { importHwpxParagraphs } from "./hwpx-import.js";
export const mm = (value) => Math.round((Number(value) * 7200) / 25.4);
const chars = (value) => [...String(value)].length;
export function read(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
export function documentText(d) {
  const raw = d.getTextFileText(),
    value = read(raw);
  return typeof value === "string" ? value : String(raw);
}
export function checked(value) {
  const r = read(value);
  if (r?.ok === false || r?.error)
    throw new Error(r.error || "한글 문서 작업을 완료하지 못했습니다.");
  return r;
}
const body = (sec, para, offset = 0) => ({
  sectionIndex: sec,
  paragraphIndex: para,
  charOffset: offset,
});
const pathOf = (p) => p.cellPath || [];
const parentOf = (p) => p.parentParaIndex ?? p.paragraphIndex;
const pathJSON = (p) => JSON.stringify(pathOf(p));
const inCell = (p) => !!pathOf(p).length;
function cellWithPara(p, index) {
  const out = clone(p);
  out.cellPath.at(-1).cellParaIndex = index;
  out.paragraphIndex = index;
  out.charOffset = 0;
  return out;
}
function paragraphNumber(p) {
  return inCell(p) ? p.cellPath.at(-1).cellParaIndex : p.paragraphIndex;
}
function paragraphAt(p, index) {
  return inCell(p)
    ? cellWithPara(p, index)
    : { ...clone(p), paragraphIndex: index, charOffset: 0 };
}
function moveCursor(input, p) {
  if (p.note) {
    const c = input.cursor;
    c.exitHeaderFooterMode?.();
    if (
      !c.isInFootnote?.() ||
      c.fnSectionIdx !== p.sectionIndex ||
      c.fnParaIdx !== p.note.parentParaIndex ||
      c.fnControlIdx !== p.note.controlIndex
    )
      c.enterFootnoteMode(
        p.sectionIndex,
        p.note.parentParaIndex,
        p.note.controlIndex,
        0,
        0,
      );
    c.setFnCursorPosition(
      p.cellPath?.length ? p.parentParaIndex : p.paragraphIndex,
      p.charOffset,
    );
  } else if (p.hf) {
    const c = input.cursor;
    c.exitFootnoteMode?.();
    if (
      !c.isInHeaderFooter?.() ||
      c.hfSectionIdx !== p.sectionIndex ||
      c.hfApplyTo !== p.hf.applyTo ||
      (c.headerFooterMode === "header") !== p.hf.isHeader
    )
      c.enterHeaderFooterMode(p.hf.isHeader, p.sectionIndex, p.hf.applyTo);
    input.cursor.setHfCursorPosition(p.paragraphIndex, p.charOffset);
  } else {
    input.cursor.exitHeaderFooterMode?.();
    input.cursor.exitFootnoteMode?.();
    input.cursor.moveTo(p);
  }
}
function sameContainer(a, b) {
  return (
    a.sectionIndex === b.sectionIndex &&
    JSON.stringify(a.hf || null) === JSON.stringify(b.hf || null) &&
    JSON.stringify(a.note || null) === JSON.stringify(b.note || null) &&
    ((!inCell(a) && !inCell(b)) ||
      (inCell(a) &&
        inCell(b) &&
        parentOf(a) === parentOf(b) &&
        JSON.stringify(pathOf(a).map((s) => [s.controlIndex, s.cellIndex])) ===
          JSON.stringify(pathOf(b).map((s) => [s.controlIndex, s.cellIndex]))))
  );
}
export function lengthAt(d, p) {
  if (p.note || (p.hf && inCell(p))) {
    const stage = stageSubdocument(d, p);
    try {
      return lengthAt(stage.document, stage.map(p));
    } finally {
      stage.document.free();
    }
  }
  if (p.hf)
    return Number(
      read(
        d.getHeaderFooterParaInfo(
          p.sectionIndex,
          p.hf.isHeader,
          p.hf.applyTo,
          p.paragraphIndex,
        ),
      )?.charCount || 0,
    );
  return inCell(p)
    ? d.getCellParagraphLengthByPath(p.sectionIndex, parentOf(p), pathJSON(p))
    : d.getParagraphLength(p.sectionIndex, p.paragraphIndex);
}
export function textAt(d, p) {
  if (p.note || (p.hf && inCell(p))) {
    const stage = stageSubdocument(d, p);
    try {
      return textAt(stage.document, stage.map(p));
    } finally {
      stage.document.free();
    }
  }
  const len = lengthAt(d, p);
  if (p.hf) {
    const files = unzipSync(d.exportHwpx()),
      xml = xmlDocument(files[`Contents/section${p.sectionIndex}.xml`]);
    const kind = p.hf.isHeader ? "header" : "footer",
      apply = ["BOTH", "EVEN", "ODD"][p.hf.applyTo];
    const control = [...xml.getElementsByTagNameNS("*", kind)].find(
      (n) => n.getAttribute("applyPageType") === apply,
    );
    const sub = [...(control?.children || [])].find(
      (n) => n.localName === "subList",
    );
    const para = [...(sub?.children || [])].filter((n) => n.localName === "p")[
      p.paragraphIndex
    ];
    return xmlParagraphText(para);
  }
  return String(
    inCell(p)
      ? d.getTextInCellByPath(p.sectionIndex, parentOf(p), pathJSON(p), 0, len)
      : d.getTextRange(p.sectionIndex, p.paragraphIndex, 0, len),
  );
}
function xmlParagraphText(node) {
  return [...(node?.children || [])]
    .filter((n) => n.localName === "run")
    .flatMap((run) =>
      [...run.children]
        .filter((n) => n.localName === "t")
        .map((t) =>
          [...t.childNodes]
            .map((n) =>
              n.nodeType === 3
                ? n.textContent
                : n.localName === "tab"
                  ? "\t"
                  : n.localName === "lineBreak"
                    ? "\n"
                    : n.textContent,
            )
            .join(""),
        ),
    )
    .join("");
}
export function insertText(d, p, text) {
  if (!text) return { ...p };
  if (p.hf)
    checked(
      d.insertTextInHeaderFooter(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        p.charOffset,
        text,
      ),
    );
  else if (inCell(p))
    checked(
      d.insertTextInCellByPath(
        p.sectionIndex,
        parentOf(p),
        pathJSON(p),
        p.charOffset,
        text,
      ),
    );
  else
    checked(d.insertText(p.sectionIndex, p.paragraphIndex, p.charOffset, text));
  return { ...p, charOffset: p.charOffset + chars(text) };
}
function deleteText(d, p, count) {
  if (!count) return;
  if (p.hf)
    checked(
      d.deleteTextInHeaderFooter(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        p.charOffset,
        count,
      ),
    );
  else if (inCell(p))
    checked(
      d.deleteTextInCellByPath(
        p.sectionIndex,
        parentOf(p),
        pathJSON(p),
        p.charOffset,
        count,
      ),
    );
  else
    checked(
      d.deleteText(p.sectionIndex, p.paragraphIndex, p.charOffset, count),
    );
}
function charProps(d, p) {
  if (p.hf)
    return read(
      d.getCharPropertiesInHeaderFooter(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        p.charOffset,
      ),
    );
  return read(
    inCell(p)
      ? d.getCellCharPropertiesAtByPath(
          p.sectionIndex,
          parentOf(p),
          pathJSON(p),
          p.charOffset,
        )
      : d.getCharPropertiesAt(p.sectionIndex, p.paragraphIndex, p.charOffset),
  );
}
function paraProps(d, p) {
  if (!inCell(p))
    return read(d.getParaPropertiesAt(p.sectionIndex, p.paragraphIndex));
  if (pathOf(p).length === 1) {
    const c = pathOf(p)[0];
    return read(
      d.getCellParaPropertiesAt(
        p.sectionIndex,
        parentOf(p),
        c.controlIndex,
        c.cellIndex,
        c.cellParaIndex,
      ),
    );
  }
  const record = paragraphRecords(d).find(
    (r) => positionKey(r.target) === positionKey(p),
  );
  const files = unzipSync(d.exportHwpx()),
    header = xmlDocument(files["Contents/header.xml"]);
  const style = [...header.getElementsByTagNameNS("*", "paraPr")].find(
    (n) => n.getAttribute("id") === record?.node.getAttribute("paraPrIDRef"),
  );
  if (!style) throw new Error("중첩 문단의 서식을 찾지 못했습니다.");
  const defaults = style.getElementsByTagNameNS("*", "default")[0],
    scope = defaults || style;
  const element = (name) =>
    scope.getElementsByTagNameNS("*", name)[0] ||
    style.getElementsByTagNameNS("*", name)[0];
  const value = (name) =>
    Number(element(name)?.getAttribute("value") || 0) * (defaults ? 1 : 2);
  return {
    alignment: style
      .getElementsByTagNameNS("*", "align")[0]
      ?.getAttribute("horizontal")
      .toLowerCase(),
    indent: value("intent"),
    marginLeft: value("left"),
    marginRight: value("right"),
    lineSpacing: Number(element("lineSpacing")?.getAttribute("value") || 100),
    koreanBreakUnit:
      style
        .getElementsByTagNameNS("*", "breakSetting")[0]
        ?.getAttribute("breakNonLatinWord") === "BREAK_WORD"
        ? 0
        : 1,
  };
}
function charFormat(d, p, start, end, props) {
  if (!Object.keys(props).length) return;
  const json = JSON.stringify(props);
  if (p.hf)
    checked(
      d.applyCharFormatInHeaderFooter(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        start,
        p.paragraphIndex,
        end,
        json,
      ),
    );
  else if (inCell(p))
    checked(
      d.applyCharFormatInCellByPath(
        p.sectionIndex,
        parentOf(p),
        pathJSON(p),
        start,
        end,
        json,
      ),
    );
  else
    checked(
      d.applyCharFormat(p.sectionIndex, p.paragraphIndex, start, end, json),
    );
}
function paraFormat(d, p, props) {
  if (!Object.keys(props).length) return;
  const translated = { ...props };
  for (const key of [
    "indent",
    "marginLeft",
    "marginRight",
    "spacingBefore",
    "spacingAfter",
  ])
    if (key in translated) translated[key] = Math.round(translated[key] * 2);
  const json = JSON.stringify(translated);
  if (p.hf)
    checked(
      d.applyParaFormatInHf(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        json,
      ),
    );
  else if (inCell(p)) {
    if (pathOf(p).length !== 1 || props.condense !== undefined)
      return rewriteParentParagraph(d, p, props);
    const c = p.cellPath[0];
    checked(
      d.applyParaFormatInCell(
        p.sectionIndex,
        parentOf(p),
        c.controlIndex,
        c.cellIndex,
        c.cellParaIndex,
        json,
      ),
    );
  } else if (props.condense !== undefined) rewriteParentParagraph(d, p, props);
  else checked(d.applyParaFormat(p.sectionIndex, p.paragraphIndex, json));
}
function nextLine(d, p) {
  if (p.hf) {
    checked(
      d.splitParagraphInHeaderFooter(
        p.sectionIndex,
        p.hf.isHeader,
        p.hf.applyTo,
        p.paragraphIndex,
        p.charOffset,
      ),
    );
    return { ...p, paragraphIndex: p.paragraphIndex + 1, charOffset: 0 };
  }
  if (inCell(p)) {
    checked(
      d.splitParagraphInCellByPath(
        p.sectionIndex,
        parentOf(p),
        pathJSON(p),
        p.charOffset,
      ),
    );
    return cellWithPara(p, paragraphNumber(p) + 1);
  }
  if (p.charOffset === lengthAt(d, p)) {
    checked(d.insertParagraph(p.sectionIndex, p.paragraphIndex + 1));
    return body(p.sectionIndex, p.paragraphIndex + 1);
  }
  checked(d.splitParagraph(p.sectionIndex, p.paragraphIndex, p.charOffset));
  return body(p.sectionIndex, p.paragraphIndex + 1);
}
const color = (value) =>
  typeof value === "number"
    ? `#${[value & 255, (value >> 8) & 255, (value >> 16) & 255].map((x) => x.toString(16).padStart(2, "0")).join("")}`
    : value;
export function nativeCharFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) {
    if (k === "굵게") out.bold = !!v;
    else if (k === "기울임") out.italic = !!v;
    else if (k === "밑줄") out.underline = !!v;
    else if (k === "글꼴") out.fontFamily = String(v);
    else if (k === "크기") {
      if (!Number.isFinite(+v) || +v < 1 || +v > 200)
        throw new Error("글씨 크기는 1~200 pt로 입력해주세요.");
      out.fontSize = Math.round(+v * 100);
    } else if (k === "자간") out.spacings = Array(7).fill(Number(v));
    else if (k === "글자색") out.textColor = color(v);
  }
  return out;
}
function controlsFromBody(d, p, make) {
  const sec = p.sectionIndex,
    start = d.getParagraphCount(sec);
  checked(d.insertParagraph(sec, start));
  let result;
  try {
    const c = make(body(sec, start));
    checked(d.copyControl(sec, c.paraIdx, "[]", c.controlIdx));
    result = checked(
      d.pasteInternalInCellByPath(sec, parentOf(p), pathJSON(p), p.charOffset),
    );
  } finally {
    for (let index = d.getParagraphCount(sec) - 1; index >= start; index--)
      checked(d.deleteParagraph(sec, index));
  }
  return result;
}
function formulaScript(source) {
  return source
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "{$1} over {$2}")
    .replace(/\\(?:Delta|delta)\b/g, "Δ")
    .replace(/\\(?:times)\b/g, " TIMES ")
    .replace(/\\(?:cdot)\b/g, " CDOT ")
    .replace(/\\(?:leq)\b/g, " LEQ ")
    .replace(/\\(?:geq)\b/g, " GEQ ")
    .replace(
      /\\(?:alpha|beta|gamma|theta|pi|mu|rho|sigma|lambda|omega)\b/g,
      (m) => m.slice(1),
    );
}
export function insertSegments(d, p, segments, assets = new Map()) {
  if (p.hf && segments.some((s) => s.image || s.formula))
    throw new Error(
      "머리말·꼬리말의 개체는 분리된 편집 문서를 통해 삽입해야 합니다.",
    );
  // Native controls occupy stream positions. Place one explicit space per
  // control, then insert right-to-left so text offsets stay stable.
  const beforeLength = lengthAt(d, p);
  let text = "",
    offset = p.charOffset;
  const spans = [],
    objects = [];
  for (const seg of segments) {
    const value = seg.image || seg.formula ? " " : seg.text || "";
    spans.push({ start: offset, end: offset + chars(value), style: seg.style });
    if (seg.image || seg.formula) objects.push({ offset, seg });
    text += value;
    offset += chars(value);
  }
  const end = insertText(d, p, text);
  for (const span of spans)
    if (span.style)
      charFormat(d, p, span.start, span.end, nativeCharFields(span.style));
  for (const { offset, seg } of objects.reverse()) {
    if (seg.image) {
      const a = assets.get(seg.image);
      if (!a) throw new Error(`그림을 찾지 못했습니다: ${seg.image}`);
      const page = read(d.getPageDef(p.sectionIndex)),
        columns = read(d.getColumnDef(p.sectionIndex)),
        count = columns.columnCount || 1,
        gap = columns.spacing || 0,
        bodyWidth =
          (page.width -
            page.marginLeft -
            page.marginRight -
            (count - 1) * gap) /
          count;
      let limit = bodyWidth;
      if (inCell(p)) {
        const cell = read(
          d.getCellPropertiesByPath(p.sectionIndex, parentOf(p), pathJSON(p)),
        );
        limit = cell.width - (cell.paddingLeft || 0) - (cell.paddingRight || 0);
      }
      const width = Math.max(1, Math.min(mm(a.widthMm), limit || bodyWidth)),
        height = Math.round((width * a.heightMm) / a.widthMm);
      const make = (at) => {
        const inserted = checked(
          d.insertPicture(
            at.sectionIndex,
            at.paragraphIndex,
            at.charOffset,
            "[]",
            a.bytes,
            width,
            height,
            a.width,
            a.height,
            a.extension || "png",
            a.name || seg.image,
          ),
        );
        // Palette images belong to the text/cell at the insertion point. The
        // native default is a floating picture at paper (0,0), which is clipped
        // out of header/footer bands and ignores the selected cell.
        const pictureIndex = inserted.controlIdx ?? inserted.controlIndex;
        const layout = JSON.stringify({
          treatAsChar: true,
          textWrap: "TopAndBottom",
          vertRelTo: "Para",
          horzRelTo: "Para",
          vertOffset: 0,
          horzOffset: 0,
        });
        checked(
          d.setPictureProperties(
            at.sectionIndex,
            inserted.paraIdx ?? at.paragraphIndex,
            pictureIndex,
            layout,
          ),
        );
        return inserted;
      };
      // The native cell-path picture API inserts a floating table sibling. Use
      // its control clipboard so the picture really belongs to this cell.
      if (inCell(p)) controlsFromBody(d, { ...p, charOffset: offset }, make);
      else make({ ...p, charOffset: offset });
    } else {
      if (!seg.formula.trim()) continue;
      const size =
        nativeCharFields(seg.style).fontSize ||
        charProps(d, p)?.fontSize ||
        1000;
      if (inCell(p))
        controlsFromBody(d, { ...p, charOffset: offset }, (at) =>
          checked(
            d.insertEquation(
              at.sectionIndex,
              at.paragraphIndex,
              0,
              formulaScript(seg.formula),
              size,
              0,
            ),
          ),
        );
      else
        checked(
          d.insertEquation(
            p.sectionIndex,
            p.paragraphIndex,
            offset,
            formulaScript(seg.formula),
            size,
            0,
          ),
        );
    }
  }
  return objects.length
    ? { ...end, charOffset: p.charOffset + lengthAt(d, p) - beforeLength }
    : end;
}
function makeTable(
  d,
  p,
  rows,
  cols,
  { width = mm(93.99), heights = null, border = "Solid", margins = null } = {},
) {
  let result;
  const create = (at) =>
    checked(
      d.createTableEx(
        JSON.stringify({
          sectionIdx: at.sectionIndex,
          paraIdx: at.paragraphIndex,
          charOffset: at.charOffset,
          rowCount: rows,
          colCount: cols,
          treatAsChar: true,
          colWidths: Array(cols).fill(Math.floor(width / cols)),
          ...(heights ? { rowHeights: heights } : {}),
        }),
      ),
    );
  const configure = (t) => {
    const line = {
      type: { None: 0, Solid: 1, Dash: 2, Double: 7 }[border] ?? 1,
      width: 1,
      color: "#000000",
    };
    for (let cell = 0; cell < rows * cols; cell++)
      checked(
        d.setCellProperties(
          p.sectionIndex,
          t.paraIdx,
          t.controlIdx,
          cell,
          JSON.stringify({
            width: Math.floor(width / cols),
            ...(heights ? { height: heights[Math.floor(cell / cols)] } : {}),
            borderLeft: line,
            borderRight: line,
            borderTop: line,
            borderBottom: line,
            ...(margins
              ? {
                  paddingLeft: mm(margins.left),
                  paddingRight: mm(margins.right),
                  paddingTop: mm(margins.top),
                  paddingBottom: mm(margins.bottom),
                  applyInnerMargin: true,
                }
              : {}),
          }),
        ),
      );
  };
  if (p.hf)
    throw new Error(
      "머리말·꼬리말의 표는 분리된 편집 문서를 통해 삽입해야 합니다.",
    );
  if (inCell(p)) {
    const sec = p.sectionIndex,
      start = d.getParagraphCount(sec);
    checked(d.insertParagraph(sec, start));
    try {
      const t = create(body(sec, start));
      configure(t);
      checked(d.copyControl(sec, t.paraIdx, "[]", t.controlIdx));
      result = checked(
        d.pasteInternalInCellByPath(
          sec,
          parentOf(p),
          pathJSON(p),
          p.charOffset,
        ),
      );
    } finally {
      for (let i = d.getParagraphCount(sec) - 1; i >= start; i--)
        checked(d.deleteParagraph(sec, i));
    }
    const info = read(d.getCellInfoByPath(sec, parentOf(p), pathJSON(p)));
    const index = result.controlIdx ?? result.controlIndex ?? 0;
    return {
      sec,
      para: parentOf(p),
      control: index,
      path: pathOf(p),
      after: p,
      nested: true,
    };
  }
  result = create(p);
  checked(
    d.setTableProperties(
      p.sectionIndex,
      result.paraIdx,
      result.controlIdx,
      JSON.stringify({ tableWidth: width, treatAsChar: true, pageBreak: 0 }),
    ),
  );
  configure(result);
  let after = body(p.sectionIndex, result.paraIdx + 1);
  if (after.paragraphIndex >= d.getParagraphCount(p.sectionIndex))
    checked(d.insertParagraph(p.sectionIndex, after.paragraphIndex));
  return {
    sec: p.sectionIndex,
    para: result.paraIdx,
    control: result.controlIdx,
    path: [],
    after,
  };
}
const cellPosition = (t, cell) => ({
  sectionIndex: t.sec,
  parentParaIndex: t.para,
  paragraphIndex: 0,
  charOffset: 0,
  cellPath: [
    ...clone(t.path),
    { controlIndex: t.control, cellIndex: cell, cellParaIndex: 0 },
  ],
});
export function insertTable(d, p, rows, cols, grid, assets, options) {
  const t = makeTable(d, p, rows, cols, options);
  for (let row = 0; row < Math.min(rows, grid.length); row++)
    for (let col = 0; col < Math.min(cols, grid[row].length); col++)
      if (grid[row][col] !== null)
        insertValue(
          d,
          cellPosition(t, row * cols + col),
          grid[row][col],
          assets,
        );
  return t.after;
}
export function insertValue(d, p, value, assets) {
  if (value == null) return p;
  if (value.kind === "multiline") {
    let at = p;
    for (let i = 0; i < value.lines.length; i++) {
      const line = value.lines[i];
      if (line?.kind === "table")
        at = insertTable(d, at, line.rows, line.cols, line.grid, assets);
      else {
        if (i) at = nextLine(d, at);
        at = insertValue(d, at, line, assets);
      }
    }
    return at;
  }
  return insertSegments(
    d,
    p,
    Array.isArray(value) ? value : [{ text: String(value), style: null }],
    assets,
  );
}
const TOKEN = /\\([0-9A-Za-z가-힣_]{1,20})?\\|\\/g;
// HWPX supplies container order; all edits below use native coordinates.
export function paragraphRecords(d) {
  const files = unzipSync(d.exportHwpx()),
    records = [];
  const nativeControls = read(d.getControls());
  const controlTypes = {
    secPr: "secd",
    colPr: "cold",
    header: "head",
    footer: "foot",
    footNote: "fn",
    endNote: "en",
    pageNum: "pgnp",
    pageHiding: "pghd",
    tbl: "tbl",
    equation: "eqed",
    pic: "gso",
    rect: "gso",
    ellipse: "gso",
    line: "gso",
    polygon: "gso",
    curve: "gso",
    arc: "gso",
    container: "gso",
  };
  function visit(node, target) {
    records.push({
      node,
      target,
      text: inSubdocument(target) ? xmlParagraphText(node) : textAt(d, target),
    });
    let globalPara = target.paragraphIndex;
    for (let sec = 0; sec < target.sectionIndex; sec++)
      globalPara += d.getParagraphCount(sec);
    const controls =
      !inCell(target) && !inSubdocument(target)
        ? nativeControls.filter((c) => c.list === 0 && c.para === globalPara)
        : null;
    const used = new Set();
    let ci = 0;
    for (const run of Array.from(node.children).filter(
      (n) => n.localName === "run",
    ))
      for (const child of run.children) {
        const parts =
          child.localName === "ctrl" ? [...child.children] : [child];
        for (const control of parts) {
          if (["autoNum", "newNum"].includes(control.localName)) {
            ci++;
            continue;
          }
          if (["t", "lineSeg", "char"].includes(control.localName)) continue;
          // Header/footer XML is serialized ahead of body objects, while the
          // native control array retains insertion order. Match native indices.
          if (controls) {
            const actual = controls.find(
              (c) =>
                !used.has(c.controlIndex) &&
                c.ctrlId === controlTypes[control.localName],
            );
            if (actual) {
              ci = actual.controlIndex;
              used.add(ci);
            }
          }
          if (control.localName === "tbl") {
            let cell = 0;
            for (const row of [...control.children].filter(
              (n) => n.localName === "tr",
            ))
              for (const tc of [...row.children].filter(
                (n) => n.localName === "tc",
              )) {
                const sub = [...tc.children].find(
                  (n) => n.localName === "subList",
                );
                let cp = 0;
                for (const para of [...(sub?.children || [])].filter(
                  (n) => n.localName === "p",
                ))
                  visit(para, {
                    sectionIndex: target.sectionIndex,
                    ...(target.hf ? { hf: target.hf } : {}),
                    ...(target.note ? { note: target.note } : {}),
                    parentParaIndex: inCell(target)
                      ? parentOf(target)
                      : target.paragraphIndex,
                    paragraphIndex: cp,
                    charOffset: 0,
                    cellPath: [
                      ...clone(pathOf(target)),
                      {
                        controlIndex: ci,
                        cellIndex: cell,
                        cellParaIndex: cp++,
                      },
                    ],
                  });
                cell++;
              }
          } else if (control.getElementsByTagNameNS("*", "drawText").length) {
            const draw = [...control.children].find(
                (n) => n.localName === "drawText",
              ),
              sub =
                draw &&
                [...draw.children].find((n) => n.localName === "subList");
            let cp = 0;
            for (const para of [...(sub?.children || [])].filter(
              (n) => n.localName === "p",
            ))
              visit(para, {
                sectionIndex: target.sectionIndex,
                ...(target.hf ? { hf: target.hf } : {}),
                ...(target.note ? { note: target.note } : {}),
                parentParaIndex: inCell(target)
                  ? parentOf(target)
                  : target.paragraphIndex,
                paragraphIndex: cp,
                charOffset: 0,
                isTextBox: true,
                controlIndex: ci,
                cellIndex: 0,
                cellParaIndex: cp,
                cellPath: [
                  ...clone(pathOf(target)),
                  { controlIndex: ci, cellIndex: 0, cellParaIndex: cp++ },
                ],
              });
          } else if (["footNote", "endNote"].includes(control.localName)) {
            const sub = [...control.children].find(
              (n) => n.localName === "subList",
            );
            const kind = controlTypes[control.localName];
            const ordinal =
              controls
                ?.filter((c) => c.ctrlId === kind)
                .findIndex((c) => c.controlIndex === ci) ?? 0;
            let cp = 0;
            for (const para of [...(sub?.children || [])].filter(
              (n) => n.localName === "p",
            ))
              visit(para, {
                ...body(target.sectionIndex, cp++),
                note: {
                  parentParaIndex: target.paragraphIndex,
                  controlIndex: ci,
                  kind: control.localName,
                  ordinal,
                },
              });
          } else if (["header", "footer"].includes(control.localName)) {
            const apply =
              { BOTH: 0, EVEN: 1, ODD: 2 }[
                control.getAttribute("applyPageType")
              ] || 0;
            const sub = [...control.children].find(
              (n) => n.localName === "subList",
            );
            let cp = 0;
            for (const para of [...(sub?.children || [])].filter(
              (n) => n.localName === "p",
            ))
              visit(para, {
                ...body(target.sectionIndex, cp++),
                hf: {
                  isHeader: control.localName === "header",
                  applyTo: apply,
                },
              });
          }
          ci++;
        }
      }
  }
  for (const name of Object.keys(files)
    .filter((k) => /^Contents\/section\d+\.xml$/.test(k))
    .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0])) {
    const sec = +name.match(/\d+/)[0],
      xml = xmlDocument(files[name]);
    let para = 0;
    for (const n of [...xml.documentElement.children].filter(
      (n) => n.localName === "p",
    ))
      visit(n, body(sec, para++));
  }
  const stages = new Map();
  try {
    for (const record of records)
      if (inSubdocument(record.target)) {
        const key = containerKey(record.target);
        let stage = stages.get(key);
        if (!stage) {
          stage = stageSubdocument(d, record.target);
          stages.set(key, stage);
        }
        record.text = textAt(stage.document, stage.map(record.target));
      }
    return records;
  } finally {
    for (const stage of stages.values()) stage.document.free();
  }
}
export const slotNames = (d) =>
  paragraphRecords(d).flatMap((r) =>
    [...r.text.matchAll(TOKEN)]
      .filter((m) => m[1] !== "본문")
      .map((m) => m[1] || ""),
  );
function containerKey(p) {
  return JSON.stringify([
    p.sectionIndex,
    p.hf || null,
    p.note ? [p.note.parentParaIndex, p.note.kind, p.note.ordinal] : null,
  ]);
}
function fillDocument(original, fills, assets) {
  let d = original;
  let count = 0,
    anchor;
  const positions = [];
  for (const record of paragraphRecords(d))
    for (const match of record.text.matchAll(TOKEN)) {
      if (match[1] === "본문") continue;
      const offset = chars(record.text.slice(0, match.index));
      positions.push({
        p: { ...record.target, charOffset: offset },
        mark: match[0],
        value: fills[count++] ?? null,
      });
    }
  const groups = new Map(),
    bodyPositions = [];
  for (const entry of positions) {
    if (!inSubdocument(entry.p)) {
      bodyPositions.push(entry);
      continue;
    }
    const key = containerKey(entry.p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const replaceSource = (next) => {
    if (d !== original) d.free();
    d = next;
  };
  const nativeBefore = read(d.getControls());
  try {
    for (const entries of [...groups.values()].reverse()) {
      const stage = stageSubdocument(d, entries[0].p);
      try {
        for (const { p, mark, value } of [...entries].reverse()) {
          const target = stage.map(p);
          deleteText(stage.document, target, chars(mark));
          insertValue(stage.document, target, value, assets);
        }
        replaceSource(stage.finish().document);
      } finally {
        stage.document.free();
      }
    }
    const nativeAfter = read(d.getControls());
    d.beginBatch();
    try {
      for (const { p, mark, value } of bodyPositions.reverse()) {
        if (inCell(p)) {
          let global = parentOf(p);
          for (let sec = 0; sec < p.sectionIndex; sec++)
            global += d.getParagraphCount(sec);
          const before = nativeBefore.filter(
              (c) => c.list === 0 && c.para === global,
            ),
            old = before.find(
              (c) => c.controlIndex === pathOf(p)[0].controlIndex,
            );
          if (old) {
            const ordinal = before
              .filter((c) => c.ctrlId === old.ctrlId)
              .indexOf(old);
            pathOf(p)[0].controlIndex =
              nativeAfter.filter(
                (c) =>
                  c.list === 0 && c.para === global && c.ctrlId === old.ctrlId,
              )[ordinal]?.controlIndex ?? pathOf(p)[0].controlIndex;
          }
        }
        deleteText(d, p, chars(mark));
        insertValue(d, p, value, assets);
      }
    } finally {
      d.endBatch();
    }
    for (const record of paragraphRecords(d)) {
      const match = /\\본문\\/.exec(record.text);
      if (match) {
        anchor = {
          ...record.target,
          charOffset: chars(record.text.slice(0, match.index)),
        };
        if (inSubdocument(anchor)) {
          const stage = stageSubdocument(d, anchor);
          try {
            const target = stage.map(anchor);
            deleteText(stage.document, target, chars(match[0]));
            const next = stage.finish(target);
            replaceSource(next.document);
            anchor = next.position;
          } finally {
            stage.document.free();
          }
        } else deleteText(d, anchor, chars(match[0]));
        break;
      }
    }
  } catch (error) {
    if (d !== original) d.free();
    throw error;
  }
  return { count, anchor, source: d };
}
function positionKey(p) {
  return JSON.stringify([
    p.sectionIndex,
    inCell(p) ? parentOf(p) : p.paragraphIndex,
    pathOf(p),
    p.hf || null,
    p.note || null,
  ]);
}
function rewriteParentParagraph(d, p, props) {
  const files = unzipSync(d.exportHwpx()),
    record = paragraphRecords(d).find(
      (r) => positionKey(r.target) === positionKey({ ...p, charOffset: 0 }),
    );
  if (!record) throw new Error("서식을 적용할 문단을 찾지 못했습니다.");
  const header = xmlDocument(files["Contents/header.xml"]),
    styles = [...header.getElementsByTagNameNS("*", "paraPr")],
    original = styles.find(
      (n) => n.getAttribute("id") === record.node.getAttribute("paraPrIDRef"),
    );
  if (!original) throw new Error("원본 문단 서식이 없습니다.");
  const style = original.cloneNode(true),
    id = 1 + Math.max(0, ...styles.map((n) => +n.getAttribute("id")));
  style.setAttribute("id", String(id));
  const nodes = (name) => [...style.getElementsByTagNameNS("*", name)];
  if (props.alignment)
    nodes("align").forEach((n) =>
      n.setAttribute("horizontal", props.alignment.toUpperCase()),
    );
  if (props.condense !== undefined)
    style.setAttribute("condense", String(props.condense));
  if (props.koreanBreakUnit !== undefined)
    nodes("breakSetting").forEach((n) =>
      n.setAttribute(
        "breakNonLatinWord",
        props.koreanBreakUnit ? "KEEP_WORD" : "BREAK_WORD",
      ),
    );
  for (const [key, name] of Object.entries({
    indent: "intent",
    marginLeft: "left",
    marginRight: "right",
    spacingBefore: "prev",
    spacingAfter: "next",
  }))
    if (props[key] !== undefined)
      nodes(name).forEach((n) =>
        n.setAttribute(
          "value",
          String(
            Math.round(
              props[key] *
                (n.parentNode.parentNode.localName === "default" ? 2 : 1),
            ),
          ),
        ),
      );
  if (props.lineSpacing !== undefined)
    nodes("lineSpacing").forEach((n) => {
      n.setAttribute(
        "type",
        (props.lineSpacingType || "Percent").toUpperCase(),
      );
      n.setAttribute("value", String(props.lineSpacing));
    });
  original.parentNode.append(style);
  original.parentNode.setAttribute("itemCnt", String(styles.length + 1));
  record.node.setAttribute("paraPrIDRef", String(id));
  if (d[REPLACE_DETACHED]) {
    const encoder = new TextEncoder(),
      parent = parentOf(p);
    let global = parent;
    for (let sec = 0; sec < p.sectionIndex; sec++)
      global += d.getParagraphCount(sec);
    const before = read(d.getControls()).filter(
      (c) => c.list === 0 && c.para === global,
    );
    files[`Contents/section${p.sectionIndex}.xml`] = encoder.encode(
      new XMLSerializer().serializeToString(record.node.ownerDocument),
    );
    files["Contents/header.xml"] = encoder.encode(
      new XMLSerializer().serializeToString(header),
    );
    d[REPLACE_DETACHED](zipSync(files));
    const after = read(d.getControls()).filter(
        (c) => c.list === 0 && c.para === global,
      ),
      used = new Set(),
      indices = new Map();
    for (const old of before) {
      const next = after.find(
        (c) => c.ctrlId === old.ctrlId && !used.has(c.controlIndex),
      );
      if (next) {
        used.add(next.controlIndex);
        indices.set(old.controlIndex, next.controlIndex);
      }
    }
    return { sectionIndex: p.sectionIndex, parentParaIndex: parent, indices };
  }
  const parent = parentOf(p),
    section = record.node.ownerDocument,
    root = section.documentElement,
    parentNode = [...root.children].filter((n) => n.localName === "p")[parent],
    only = parentNode.cloneNode(true);
  for (const child of [...root.children]) child.remove();
  root.append(only);
  const encoder = new TextEncoder();
  files["Contents/section0.xml"] = encoder.encode(
    new XMLSerializer().serializeToString(section),
  );
  files["Contents/header.xml"] = encoder.encode(
    new XMLSerializer().serializeToString(header),
  );
  const source = new d.constructor(zipSync(files));
  let fragment;
  let globalParent = parent;
  for (let sec = 0; sec < p.sectionIndex; sec++)
    globalParent += d.getParagraphCount(sec);
  const oldControls = read(d.getControls()).filter(
    (c) => c.list === 0 && c.para === globalParent,
  );
  try {
    source.convertToEditable();
    fragment = standaloneFragment(source);
    nativeImport(d, fragment, p.sectionIndex, parent + 1, { dryRun: true });
    nativeImport(d, fragment, p.sectionIndex, parent + 1);
    const shape = read(
      d.getParaPropertiesAt(p.sectionIndex, parent + 1),
    ).paraShapeId;
    let globalPara = parent;
    for (let sec = 0; sec < p.sectionIndex; sec++)
      globalPara += d.getParagraphCount(sec);
    const keep = new Set(["secd", "cold", "head", "foot", "pgnp", "pghd"]);
    const controls = read(d.getControls())
      .filter(
        (c) => c.list === 0 && c.para === globalPara && !keep.has(c.ctrlId),
      )
      .sort((a, b) => b.controlIndex - a.controlIndex);
    for (const c of controls)
      checked(d.deleteControlAt(p.sectionIndex, parent, c.controlIndex));
    const length = d.getParagraphLength(p.sectionIndex, parent);
    if (length) checked(d.deleteText(p.sectionIndex, parent, 0, length));
    checked(d.setParaShapeId(p.sectionIndex, parent, shape));
    checked(d.mergeParagraph(p.sectionIndex, parent + 1));
    const current = read(d.getControls()).filter(
        (c) => c.list === 0 && c.para === globalParent,
      ),
      used = new Set(),
      indices = new Map();
    for (const old of oldControls) {
      const next = current.find(
        (c) => c.ctrlId === old.ctrlId && !used.has(c.controlIndex),
      );
      if (next) {
        used.add(next.controlIndex);
        indices.set(old.controlIndex, next.controlIndex);
      }
    }
    return { sectionIndex: p.sectionIndex, parentParaIndex: parent, indices };
  } finally {
    fragment?.free();
    source.free();
  }
}
function remapPosition(p, map) {
  if (
    map &&
    inCell(p) &&
    p.sectionIndex === map.sectionIndex &&
    parentOf(p) === map.parentParaIndex
  ) {
    const first = pathOf(p)[0];
    first.controlIndex =
      map.indices.get(first.controlIndex) ?? first.controlIndex;
  }
}
function standaloneFragment(d, sourceSection = 0) {
  const files = unzipSync(d.exportHwpx()),
    enc = new TextEncoder();
  const header = xmlDocument(files["Contents/header.xml"]);
  // A detached fragment has no section boundary. Materialize the source's
  // inherited outline reference before dropping that boundary, including styles
  // linked from footnote paragraphs. Otherwise the native importer would inherit
  // the destination's unrelated outline (or reject the fragment).
  const firstSection = xmlDocument(
    files[`Contents/section${sourceSection}.xml`],
  );
  const outline = firstSection
    .getElementsByTagNameNS("*", "secPr")[0]
    ?.getAttribute("outlineShapeIDRef");
  if (outline && outline !== "0") {
    for (const heading of header.getElementsByTagNameNS("*", "heading"))
      if (
        heading.getAttribute("type") === "OUTLINE" &&
        heading.getAttribute("idRef") === "0"
      )
        heading.setAttribute("idRef", outline);
    files["Contents/header.xml"] = enc.encode(
      new XMLSerializer().serializeToString(header),
    );
  }
  for (const name of Object.keys(files).filter((k) =>
    /^Contents\/section\d+\.xml$/.test(k),
  )) {
    const xml = xmlDocument(files[name]);
    for (const key of [
      "secPr",
      "colPr",
      "header",
      "footer",
      "pageNum",
      "pageHiding",
    ])
      for (const n of [...xml.getElementsByTagNameNS("*", key)]) n.remove();
    files[name] = enc.encode(new XMLSerializer().serializeToString(xml));
  }
  const staged = new d.constructor(zipSync(files));
  staged.convertToEditable();
  return staged;
}
function nativeImport(
  d,
  source,
  sec,
  index,
  {
    dryRun = false,
    sourceSection = 0,
    start = 0,
    end = source.getParagraphCount(sourceSection),
  } = {},
) {
  let r;
  try {
    r = checked(
      d.importParagraphBlock(
        source,
        JSON.stringify({
          request: {
            sourceSection,
            sourceStart: start,
            sourceEnd: end,
            targetSection: sec,
            insertBefore: index,
            count: 1,
          },
          dryRun,
        }),
      ),
    );
  } catch (error) {
    if (!d[REPLACE_DETACHED] || !requiresPackageImport(error)) throw error;
    const imported = importHwpxParagraphs(d, source, sec, index, {
      sourceSection,
      start,
      end,
    });
    if (!dryRun) d[REPLACE_DETACHED](imported.bytes);
    return { start: imported.start, end: imported.end };
  }
  return (
    r.operationResult?.result?.inserted || {
      start: index,
      end: index + end - start,
    }
  );
}
function requiresPackageImport(error) {
  return /paragraph block.*(?:opaque HWPX paraHead|implicit source outline|AutoNumber|Footnote|Endnote)/i.test(
    String(error),
  );
}
function insertFragment(d, p, source) {
  if (p.hf) throw new Error("양식 조각은 본문 또는 표 셀에 넣어주세요.");
  if (inCell(p)) {
    const sec = p.sectionIndex,
      start = d.getParagraphCount(sec);
    checked(d.insertParagraph(sec, start));
    let result;
    try {
      const range = nativeImport(d, source, sec, start);
      checked(d.copySelection(sec, range.start, 0, range.end, 0));
      result = checked(
        d.pasteInternalInCellByPath(
          sec,
          parentOf(p),
          pathJSON(p),
          p.charOffset,
        ),
      );
    } finally {
      for (let i = d.getParagraphCount(sec) - 1; i >= start; i--)
        checked(d.deleteParagraph(sec, i));
    }
    const cp =
      result.endParaIndex ??
      result.endCellParaIndex ??
      paragraphNumber(p) + source.getParagraphCount(0) - 1;
    return { ...cellWithPara(p, cp), charOffset: result.endCharOffset ?? 0 };
  }
  let index = p.paragraphIndex;
  if (p.charOffset > 0) {
    const next = nextLine(d, p);
    index = next.paragraphIndex;
  }
  const range = nativeImport(d, source, p.sectionIndex, index);
  return body(p.sectionIndex, range.end, 0);
}
function selectionText(d, selection) {
  if (!selection) return "";
  const { start, end } = selection;
  if (!sameContainer(start, end))
    throw new Error("같은 본문 구역 또는 표 셀 안에서 선택해주세요.");
  const values = [];
  for (
    let para = paragraphNumber(start);
    para <= paragraphNumber(end);
    para++
  ) {
    const p = inCell(start)
        ? cellWithPara(start, para)
        : paragraphAt(start, para),
      text = textAt(d, p),
      from = para === paragraphNumber(start) ? start.charOffset : 0,
      to = para === paragraphNumber(end) ? end.charOffset : chars(text);
    values.push([...text].slice(from, to).join(""));
  }
  return values.join("\n");
}
function deleteRange(d, selection) {
  const { start: a, end: b } = selection;
  if (a.hf)
    checked(
      d.replaceRangeInHeaderFooter(
        a.sectionIndex,
        a.hf.isHeader,
        a.hf.applyTo,
        a.paragraphIndex,
        a.charOffset,
        b.paragraphIndex,
        b.charOffset,
        "",
      ),
    );
  else if (inCell(a))
    checked(
      d.deleteRangeInCellByPath(
        a.sectionIndex,
        parentOf(a),
        pathJSON(a),
        paragraphNumber(a),
        a.charOffset,
        paragraphNumber(b),
        b.charOffset,
      ),
    );
  else
    checked(
      d.deleteRange(
        a.sectionIndex,
        a.paragraphIndex,
        a.charOffset,
        b.paragraphIndex,
        b.charOffset,
      ),
    );
  return clone(a);
}
export class NativePalette {
  constructor(getBridge, store, { replaceDocument, notify = () => {} } = {}) {
    this.getBridge = getBridge;
    this.store = store;
    this.replaceDocument = replaceDocument;
    this.notify = notify;
  }
  bridge() {
    const b = this.getBridge();
    if (!b?.input)
      throw new Error("시험지 편집기가 준비된 뒤 다시 실행해주세요.");
    return b;
  }
  focusPosition(position) {
    moveCursor(this.bridge().input, position);
  }
  canGroup(a, b) {
    return sameContainer(a, b) && paragraphNumber(b) === paragraphNumber(a) + 1;
  }
  capture() {
    const b = this.bridge(),
      input = b.input;
    let position = clone(input.getCursorPosition());
    let selection = clone(input.getSelection());
    if (input.cursor.isInFootnote?.()) {
      const c = input.cursor;
      position = body(c.fnSectionIdx, c.fnInnerParaIdx, c.fnCharOffset);
      position.note = {
        parentParaIndex: c.fnParaIdx,
        controlIndex: c.fnControlIdx,
      };
      const range = c.getFootnoteSelectionOrdered?.();
      const convert = (p) => ({
        ...paragraphAt(position, p.fnParaIdx),
        charOffset: p.charOffset,
      });
      selection =
        range &&
        (range.start.fnParaIdx !== range.end.fnParaIdx ||
          range.start.charOffset !== range.end.charOffset)
          ? { start: convert(range.start), end: convert(range.end) }
          : null;
    } else if (input.cursor.isInHeaderFooter?.()) {
      const c = input.cursor;
      position = body(c.hfSectionIdx, c.hfParaIdx, c.hfCharOffset);
      position.hf = {
        isHeader: c.headerFooterMode === "header",
        applyTo: c.hfApplyTo,
      };
      position.sectionIndex = c.hfSectionIdx;
      position.paragraphIndex = c.hfParaIdx;
      position.charOffset = c.hfCharOffset;
      const hfSelection = input.getNonEmptyHeaderFooterSelection?.();
      const convert = (p) => ({
        sectionIndex: p.sectionIdx,
        paragraphIndex: p.paraIdx,
        charOffset: p.charOffset,
        hf: { isHeader: p.isHeader, applyTo: p.applyTo },
      });
      selection = hfSelection
        ? { start: convert(hfSelection.start), end: convert(hfSelection.end) }
        : null;
    }
    return {
      generation: b.generation,
      revision: b.revision,
      position,
      selection,
      text: selection ? this.contextText(position, selection) : "",
    };
  }
  contextText(position, selection) {
    const d = this.bridge().wasm.borrowDocumentHandle();
    if (!inSubdocument(position)) return selectionText(d, selection);
    const stage = stageSubdocument(d, position);
    try {
      return selectionText(stage.document, {
        start: stage.map(selection.start),
        end: stage.map(selection.end),
      });
    } finally {
      stage.document.free();
    }
  }
  async inContainer(context, operation) {
    const b = this.assertContext(context),
      stage = inSubdocument(context.position)
        ? stageSubdocument(b.wasm.borrowDocumentHandle(), context.position)
        : stageDocument(b.wasm.borrowDocumentHandle());
    const mapped = {
      ...context,
      position: stage.map(context.position),
      selection: context.selection
        ? {
            start: stage.map(context.selection.start),
            end: stage.map(context.selection.end),
          }
        : null,
    };
    let cursor = clone(mapped.position);
    const input = {
      cursor: {
        clearSelection() {},
        moveTo(p) {
          cursor = clone(p);
        },
      },
      getCursorPosition: () => clone(cursor),
      getSelection: () => clone(mapped.selection),
      getSelectedCellBlock: () => null,
      getParaFormatTargetsAtCursor: () => [],
    };
    const bridge = {
      detached: true,
      input,
      generation: b.generation,
      revision: b.revision,
      wasm: new Proxy(b.wasm, {
        get: (_, key) =>
          key === "borrowDocumentHandle"
            ? () => stage.document
            : typeof stage.document[key] === "function"
              ? stage.document[key].bind(stage.document)
              : b.wasm[key],
      }),
      transaction: (_, mutate) => mutate(input),
    };
    const native = new NativePalette(() => bridge, this.store, {
      notify: this.notify,
    });
    let finished,
      adopted = false;
    try {
      const result = await operation(native, mapped);
      this.assertContext(context);
      finished = stage.finish(cursor);
      b.transaction("palette-subdocument", (realInput) => {
        installDocumentHistory(b.wasm).adopt(finished.document);
        adopted = true;
        realInput.cursor.clearSelection();
        moveCursor(realInput, finished.position);
        return finished.position;
      });
      finished = null; // Native history now owns the adopted handle.
      return result;
    } finally {
      if (finished && !adopted) finished.document.free();
      stage.document.free();
    }
  }
  assertContext(context) {
    const b = this.bridge();
    if (context.generation !== b.generation || context.revision !== b.revision)
      throw new Error(
        "문서가 바뀌었습니다. 위치를 다시 선택한 뒤 실행해주세요.",
      );
    return b;
  }
  async assetsFor(values) {
    const state = this.store.state,
      map = new Map(),
      refs = new Set();
    function walk(value) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        if (value.image) refs.add(value.image);
        Object.values(value).forEach(walk);
      }
    }
    walk(values);
    for (const ref of refs) {
      const photo = state.photos.find((p) => p.id === ref || p.label === ref);
      if (!photo || !state.assets[photo.asset])
        throw new Error(
          `그림 '${ref}'을 찾지 못했습니다. 사진 폴더를 연결해주세요.`,
        );
      const original = base64ToBytes(state.assets[photo.asset]),
        style =
          state.config.profiles[state.config.active_profile]?.exam_image_style;
      let converted;
      try {
        converted = await convertExamImage(original, style);
      } catch (error) {
        this.notify(
          `그림 스타일 변환 실패 · 원본으로 삽입합니다: ${error.message}`,
        );
        converted = { bytes: original };
      }
      const bytes = converted.bytes,
        width = converted.width || photo.width,
        height = converted.height || photo.height,
        physical = physicalImageSize(bytes, width, height);
      map.set(ref, {
        bytes,
        width,
        height,
        extension: converted.extension || photo.extension,
        name: photo.label,
        widthMm: photo.widthMm || physical.widthMm,
        heightMm: photo.widthMm
          ? (photo.widthMm * height) / width
          : physical.heightMm,
      });
    }
    return map;
  }
  async prepareItem(item, fills = []) {
    const b = this.bridge(),
      Document = b.wasm.borrowDocumentHandle().constructor,
      source = new Document(await itemBytes(this.store.state, item));
    try {
      source.convertToEditable();
      const assets = await this.assetsFor(fills);
      const result = fillDocument(source, fills, assets);
      if (result.source !== source) source.free();
      const prepared = result.source;
      delete result.source;
      return { source: prepared, result };
    } catch (e) {
      source.free();
      throw e;
    }
  }
  async useItem(
    item,
    { form = false, fills = [], context = this.capture() } = {},
  ) {
    if (!form && inSubdocument(context.position))
      return this.inContainer(context, (n, c) =>
        n.useItem(item, { form, fills, context: c }),
      );
    if (item.mix?.length) {
      const ops = item.mix.map((ref) => [
        "template",
        this.store.state.library["템플릿"].find((i) => i.id === ref),
        [],
      ]);
      let offset = 0;
      for (const op of ops) {
        if (!op[1]) throw new Error("꾸러미에서 참조하는 물감이 없습니다.");
        op[2] = fills.slice(offset, offset + (+op[1].slot_count || 0));
        offset += +op[1].slot_count || 0;
      }
      return this.executePlan({ ops, warnings: [] }, context);
    }
    const { source, result } = await this.prepareItem(item, fills);
    try {
      this.assertContext(context);
      if (form) {
        if (!this.replaceDocument)
          throw new Error("새 양식 열기가 연결되지 않았습니다.");
        await this.replaceDocument(
          new Uint8Array(source.exportHwpx()),
          item.name,
          result.anchor,
        );
        return;
      }
      const staged = standaloneFragment(source);
      try {
        const b = this.assertContext(context);
        try {
          nativeImport(
            b.wasm.borrowDocumentHandle(),
            staged,
            context.position.sectionIndex,
            b.wasm.getParagraphCount(context.position.sectionIndex),
            { dryRun: true },
          );
        } catch (error) {
          if (!b.detached && requiresPackageImport(error))
            return this.inContainer(context, (n, c) =>
              n.useItem(item, { form, fills, context: c }),
            );
          throw error;
        }
        b.transaction("palette-template", (input) => {
          const at = context.selection
            ? deleteRange(b.wasm.borrowDocumentHandle(), context.selection)
            : context.position;
          input.cursor.clearSelection();
          const position = insertFragment(
            b.wasm.borrowDocumentHandle(),
            at,
            staged,
          );
          input.cursor.moveTo(position);
          return position;
        });
      } finally {
        staged.free();
      }
    } finally {
      source.free();
    }
  }
  async insertChar(text, context = this.capture()) {
    if (inSubdocument(context.position))
      return this.inContainer(context, (n, c) => n.insertChar(text, c));
    const b = this.assertContext(context);
    return b.transaction("palette-character", (input) => {
      const d = b.wasm.borrowDocumentHandle(),
        p = context.selection
          ? deleteRange(d, context.selection)
          : context.position,
        position = insertValue(d, p, String(text), new Map());
      input.cursor.clearSelection();
      moveCursor(input, position);
      return position;
    });
  }
  async applyFunctions(actions, context = this.capture()) {
    if (inSubdocument(context.position))
      return this.inContainer(context, (n, c) => {
        if (!c.selection)
          c.selection = {
            start: { ...clone(c.position), charOffset: 0 },
            end: {
              ...clone(c.position),
              charOffset: lengthAt(
                n.bridge().wasm.borrowDocumentHandle(),
                c.position,
              ),
            },
          };
        return n.applyFunctions(actions, c);
      });
    const b = this.assertContext(context),
      input = b.input,
      d = b.wasm.borrowDocumentHandle();
    const block = input.getSelectedCellBlock?.(),
      selection = context.selection;
    if (!selection && !block && !context.position.hf)
      throw new Error("서식을 적용할 글자 또는 표 셀을 선택해주세요.");
    const props = charProps(d, context.position),
      char = {},
      para = {};
    let condense = null;
    for (const action of actions) {
      const key = action.func,
        v = action.value,
        definition = CATALOG.functions.find((f) => f.key === key);
      if (definition?.kind === "number") {
        const [min, max] = CATALOG.spin[key];
        if (!Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max)
          throw new Error(`${key} 값은 ${min}~${max} 범위로 입력해주세요.`);
      }
      if (["굵게", "기울임", "밑줄"].includes(key)) {
        const field = { 굵게: "bold", 기울임: "italic", 밑줄: "underline" }[
          key
        ];
        char[field] = v === undefined ? !props[field] : !!v;
      } else if (["글씨체", "글씨크기", "자간", "글자색"].includes(key))
        Object.assign(
          char,
          nativeCharFields({
            [{ 글씨체: "글꼴", 글씨크기: "크기" }[key] || key]: v,
          }),
        );
      else if (["가운데정렬", "왼쪽정렬", "양쪽정렬"].includes(key))
        para.alignment = {
          가운데정렬: "center",
          왼쪽정렬: "left",
          양쪽정렬: "justify",
        }[key];
      else if (key === "줄간격") {
        para.lineSpacing = Number(v);
        para.lineSpacingType = "Percent";
      } else if (key === "들여쓰기" || key === "내어쓰기")
        para.indent =
          Math.round(Math.abs(Number(v)) * 100) * (key === "내어쓰기" ? -1 : 1);
      else if (key === "왼쪽여백" || key === "오른쪽여백")
        para[key === "왼쪽여백" ? "marginLeft" : "marginRight"] = mm(v);
      else if (key === "어절단위 줄바꿈")
        para.koreanBreakUnit = v === false ? 1 : 0;
      else if (key === "자간 자동조절")
        para.condense = Math.max(0, Math.min(50, Number(v)));
      else throw new Error(`알 수 없는 서식입니다: ${key}`);
    }
    const ranges = [];
    if (block) {
      for (const target of input.getParaFormatTargetsAtCursor()) {
        if (target.kind !== "cell") continue;
        const p = {
          sectionIndex: target.sec,
          parentParaIndex: target.parentPara,
          paragraphIndex: target.cellParaIdx,
          charOffset: 0,
          cellPath: [
            {
              controlIndex: target.controlIdx,
              cellIndex: target.cellIdx,
              cellParaIndex: target.cellParaIdx,
            },
          ],
        };
        ranges.push({ p, start: 0, end: lengthAt(d, p) });
      }
    } else if (selection) {
      if (!sameContainer(selection.start, selection.end))
        throw new Error("같은 구역 또는 표 셀 안에서 글자를 선택해주세요.");
      for (
        let i = paragraphNumber(selection.start);
        i <= paragraphNumber(selection.end);
        i++
      ) {
        const p = inCell(selection.start)
          ? cellWithPara(selection.start, i)
          : paragraphAt(selection.start, i);
        ranges.push({
          p,
          start:
            i === paragraphNumber(selection.start)
              ? selection.start.charOffset
              : 0,
          end:
            i === paragraphNumber(selection.end)
              ? selection.end.charOffset
              : lengthAt(d, p),
        });
      }
    } else
      ranges.push({
        p: context.position,
        start: 0,
        end: lengthAt(d, context.position),
      });
    b.transaction("palette-format", () => {
      for (const range of ranges)
        charFormat(d, range.p, range.start, range.end, char);
      const cursor = clone(input.getCursorPosition());
      for (const range of ranges) {
        const mapping = paraFormat(d, range.p, para);
        for (const next of ranges) remapPosition(next.p, mapping);
        remapPosition(cursor, mapping);
      }
      moveCursor(input, cursor);
      if (condense !== null) this.fitRanges(d, ranges, condense);
      return input.getCursorPosition();
    });
  }
  fitRanges(d, ranges, max = 8) {
    let tightened = 0,
      budget = 600;
    for (const { p } of ranges.slice(0, 100)) {
      const mapping = paraFormat(d, p, { koreanBreakUnit: 0 });
      for (const range of ranges) remapPosition(range.p, mapping);
      const info = (offset) => {
        if (p.hf || pathOf(p).length > 1) {
          const record = paragraphRecords(d).find(
            (r) => positionKey(r.target) === positionKey(p),
          );
          const array = [...(record?.node.children || [])].find(
            (n) => n.localName === "linesegarray",
          );
          const starts = [...(array?.children || [])]
            .map((n) => +n.getAttribute("textpos"))
            .filter(Number.isFinite);
          if (!starts.length) return { charStart: 0, charEnd: lengthAt(d, p) };
          const index = Math.max(
            0,
            starts.findLastIndex((start) => start <= offset),
          );
          return {
            charStart: starts[index],
            charEnd: starts[index + 1] ?? lengthAt(d, p),
          };
        }
        if (inCell(p)) {
          const c = pathOf(p)[0];
          return read(
            d.getLineInfoInCell(
              p.sectionIndex,
              parentOf(p),
              c.controlIndex,
              c.cellIndex,
              c.cellParaIndex,
              offset,
            ),
          );
        }
        return read(d.getLineInfo(p.sectionIndex, p.paragraphIndex, offset));
      };
      let line = info(0);
      for (
        let count = 0;
        count < 200 && budget > 0 && line.charEnd < lengthAt(d, p);
        count++
      ) {
        budget--;
        const start = line.charStart,
          end = line.charEnd,
          style = charProps(d, { ...p, charOffset: start });
        if (style.spacings?.every((n) => n === 0)) {
          let fitted = false,
            current = end;
          for (let spacing = -2; spacing >= -max; spacing -= 2) {
            charFormat(d, p, start, current, {
              spacings: Array(7).fill(spacing),
            });
            const next = info(start);
            if (next.charEnd > end) {
              charFormat(d, p, start, next.charEnd, {
                spacings: Array(7).fill(spacing),
              });
              line = info(start);
              tightened++;
              fitted = true;
              break;
            }
            current = Math.max(current, next.charEnd);
          }
          if (!fitted) {
            charFormat(d, p, start, current, { spacings: Array(7).fill(0) });
            line = info(start);
          }
        }
        const next = info(line.charEnd);
        if (next.charStart <= line.charStart) break;
        line = next;
      }
    }
    return tightened;
  }
  async fitSpacing({ max = 8, context = this.capture() } = {}) {
    if (inSubdocument(context.position))
      return this.inContainer(context, (n, c) =>
        n.fitSpacing({ max, context: c }),
      );
    const b = this.bridge(),
      input = b.input,
      selection = context.selection;
    this.assertContext(context);
    if (!selection) throw new Error("자간을 맞출 문단을 선택해주세요.");
    if (!sameContainer(selection.start, selection.end))
      throw new Error("같은 본문 구역 또는 표 셀 안에서 선택해주세요.");
    const d = b.wasm.borrowDocumentHandle(),
      ranges = [];
    for (
      let i = paragraphNumber(selection.start);
      i <= paragraphNumber(selection.end);
      i++
    )
      ranges.push({
        p: paragraphAt(selection.start, i),
      });
    let tightened;
    b.transaction("palette-spacing-fit", () => {
      tightened = this.fitRanges(d, ranges, max);
      return input.getCursorPosition();
    });
    this.notify(`자간 맞춤: ${tightened}개 줄을 다듬었습니다.`);
    return tightened;
  }
  async convert(text = null, context = this.capture()) {
    if (inSubdocument(context.position))
      return this.inContainer(context, (n, c) => n.convert(text, c));
    const source = text ?? context.text;
    if (!source.trim())
      throw new Error("변환할 마크다운을 선택하거나 입력해주세요.");
    const lookup = libraryLookup(this.store.state),
      question = parseQuestion(source);
    if (
      recognizedQuestion(question) &&
      !source
        .split("\n")
        .some((line) =>
          ["템플릿", "양식"].includes(
            lookup.get(/^\\([^\\]+)\\$/.exec(line.trim())?.[1])?.[0],
          ),
        )
    ) {
      if (inCell(context.position) || context.position.hf)
        throw new Error("문항 조판은 표 밖의 본문에서 실행해주세요.");
      return this.composeQuestions(source, context, lookup);
    }
    return this.executePlan(buildLibraryPlan(source, lookup), context);
  }
  async executePlan(plan, context = this.capture()) {
    if (
      inSubdocument(context.position) &&
      !plan.ops.some((op) => op[0] === "form")
    )
      return this.inContainer(context, (n, c) => n.executePlan(plan, c));
    if (plan.ops.some((op) => op[0] === "form")) {
      if (plan.ops.length !== 1 || plan.ops[0][0] !== "form")
        throw new Error("새 양식 열기는 다른 삽입 명령과 나누어 실행해주세요.");
      return this.useItem(plan.ops[0][1], {
        form: true,
        fills: plan.ops[0][2],
        context,
      });
    }
    const assets = await this.assetsFor(plan.ops),
      prepared = [];
    try {
      for (const op of plan.ops)
        if (op[0] === "template") {
          const result = await this.prepareItem(op[1], op[2]);
          try {
            const fragment = standaloneFragment(result.source);
            prepared.push({ op, fragment });
          } finally {
            result.source.free();
          }
        }
      const b = this.assertContext(context),
        d = b.wasm.borrowDocumentHandle();
      for (const { fragment } of prepared) {
        try {
          nativeImport(
            d,
            fragment,
            context.position.sectionIndex,
            d.getParagraphCount(context.position.sectionIndex),
            { dryRun: true },
          );
        } catch (error) {
          if (!b.detached && requiresPackageImport(error))
            return this.inContainer(context, (n, c) => n.executePlan(plan, c));
          throw error;
        }
      }
      b.transaction("palette-convert", (input) => {
        let p = context.selection
          ? deleteRange(d, context.selection)
          : clone(context.position);
        input.cursor.clearSelection();
        for (let i = 0; i < plan.ops.length; i++) {
          const op = plan.ops[i];
          if (op[0] === "template")
            p = insertFragment(
              d,
              p,
              prepared.find((entry) => entry.op === op).fragment,
            );
          else if (op[0] === "table")
            p = insertTable(d, p, op[1], op[2], op[3], assets);
          else {
            p = insertValue(d, p, op[1], assets);
            if (i < plan.ops.length - 1) p = nextLine(d, p);
          }
        }
        moveCursor(input, p);
        return p;
      });
      this.notify(
        plan.warnings.length
          ? `변환 완료 · ${plan.warnings.join(" · ")}`
          : "변환 완료",
      );
      return plan;
    } finally {
      for (const item of prepared) item.fragment.free();
    }
  }
  async composeQuestions(
    text,
    context,
    lookup = libraryLookup(this.store.state),
  ) {
    if (inSubdocument(context.position))
      return this.inContainer(context, (n, c) =>
        n.composeQuestions(text, c, lookup),
      );
    const questions = text
        .split(/(?=^(?:번호:|번 호:))/m)
        .filter((s) => s.trim())
        .map(parseQuestion)
        .filter(recognizedQuestion),
      all = questions.flatMap((q) =>
        [q.stem, q.material, q.question, ...q.bogi, ...q.choices].map((s) =>
          buildSegments(s, lookup, []),
        ),
      ),
      assets = await this.assetsFor(all),
      b = this.assertContext(context),
      d = b.wasm.borrowDocumentHandle(),
      config = this.store.state.config,
      spec = profileSpec(config.profiles[config.active_profile]);
    let number = config.next_number;
    const styled = (value) =>
      buildSegments(value, lookup, []).map((seg) =>
        spec.font.apply
          ? {
              ...seg,
              style: {
                글꼴: spec.font.name,
                크기: spec.font.size_pt,
                ...seg.style,
              },
            }
          : seg,
      );
    b.transaction("palette-exam", (input) => {
      let p = context.selection
        ? deleteRange(d, context.selection)
        : clone(context.position);
      input.cursor.clearSelection();
      const write = (text, props = {}) => {
        paraFormat(d, p, props);
        p = insertSegments(d, p, styled(text), assets);
        p = nextLine(d, p);
      };
      for (const q of questions) {
        if (q.stem) {
          write(
            `${config.use_number ? (q.num || number) + ". " : ""}${q.stem}`,
            {
              indent: spec.stem.indentation,
              marginLeft: 0,
              marginRight: 0,
              spacingBefore: 0,
              spacingAfter: 0,
              lineSpacing: spec.stem.line_spacing,
              alignment: "justify",
            },
          );
          if (config.use_number && !q.num) number++;
        }
        const width = mm(spec.layout.column_width_mm);
        if (q.material_type === "photo") {
          p = insertTable(d, p, 2, 2, [], assets, {
            width,
            heights: [
              mm(spec.photo_box.row1_height_mm),
              mm(spec.photo_box.row2_height_mm),
            ],
            border: "None",
          });
        } else if (q.material_type === "experiment") {
          p = insertTable(d, p, 1, 1, [[spec.experiment_box.label]], assets, {
            width,
            heights: [mm(spec.experiment_box.height_mm)],
            border: spec.border.experiment_type,
          });
        } else if (q.material_flag) {
          p = insertTable(
            d,
            p,
            2,
            2,
            [
              [
                {
                  kind: "multiline",
                  lines: q.material.split("\n").map(styled),
                },
              ],
            ],
            assets,
            {
              width,
              heights: [
                mm(spec.material_box.row1_height_mm),
                mm(spec.material_box.row2_height_mm),
              ],
              border: spec.border.material_type,
            },
          );
        }
        if (q.question)
          write("  " + q.question, {
            indent: 0,
            spacingBefore: spec.question.prev_spacing,
            spacingAfter: spec.question.next_spacing,
          });
        paraFormat(d, p, { indent: 0, spacingBefore: 0, spacingAfter: 0 });
        if (q.bogi.length) {
          const box = spec.bogi_box,
            t = makeTable(d, p, 3, 5, {
              width,
              heights: [
                mm(box.title_height_mm),
                mm(box.gap_height_mm),
                mm(box.content_height_mm),
              ],
              border: "None",
            });
          checked(d.mergeTableCells(t.sec, t.para, t.control, 0, 2, 1, 2));
          checked(d.mergeTableCells(t.sec, t.para, t.control, 2, 0, 2, 4));
          const cells = read(d.getTableDimensions(t.sec, t.para, t.control));
          const find = (r, c) =>
            read(
              d.getCellInfo(
                t.sec,
                t.para,
                t.control,
                cells.cells?.findIndex((n) => n.row === r && n.col === c) ??
                  (r === 2 ? 9 : 2),
              ),
            );
          let titleCell = 2,
            contentCell = 9;
          const infos = [];
          for (let i = 0; i < 15; i++) {
            try {
              infos.push([i, read(d.getCellInfo(t.sec, t.para, t.control, i))]);
            } catch {
              break;
            }
          }
          titleCell =
            infos.find(
              ([, info]) =>
                (info.rowAddr === 0 && info.colAddr === 2) ||
                (info.row === 0 && info.col === 2),
            )?.[0] ?? 2;
          contentCell =
            infos.find(
              ([, info]) =>
                (info.rowAddr === 2 && info.colAddr === 0) ||
                (info.row === 2 && info.col === 0),
            )?.[0] ?? infos.length - 1;
          insertValue(d, cellPosition(t, titleCell), box.title, assets);
          paraFormat(d, cellPosition(t, titleCell), { alignment: "center" });
          let at = cellPosition(t, contentCell);
          for (let i = 0; i < Math.min(q.bogi.length, 5); i++) {
            if (i) at = nextLine(d, at);
            paraFormat(d, at, {
              alignment: "justify",
              lineSpacing: box.line_spacing,
            });
            at = insertSegments(
              d,
              at,
              styled(`${"ㄱㄴㄷㄹㅁ"[i]}. ${q.bogi[i]}`),
              assets,
            );
          }
          const line = {
            type:
              { None: 0, Solid: 1, Dash: 2, Double: 7 }[
                spec.border.bogi_type
              ] ?? 1,
            width: 1,
            color: "#000000",
          };
          checked(
            d.setCellProperties(
              t.sec,
              t.para,
              t.control,
              contentCell,
              JSON.stringify({
                paddingLeft: mm(box.cell_margin_left_mm),
                paddingRight: mm(box.cell_margin_right_mm),
                paddingTop: mm(box.cell_margin_top_mm),
                paddingBottom: mm(box.cell_margin_bottom_mm),
                applyInnerMargin: true,
                borderLeft: line,
                borderRight: line,
                borderBottom: line,
              }),
            ),
          );
          p = t.after;
        }
        const options = q.choices
          .slice(0, 5)
          .map((s, i) => styled(`${"①②③④⑤"[i]} ${formatChoice(s)}`));
        if (q.choices_type === "1")
          for (const option of options) {
            p = insertSegments(d, p, option, assets);
            p = nextLine(d, p);
          }
        else if (options.length) {
          const cols = q.choices_type === "3" ? 3 : 5,
            rows = q.choices_type === "3" ? 2 : 1,
            grid = Array.from({ length: rows }, (_, r) =>
              options.slice(r * cols, (r + 1) * cols),
            );
          p = insertTable(d, p, rows, cols, grid, assets, {
            width,
            heights: Array(rows).fill(mm(spec.choices.row_height_mm)),
            border: "None",
          });
        }
        p = nextLine(d, p);
      }
      input.cursor.moveTo(p);
      return p;
    });
    await this.store.update((s) => {
      s.config.next_number = number;
    });
    this.notify(`${questions.length}개 문항 조판 완료`);
  }
  async captureTemplate(context = this.capture(), { control = null } = {}) {
    if (inSubdocument(context.position)) {
      const b = this.assertContext(context),
        stage = stageSubdocument(
          b.wasm.borrowDocumentHandle(),
          context.position,
        );
      const mapped = {
        ...context,
        position: stage.map(context.position),
        selection: context.selection
          ? {
              start: stage.map(context.selection.start),
              end: stage.map(context.selection.end),
            }
          : null,
      };
      if (!mapped.selection && !inCell(mapped.position))
        mapped.selection = {
          start: body(mapped.position.sectionIndex, stage.start),
          end: body(
            mapped.position.sectionIndex,
            stage.document.getParagraphCount(mapped.position.sectionIndex) - 1,
            stage.document.getParagraphLength(
              mapped.position.sectionIndex,
              stage.document.getParagraphCount(mapped.position.sectionIndex) -
                1,
            ),
          ),
        };
      if (context.position.note) {
        let global = stage.start;
        for (let sec = 0; sec < context.position.sectionIndex; sec++)
          global += stage.document.getParagraphCount(sec);
        const marker = read(stage.document.getControls()).find(
          (c) => c.list === 0 && c.para === global && c.ctrlId === "atno",
        );
        if (marker) {
          checked(
            stage.document.deleteControlAt(
              context.position.sectionIndex,
              stage.start,
              marker.controlIndex,
            ),
          );
          for (const point of [
            mapped.position,
            mapped.selection?.start,
            mapped.selection?.end,
          ])
            if (point && !inCell(point) && point.paragraphIndex === stage.start)
              point.charOffset = Math.max(0, point.charOffset - 1);
        }
      }
      const native = new NativePalette(
        () => ({
          generation: b.generation,
          revision: b.revision,
          input: {},
          wasm: { borrowDocumentHandle: () => stage.document },
        }),
        this.store,
      );
      try {
        return await native.captureTemplate(mapped, { control });
      } finally {
        stage.document.free();
      }
    }
    const b = this.assertContext(context),
      live = b.wasm.borrowDocumentHandle(),
      source = new live.constructor(new Uint8Array(live.exportHwpx()));
    let fragment;
    try {
      source.convertToEditable();
      const range = context.selection;
      let start, end;
      if (context.position.hf) {
        const pos = context.position,
          from = range?.start || paragraphAt(pos, 0),
          info = read(
            source.getHeaderFooterParaInfo(
              pos.sectionIndex,
              pos.hf.isHeader,
              pos.hf.applyTo,
              0,
            ),
          ),
          to = range?.end || paragraphAt(pos, info.paraCount - 1);
        if (!range) to.charOffset = lengthAt(source, to);
        checked(
          source.copySelectionInHeaderFooter(
            pos.sectionIndex,
            pos.hf.isHeader,
            pos.hf.applyTo,
            from.paragraphIndex,
            from.charOffset,
            to.paragraphIndex,
            to.charOffset,
          ),
        );
        start = source.getParagraphCount(pos.sectionIndex);
        checked(source.insertParagraph(pos.sectionIndex, start));
        checked(source.pasteInternal(pos.sectionIndex, start, 0));
        end = source.getParagraphCount(pos.sectionIndex);
      } else if (inCell(context.position)) {
        const pos = context.position,
          from = range?.start || cellWithPara(pos, 0),
          to =
            range?.end ||
            cellWithPara(
              pos,
              source.getCellParagraphCountByPath(
                pos.sectionIndex,
                parentOf(pos),
                pathJSON(pos),
              ) - 1,
            );
        if (!range) to.charOffset = lengthAt(source, to);
        checked(
          source.copySelectionInCellByPath(
            pos.sectionIndex,
            parentOf(pos),
            pathJSON(pos),
            paragraphNumber(from),
            from.charOffset,
            paragraphNumber(to),
            to.charOffset,
          ),
        );
        start = source.getParagraphCount(pos.sectionIndex);
        checked(source.insertParagraph(pos.sectionIndex, start));
        const result = checked(
          source.pasteInternal(pos.sectionIndex, start, 0),
        );
        end = source.getParagraphCount(pos.sectionIndex);
      } else {
        start = range?.start.paragraphIndex ?? context.position.paragraphIndex;
        end = (range?.end.paragraphIndex ?? start) + 1;
      }
      fragment = standaloneFragment(source, context.position.sectionIndex);
      const blank = live.constructor.createEmpty();
      blank.createBlankDocument();
      let output;
      try {
        output = detachedDocument(live.constructor, blank.exportHwpx());
      } finally {
        blank.free();
      }
      try {
        nativeImport(output, fragment, 0, 0, {
          sourceSection: context.position.sectionIndex,
          start,
          end,
        });
        const count = output.getParagraphCount(0);
        if (count > 1) checked(output.deleteParagraph(0, count - 1));
        if (range && !inCell(context.position) && !context.position.hf) {
          const last = end - start - 1,
            len = output.getParagraphLength(0, last);
          if (range.end.charOffset < len)
            checked(
              output.deleteText(
                0,
                last,
                range.end.charOffset,
                len - range.end.charOffset,
              ),
            );
          if (range.start.charOffset)
            checked(output.deleteText(0, 0, 0, range.start.charOffset));
        }
        const names = slotNames(output);
        return {
          bytes: new Uint8Array(output.exportHwpx()),
          slot_names: names,
          slot_count: names.length,
          preview: documentText(output).slice(0, 1800),
        };
      } finally {
        output.free();
      }
    } finally {
      fragment?.free();
      source.free();
    }
  }
  scanDocument() {
    const b = this.bridge(),
      d = b.wasm.borrowDocumentHandle();
    return paragraphRecords(d)
      .filter((r) => !inCell(r.target))
      .map((r, index) => {
        const tables = [...r.node.getElementsByTagNameNS("*", "tbl")].length;
        return {
          index,
          position: clone(r.target),
          kind: r.target.note
            ? r.target.note.kind === "endNote"
              ? "미주"
              : "각주"
            : r.target.hf
              ? r.target.hf.isHeader
                ? "머리말"
                : "꼬리말"
              : tables
                ? "표"
                : "문단",
          preview:
            r.text.trim().slice(0, 140) ||
            (tables ? `표 ${tables}개` : "빈 문단"),
          length: lengthAt(d, r.target),
        };
      });
  }
  async inspectFile(bytes) {
    const live = this.bridge().wasm.borrowDocumentHandle(),
      d = new live.constructor(bytes);
    try {
      d.convertToEditable();
      const names = slotNames(d);
      return {
        slot_names: names,
        slot_count: names.length,
        preview: documentText(d).slice(0, 3000),
      };
    } finally {
      d.free();
    }
  }
  currentFormat() {
    const context = this.capture();
    if (inSubdocument(context.position)) {
      const stage = stageSubdocument(
        this.bridge().wasm.borrowDocumentHandle(),
        context.position,
      );
      try {
        const p = stage.map(context.position),
          d = stage.document;
        const char = charProps(d, p),
          para = paraProps(d, p);
        const native = new NativePalette(
          () => ({
            input: {
              cursor: {},
              getCursorPosition: () => p,
              getSelection: () => null,
              getCharProperties: () => char,
              getParaProperties: () => ({
                ...para,
                indent: (para.indent * 96) / 14400,
                marginLeft: (para.marginLeft * 96) / 14400,
                marginRight: (para.marginRight * 96) / 14400,
              }),
            },
          }),
          this.store,
        );
        return native.currentFormat();
      } finally {
        stage.document.free();
      }
    }
    const b = this.bridge(),
      char = b.input.getCharProperties(),
      para = b.input.getParaProperties();
    return [
      { func: "글씨체", value: char.fontFamily },
      { func: "글씨크기", value: char.fontSize / 100 },
      { func: "자간", value: char.spacings?.[0] || 0 },
      { func: "글자색", value: char.textColor },
      { func: "굵게", value: char.bold },
      { func: "기울임", value: char.italic },
      { func: "밑줄", value: char.underline },
      { func: "줄간격", value: para.lineSpacing },
      {
        func:
          para.alignment === "center"
            ? "가운데정렬"
            : para.alignment === "left"
              ? "왼쪽정렬"
              : "양쪽정렬",
      },
      {
        func: para.indent < 0 ? "내어쓰기" : "들여쓰기",
        value: (Math.abs(para.indent) * 72) / 96,
      },
      { func: "왼쪽여백", value: (para.marginLeft * 25.4) / 96 },
      { func: "오른쪽여백", value: (para.marginRight * 25.4) / 96 },
      { func: "어절단위 줄바꿈", value: para.koreanBreakUnit === 0 },
    ];
  }
  async insertNote({ endnote = false, context = this.capture() } = {}) {
    const b = this.assertContext(context),
      d = b.wasm.borrowDocumentHandle();
    if (inSubdocument(context.position) || inCell(context.position))
      throw new Error("각주 번호를 넣을 본문 위치를 선택해주세요.");
    return b.transaction("palette-note-insert", (input) => {
      const p = context.position;
      const result = checked(
        (endnote ? d.insertEndnote : d.insertFootnote).call(
          d,
          p.sectionIndex,
          p.paragraphIndex,
          p.charOffset,
        ),
      );
      const controlIndex = result.controlIdx ?? result.controlIndex;
      input.cursor.clearSelection();
      input.cursor.enterFootnoteMode(
        p.sectionIndex,
        p.paragraphIndex,
        controlIndex,
        0,
        0,
      );
      input.cursor.setFnCursorPosition(0, 2);
      return result;
    });
  }
  async deleteNote(context = this.capture()) {
    const b = this.assertContext(context),
      d = b.wasm.borrowDocumentHandle(),
      p = context.position;
    if (!p.note) throw new Error("지울 각주 또는 미주 안에 커서를 놓아주세요.");
    return b.transaction("palette-note-delete", (input) => {
      const result = checked(
        d.deleteFootnote(
          p.sectionIndex,
          p.note.parentParaIndex,
          p.note.controlIndex,
        ),
      );
      input.cursor.exitFootnoteMode();
      input.cursor.clearSelection();
      return result;
    });
  }
}
