// HwpPalette spreadsheet pathways (AGPL-3.0); OOXML, no remote service.
import { CATALOG } from "./catalog.js?v=1.7.0-four-session-integration";
import { zipSync, unzipSync } from "../../vendor/fflate/index.js";
import { unzipPalette, libraryLookup } from "./model.js?v=1.7.0-four-session-integration";
const enc = new TextEncoder(),
  dec = new TextDecoder("utf-8", { fatal: true });
const esc = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const wrapLabel = (label) =>
  String.fromCharCode(92) + label + String.fromCharCode(92);
const sheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
export const QUESTION_HEADERS = CATALOG.excelHeaders;
export function xmlDocument(bytes) {
  const doc = new DOMParser().parseFromString(
    typeof bytes === "string" ? bytes : dec.decode(bytes),
    "application/xml",
  );
  if (doc.querySelector("parsererror"))
    throw new Error("문서 안의 XML이 손상됐습니다.");
  return doc;
}
const local = (node, name) =>
  Array.from(node.getElementsByTagNameNS("*", name));
export function readWorkbook(bytes) {
  const files = unzipPalette(bytes);
  if (!files["xl/workbook.xml"] || !files["xl/_rels/workbook.xml.rels"])
    throw new Error("XLSX 또는 XLSM 파일을 선택해주세요.");
  const workbook = xmlDocument(files["xl/workbook.xml"]),
    rels = xmlDocument(files["xl/_rels/workbook.xml.rels"]);
  const paths = new Map(
    local(rels, "Relationship").map((r) => [
      r.getAttribute("Id"),
      r.getAttribute("Target"),
    ]),
  );
  const strings = files["xl/sharedStrings.xml"]
    ? local(xmlDocument(files["xl/sharedStrings.xml"]), "si").map((n) =>
        local(n, "t")
          .map((t) => t.textContent)
          .join(""),
      )
    : [];
  const sheets = new Map();
  for (const sheet of local(workbook, "sheet")) {
    const rid = sheet.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ),
      target = paths.get(rid);
    if (!target) throw new Error("엑셀 시트 연결 정보가 없습니다.");
    const path = target.startsWith("/")
      ? target.slice(1)
      : "xl/" + target.replace(/^\.\//, "");
    if (!files[path]) throw new Error("엑셀 시트가 없습니다.");
    const doc = xmlDocument(files[path]),
      rows = [];
    for (const row of local(doc, "row")) {
      const cells = [];
      for (const c of local(row, "c")) {
        const address = c.getAttribute("r") || "A1",
          letters = /^[A-Z]+/.exec(address)?.[0] || "A";
        let col = 0;
        for (const char of letters) col = col * 26 + char.charCodeAt(0) - 64;
        const kind = c.getAttribute("t"),
          v = local(c, "v")[0]?.textContent || "";
        cells[col - 1] =
          kind === "s"
            ? strings[+v] || ""
            : kind === "inlineStr"
              ? local(c, "t")
                  .map((t) => t.textContent)
                  .join("")
              : v;
      }
      rows[Math.max(0, (+row.getAttribute("r") || rows.length + 1) - 1)] =
        cells;
    }
    sheets.set(sheet.getAttribute("name"), rows);
  }
  return { sheets, files };
}
const letters = (n) => {
  let s = "";
  for (n++; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
function sheetXml(rows, validations = []) {
  const validationXml = validations.length
    ? `<dataValidations count="${validations.length}">${validations.map((v) => `<dataValidation type="list" allowBlank="1" showErrorMessage="${v.strict ? 1 : 0}" error="목록에서 골라 주세요" sqref="${esc(v.range)}"><formula1>${esc(v.formula)}</formula1></dataValidation>`).join("")}</dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${sheetNs}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="10" width="32" customWidth="1"/></cols><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${letters(c)}${r + 1}" t="inlineStr" s="${r ? 0 : 1}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`).join("")}</row>`).join("")}</sheetData>${validationXml}</worksheet>`;
}
export function buildWorkbook(
  sheets,
  { hidden = [], validations = {}, definedNames = {} } = {},
) {
  const entries = {},
    items = [...sheets],
    types = items
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("");
  entries["[Content_Types].xml"] = enc.encode(
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${types}</Types>`,
  );
  entries["_rels/.rels"] = enc.encode(
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  entries["xl/workbook.xml"] = enc.encode(
    `<workbook xmlns="${sheetNs}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${items.map(([name], i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"${hidden.includes(name) ? ' state="hidden"' : ""}/>`).join("")}</sheets>${
      Object.keys(definedNames).length
        ? `<definedNames>${Object.entries(definedNames)
            .map(
              ([name, formula]) =>
                `<definedName name="${esc(name)}">${esc(formula)}</definedName>`,
            )
            .join("")}</definedNames>`
        : ""
    }</workbook>`,
  );
  entries["xl/_rels/workbook.xml.rels"] = enc.encode(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${items.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  entries["xl/styles.xml"] = enc.encode(
    `<styleSheet xmlns="${sheetNs}"><fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf></cellXfs></styleSheet>`,
  );
  items.forEach(
    ([name, rows], i) =>
      (entries[`xl/worksheets/sheet${i + 1}.xml`] = enc.encode(
        sheetXml(rows, validations[name]),
      )),
  );
  return new Blob([zipSync(entries)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
export const escapeSlot = (text) =>
  /\\[^\s\\{}]+\{/.test(text) ? text : text.replaceAll("}", "\\}");
export function cellMarkdown(text) {
  const s = escapeSlot(String(text || "").trim())
    .split("\n")
    .map((line) =>
      line.replace(
        /^(\s*(?:번호|발문|문|자료|사진자료|실험자료|질문|보기|선지[135]?)):/,
        "$1 :",
      ),
    )
    .join("\n");
  return !s ? "-" : s.includes("\n") ? `{${s}}` : s;
}
export function blocksToMarkdown(blocks) {
  const md = [],
    report = [],
    answers = [];
  blocks.forEach(([label, slots], i) => {
    md.push(`\\${label}\\`, ...slots.map(([, v]) => cellMarkdown(v)), "");
    report.push(
      `${i + 1}. ${label} — ${slots.filter(([, v]) => String(v || "").trim()).length}/${slots.length}칸 채움`,
    );
    answers.push([
      i + 1,
      label,
      slots.find(([name]) => name.replace(/\d+$/, "") === "정답")?.[1] || "",
      slots.find(([name]) => name.replace(/\d+$/, "") === "배점")?.[1] || "",
    ]);
  });
  return {
    markdown: md.join("\n").trim() + (md.length ? "\n" : ""),
    report,
    answers,
  };
}
export function slotNamesFor(label, item) {
  const names = item.slot_names || [];
  if (names.length === item.slot_count && names.every(Boolean)) return names;
  if (item._mix_items)
    return item._mix_items.flatMap((m) =>
      slotNamesFor(m.label, m).length
        ? slotNamesFor(m.label, m)
        : Array.from({ length: m.slot_count }, (_, i) => `${m.name}${i + 1}`),
    );
  return CATALOG.excelTemplates[label] || [];
}
export function excelStyles(state) {
  const lookup = libraryLookup(state),
    styles = {};
  for (const [q, options] of Object.entries(CATALOG.excelStyles))
    styles[q] = options
      .filter(([, mapping]) =>
        Object.values(mapping)
          .filter(Boolean)
          .every((l) => lookup.has(l)),
      )
      .map(([name]) => name);
  if (
    lookup.has("학교합답0사진5선지") &&
    lookup.has("학교합답1사진5선지") &&
    lookup.has("학교합답2사진5선지") &&
    !styles["합답형"].includes("학교 5지선다")
  )
    styles["합답형"].unshift("학교 5지선다");
  return styles;
}
export function buildQuestionWorkbook(state, styles = {}) {
  const defaults = excelStyles(state),
    photos = state.photos.map((p) => p.label),
    list = [
      ["사진 이름", "", "유형", "스타일"],
      ...Object.keys(defaults).map((q, i) => [
        photos[i] || "",
        "",
        q,
        styles[q] || defaults[q][0] || "",
      ]),
    ];
  for (let i = 3; i < photos.length; i++) list.push([photos[i]]);
  return buildWorkbook(
    new Map([
      [
        "문항",
        [
          QUESTION_HEADERS,
          ...Array.from({ length: 25 }, () =>
            Array(QUESTION_HEADERS.length).fill(""),
          ),
        ],
      ],
      ["목록", list],
      [
        "읽어보세요",
        [
          [
            "작성 방법",
            "한 줄에 한 문항을 작성합니다. 보기와 선지는 줄바꿈으로 구분합니다.",
          ],
          [
            "그림",
            "자료에는 확장자 없는 그림 이름을 씁니다. 두 장은 쉼표로 구분합니다.",
          ],
          ["스타일", "목록 시트의 유형별 스타일을 기준으로 출력합니다."],
        ],
      ],
    ]),
    {
      hidden: ["목록"],
      validations: {
        문항: [
          ...Object.entries({
            유형: [Object.keys(defaults), true],
            정답: [["①", "②", "③", "④", "⑤"], false],
            배점: [["2", "3", "4", "5", "6"], false],
          }).map(([name, [values, strict]]) => ({
            range: `${letters(QUESTION_HEADERS.indexOf(name))}2:${letters(QUESTION_HEADERS.indexOf(name))}26`,
            formula: '"' + values.join(",") + '"',
            strict,
          })),
          ...(photos.length
            ? [{ range: "E2:E26", formula: "PictureNames", strict: false }]
            : []),
        ],
      },
      definedNames: photos.length
        ? { PictureNames: `'목록'!$A$2:$A$${photos.length + 1}` }
        : {},
    },
  );
}
export function workbookToMarkdown(bytes, state) {
  const { sheets } = readWorkbook(bytes),
    vertical = sheets.get("시험지");
  if (vertical) {
    const blocks = [];
    let cur = null;
    for (const row of vertical.slice(1)) {
      const a = String(row?.[0] || "").trim(),
        b = String(row?.[1] || "");
      if (a.startsWith("▶")) {
        cur = [a.replace(/^▶+/, "").trim(), []];
        blocks.push(cur);
      } else if (a && cur) cur[1].push([a, b]);
      else if (!a) cur = null;
    }
    return blocksToMarkdown(blocks);
  }
  const rows = sheets.get("문항") || sheets.get("문항 작성");
  if (!rows?.length) throw new Error("문항 시트가 비어 있습니다.");
  const headers = rows[0].map((v) => String(v || "").trim());
  if (!headers.includes("발문"))
    throw new Error("첫 행에 발문 열이 있어야 합니다.");
  const items = rows
    .slice(1)
    .map((cells, i) => ({
      ...Object.fromEntries(
        headers.map((key, c) => [
          key,
          String(cells?.[c] ?? "")
            .replace(/\r\n?/g, "\n")
            .trim(),
        ]),
      ),
      _row: i + 2,
    }))
    .filter((r) => r.발문 || r.지문 || r.선지);
  items.sort((a, b) =>
    /^\d+$/.test(a.번호) && /^\d+$/.test(b.번호)
      ? +a.번호 - +b.번호
      : /^\d+$/.test(a.번호)
        ? -1
        : /^\d+$/.test(b.번호)
          ? 1
          : a._row - b._row,
  );
  const md = [],
    report = [`문항 ${items.length}개 읽음`],
    answers = [],
    lookup = libraryLookup(state),
    seen = new Set(),
    styles = Object.fromEntries(
      Object.entries(excelStyles(state)).map(([q, names]) => [q, names[0]]),
    );
  for (const row of sheets.get("목록")?.slice(1) || [])
    if (row?.[2] && row?.[3]) styles[row[2]] = row[3];
  const stripLines = (s, n) =>
    s
      .split("\n")
      .filter((x) => x.trim())
      .map((x) =>
        x.trim().replace(/^(?:[①-⑤]\s*|(?:[ㄱ-ㅎ]|\(?\d\)?)\s*[.)\]]\s+)/, ""),
      )
      .slice(0, n);
  for (let i = 0; i < items.length; i++) {
    const row = items[i],
      num = /^\d+$/.test(row.번호) ? +row.번호 : i + 1,
      type = ["합답형", "정답형", "서술형"].includes(row.유형)
        ? row.유형
        : row.보기
          ? "합답형"
          : row.선지
            ? "정답형"
            : "서술형",
      bogi = stripLines(row.보기 || "", 3),
      choices = stripLines(row.선지 || "", 5),
      photos = (row.자료 || "")
        .split(",")
        .map((x) => x.trim().replace(/\.(png|jpe?g|bmp|gif|tiff?)$/i, ""))
        .filter(Boolean)
        .slice(0, 2);
    if (seen.has(num)) report.push(`${num}번 번호가 겹칩니다.`);
    seen.add(num);
    if (!row.발문) report.push(`${row._row}행 발문이 비었습니다.`);
    if (type !== "서술형" && choices.length < 5)
      report.push(`${num}번 선지가 ${choices.length}개입니다.`);
    if (type === "합답형" && bogi.length < 3)
      report.push(`${num}번 보기가 ${bogi.length}개입니다.`);
    for (const photo of photos)
      if (lookup.get(photo)?.[0] !== "사진")
        report.push(`${num}번 그림 '${photo}'을 찾지 못했습니다.`);
    const mapping =
        CATALOG.excelStyles[type]?.find(
          ([name]) => name === styles[type],
        )?.[1] || {},
      selected =
        row.템플릿 ||
        row.스타일 ||
        (lookup.get(row.유형)?.[0] === "템플릿" ? row.유형 : null) ||
        (type === "합답형" &&
        styles[type] === "학교 5지선다" &&
        photos.length === 0 &&
        lookup.has("학교합답0사진5선지")
          ? "학교합답0사진5선지"
          : mapping[photos.length]),
      entry = lookup.get(selected),
      item = entry?.[0] === "템플릿" ? entry[1] : null,
      names = item ? slotNamesFor(selected, item) : [];
    if (names.length) {
      const passage = row.지문 || "",
        ask = [
          row.발문,
          row.배점 && !names.includes("배점") ? `(${row.배점}점)` : "",
        ]
          .filter(Boolean)
          .join(" ");
      const val = (name) => {
        if (["번호", "문항번호"].includes(name)) return String(num);
        if (["지문", "문두"].includes(name)) return passage;
        if (["발문", "질문"].includes(name))
          return names.includes("지문")
            ? ask
            : [passage, ...photos.map((p) => wrapLabel(p)), ask]
                .filter(Boolean)
                .join("\n");
        if (name === "배점") return row.배점 || "";
        if (name === "정답") return row.정답 || "";
        const p = /^사진(\d+)$/.exec(name),
          b = /^보기([ㄱㄴㄷ]|\d+)$/.exec(name),
          c = /^선(?:지)?(\d+)$/.exec(name);
        if (p) return photos[+p[1] - 1] ? wrapLabel(photos[+p[1] - 1]) : "";
        if (b)
          return (
            bogi[/\d/.test(b[1]) ? +b[1] - 1 : "ㄱㄴㄷ".indexOf(b[1])] || ""
          );
        if (c) return choices[+c[1] - 1] || "";
        return row[name] || "";
      };
      md.push(
        wrapLabel(item.label) +
          "\n" +
          names.map((name) => cellMarkdown(val(name))).join("\n"),
      );
    } else if (type === "서술형")
      md.push(
        [
          row.지문,
          ...photos.map((p) => wrapLabel(p)),
          `${num}. ${row.발문 || ""}${row.배점 ? ` (${row.배점}점)` : ""}`,
          wrapLabel("표1*1"),
          "-",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    else {
      md.push(
        [
          `번호: ${num}`,
          `발문: ${[row.지문, row.발문, row.배점 ? `(${row.배점}점)` : ""].filter(Boolean).join(" ")}`,
          photos.length ? "자료:" : "",
          ...photos.map((p) => wrapLabel(p)),
          bogi.length ? "보기:" : "",
          ...bogi.map((b, j) => `${"ㄱㄴㄷ"[j]}: ${b}`),
          choices.length ? "선지1:" : "",
          ...choices,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      report.push(`${num}번 연결된 틀이 없어 기본 조판을 사용합니다.`);
    }
    answers.push([num, type, row.정답 || "", row.배점 || ""]);
  }
  return {
    markdown: md.join("\n\n") + (md.length ? "\n" : ""),
    report,
    answers,
  };
}
export const answerText = (answers) =>
  [["번호", "유형", "정답", "배점"], ...answers]
    .map((r) => r.join("\t"))
    .join("\n");
export function blockRows(blocks) {
  return [
    ["빈칸 이름", "내용"],
    ...blocks.flatMap(([label, slots]) => [
      [`▶ ${label}`, ""],
      ...slots,
      ["", ""],
    ]),
  ];
}
export function buildMacroWorkbook(bytes, state) {
  const book = readWorkbook(bytes),
    files = book.files,
    workbook = xmlDocument(files["xl/workbook.xml"]),
    rels = xmlDocument(files["xl/_rels/workbook.xml.rels"]),
    paths = new Map(
      local(rels, "Relationship").map((r) => [
        r.getAttribute("Id"),
        r.getAttribute("Target"),
      ]),
    );
  const hidden = local(workbook, "sheet").find(
    (s) => s.getAttribute("name") === "_꾸러미",
  );
  if (!hidden) throw new Error("덩어리 엑셀 틀에 꾸러미 시트가 없습니다.");
  const path =
    "xl/" +
    paths.get(
      hidden.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id",
      ),
    );
  const packs = [...libraryLookup(state)]
    .filter(([, e]) => e[0] === "템플릿" && e[1].slot_count > 0)
    .map(([label, [, it]]) => [label, slotNamesFor(label, it).join(",")]);
  files[path] = enc.encode(sheetXml([["꾸러미", "빈칸 이름"], ...packs]));
  const main = local(workbook, "sheet").find(
      (s) => s.getAttribute("name") === "시험지",
    ),
    mainPath =
      "xl/" +
      paths.get(
        main.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id",
        ),
      ),
    mainXml = xmlDocument(files[mainPath]);
  for (const n of local(mainXml, "dataValidations")) n.remove();
  const validations = mainXml.createElementNS(sheetNs, "dataValidations");
  validations.setAttribute("count", "1");
  const validation = mainXml.createElementNS(sheetNs, "dataValidation");
  validation.setAttribute("type", "list");
  validation.setAttribute("allowBlank", "1");
  validation.setAttribute("sqref", "B1");
  const formula = mainXml.createElementNS(sheetNs, "formula1");
  formula.textContent = "='_꾸러미'!$A$2:$A$" + Math.max(2, packs.length + 1);
  validation.append(formula);
  validations.append(validation);
  mainXml.documentElement.append(validations);
  files[mainPath] = enc.encode(new XMLSerializer().serializeToString(mainXml));
  return new Blob([zipSync(files)], {
    type: "application/vnd.ms-excel.sheet.macroEnabled.12",
  });
}
