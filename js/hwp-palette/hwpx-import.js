// Resource-preserving HWPX import for note/numbering controls rejected by the
// pinned paragraph-block API. The native parser validates the assembled package.
import { zipSync, unzipSync } from "../../vendor/fflate/index.js";
import { xmlDocument } from "./workbook.js?v=1.7.0-four-session-integration";
const encode = (node) =>
  new TextEncoder().encode(new XMLSerializer().serializeToString(node));
const kids = (node, tag) =>
  [...(node?.children || [])].filter((n) => !tag || n.localName === tag);
const all = (node, tag) => [...node.getElementsByTagNameNS("*", tag)];
const signature = (node, omitId = false) =>
  JSON.stringify([
    node.namespaceURI,
    node.localName,
    [...node.attributes]
      .filter(
        (a) =>
          a.prefix !== "xmlns" &&
          a.name !== "xmlns" &&
          !(omitId && a.name === "id"),
      )
      .map((a) => [a.name, a.value])
      .sort((a, b) => a[0].localeCompare(b[0])),
    [...node.childNodes].map((n) =>
      n.nodeType === 1
        ? signature(n)
        : n.nodeType === 3 && n.textContent.trim()
          ? n.textContent
          : "",
    ),
  ]);
const sameBytes = (a, b) =>
  a?.length === b?.length && a.every((v, i) => v === b[i]);
const references = {
  charPrIDRef: "charPr",
  paraPrIDRef: "paraPr",
  styleIDRef: "style",
  nextStyleIDRef: "style",
  borderFillIDRef: "borderFill",
  tabPrIDRef: "tabPr",
  outlineShapeIDRef: "numbering",
  memoShapeIDRef: "memoPr",
  bulletIDRef: "bullet",
  numberingIDRef: "numbering",
};
const languages = {
  hangul: "HANGUL",
  latin: "LATIN",
  hanja: "HANJA",
  japanese: "JAPANESE",
  other: "OTHER",
  symbol: "SYMBOL",
  user: "USER",
};

export function importHwpxParagraphs(
  target,
  source,
  sectionIndex,
  insertBefore,
  {
    sourceSection = 0,
    start = 0,
    end = source.getParagraphCount(sourceSection),
  } = {},
) {
  const dst = unzipSync(target.exportHwpx()),
    src = unzipSync(source.exportHwpx());
  const targetHeader = xmlDocument(dst["Contents/header.xml"]),
    sourceHeader = xmlDocument(src["Contents/header.xml"]);
  const targetContent = xmlDocument(dst["Contents/content.hpf"]),
    sourceContent = xmlDocument(src["Contents/content.hpf"]);
  const targetRef = all(targetHeader, "refList")[0],
    sourceRef = all(sourceHeader, "refList")[0];
  if (!targetRef || !sourceRef)
    throw new Error("조각의 한글 서식 목록이 없습니다.");
  const maps = new Map(),
    binary = new Map();
  const manifest = all(targetContent, "manifest")[0],
    targetItems = all(targetContent, "item");
  if (!manifest) throw new Error("한글 문서의 그림 목록이 없습니다.");
  const ids = new Set(targetItems.map((n) => n.getAttribute("id")));
  let assetNumber = 0;
  for (const item of all(sourceContent, "item")) {
    const path = item.getAttribute("href");
    if (!path?.startsWith("BinData/")) continue;
    const bytes = src[path];
    if (!bytes) throw new Error(`조각의 그림 데이터가 없습니다: ${path}`);
    const existing = targetItems.find(
      (n) =>
        n.getAttribute("href")?.startsWith("BinData/") &&
        n.getAttribute("media-type") === item.getAttribute("media-type") &&
        sameBytes(dst[n.getAttribute("href")], bytes),
    );
    if (existing) {
      binary.set(item.getAttribute("id"), existing.getAttribute("id"));
      continue;
    }
    let id;
    do {
      id = `palette_asset_${assetNumber++}`;
    } while (ids.has(id));
    ids.add(id);
    const extension = /\.([A-Za-z0-9]+)$/.exec(path)?.[1] || "bin",
      name = `BinData/${id}.${extension}`;
    dst[name] = bytes;
    const added = item.cloneNode(true);
    added.setAttribute("id", id);
    added.setAttribute("href", name);
    manifest.append(added);
    targetItems.push(added);
    binary.set(item.getAttribute("id"), id);
  }
  const remap = (node) => {
    for (const element of [node, ...all(node, "*")])
      for (const attr of [...element.attributes]) {
        let family = references[attr.name];
        if (element.localName === "heading" && attr.name === "idRef")
          family =
            element.getAttribute("type") === "BULLET"
              ? "bullet"
              : ["NUMBER", "OUTLINE"].includes(element.getAttribute("type"))
                ? "numbering"
                : null;
        if (element.localName === "fontRef" && languages[attr.name])
          family = "font:" + languages[attr.name];
        const mapped = maps.get(family)?.get(attr.value);
        if (mapped != null) element.setAttribute(attr.name, mapped);
        if (["binaryItemIDRef", "binItemIDRef"].includes(attr.name)) {
          const id = binary.get(attr.value);
          if (!id)
            throw new Error(`조각의 그림 참조가 없습니다: ${attr.value}`);
          element.setAttribute(attr.name, id);
        }
      }
    return node;
  };
  const merge = (sourceParent, targetParent, family, tag) => {
    const definitions = kids(sourceParent, tag),
      current = kids(targetParent, tag),
      mapping = new Map();
    maps.set(family, mapping);
    let id =
      Math.max(-1, ...current.map((n) => Number(n.getAttribute("id")))) + 1;
    for (const definition of definitions) {
      const copy = remap(definition.cloneNode(true)),
        oldId = definition.getAttribute("id");
      // A style's next style may refer forward. Only deduplicate a self/default
      // reference whose destination is already known; remap all links afterwards.
      const next = copy.getAttribute("nextStyleIDRef");
      const selfNext = next === oldId;
      const candidates = current.filter(
        (n) => !next || selfNext || mapping.has(next),
      );
      const found = candidates.find((n) => {
        const probe = copy.cloneNode(true);
        if (selfNext)
          probe.setAttribute("nextStyleIDRef", n.getAttribute("id"));
        return signature(probe, true) === signature(n, true);
      });
      if (found) mapping.set(oldId, found.getAttribute("id"));
      else {
        mapping.set(oldId, String(id++));
      }
    }
    for (const definition of definitions) {
      const id = mapping.get(definition.getAttribute("id"));
      if (current.some((n) => n.getAttribute("id") === id)) continue;
      const copy = remap(definition.cloneNode(true));
      copy.setAttribute("id", id);
      targetParent.append(copy);
      current.push(copy);
    }
    targetParent.setAttribute("itemCnt", String(current.length));
  };
  const targetFonts = all(targetRef, "fontfaces")[0],
    sourceFonts = all(sourceRef, "fontfaces")[0];
  if (sourceFonts && !targetFonts)
    throw new Error("대상 문서의 글꼴 목록이 없습니다.");
  for (const face of kids(sourceFonts, "fontface")) {
    const language = face.getAttribute("lang");
    let targetFace = kids(targetFonts, "fontface").find(
      (n) => n.getAttribute("lang") === language,
    );
    if (!targetFace) {
      targetFace = face.cloneNode(false);
      targetFonts.append(targetFace);
    }
    merge(face, targetFace, "font:" + language, "font");
    targetFace.setAttribute("fontCnt", String(kids(targetFace, "font").length));
    targetFace.removeAttribute("itemCnt");
  }
  for (const [family, parent] of [
    ["borderFill", "borderFills"],
    ["charPr", "charProperties"],
    ["tabPr", "tabProperties"],
    ["numbering", "numberings"],
    ["bullet", "bullets"],
    ["paraPr", "paraProperties"],
    ["style", "styles"],
    ["memoPr", "memoProperties"],
  ]) {
    const sourceParent = kids(sourceRef, parent)[0];
    if (!sourceParent) continue;
    let targetParent = kids(targetRef, parent)[0];
    if (!targetParent) {
      targetParent = sourceParent.cloneNode(false);
      targetRef.append(targetParent);
    }
    merge(sourceParent, targetParent, family, family);
  }
  const sourceXML = xmlDocument(src[`Contents/section${sourceSection}.xml`]),
    targetName = `Contents/section${sectionIndex}.xml`,
    targetXML = xmlDocument(dst[targetName]);
  const sourceParas = kids(sourceXML.documentElement, "p"),
    targetParas = kids(targetXML.documentElement, "p");
  if (
    start < 0 ||
    end > sourceParas.length ||
    start >= end ||
    insertBefore < 0 ||
    insertBefore > targetParas.length
  )
    throw new Error("조각의 문단 범위가 올바르지 않습니다.");
  let paragraphId = Math.max(
    0,
    ...Object.keys(dst)
      .filter((k) => /^Contents\/section\d+\.xml$/.test(k))
      .flatMap((k) =>
        all(xmlDocument(dst[k]), "p").map(
          (n) => Number(n.getAttribute("id")) || 0,
        ),
      ),
  );
  const next = targetParas[insertBefore] || null;
  for (const para of sourceParas.slice(start, end)) {
    const added = remap(para.cloneNode(true));
    // Exporting a detached native document synthesizes a section definition.
    // A paragraph import must never copy that definition into the destination.
    for (const tag of [
      "secPr",
      "colPr",
      "header",
      "footer",
      "pageNum",
      "pageHiding",
    ])
      for (const node of all(added, tag)) node.remove();
    for (const p of [added, ...all(added, "p")])
      p.setAttribute("id", String(++paragraphId));
    targetXML.documentElement.insertBefore(added, next);
  }
  // HWPX exports synthesize a section definition in the first paragraph. Move
  // the destination's existing definition/columns there when inserting ahead of
  // it; retaining them on a later paragraph would create a second definition.
  const first = kids(targetXML.documentElement, "p")[0];
  let firstRun = kids(first, "run")[0];
  if (!firstRun) {
    firstRun = targetXML.createElementNS(first.namespaceURI, "hp:run");
    firstRun.setAttribute("charPrIDRef", "0");
    first.prepend(firstRun);
  }
  for (const tag of ["colPr", "secPr"]) {
    const original = targetParas.flatMap((p) => all(p, tag))[0];
    if (!original || first.contains(original)) continue;
    if (tag === "colPr") {
      const wrapper = targetXML.createElementNS(
        original.namespaceURI,
        "hp:ctrl",
      );
      wrapper.append(original);
      firstRun.prepend(wrapper);
    } else firstRun.prepend(original);
  }
  dst[targetName] = encode(targetXML);
  dst["Contents/header.xml"] = encode(targetHeader);
  dst["Contents/content.hpf"] = encode(targetContent);
  let bytes = zipSync(dst);
  const validated = new target.constructor(bytes);
  try {
    validated.convertToEditable();
    if (
      sourceParas
        .slice(start, end)
        .some((p) => all(p, "footNote").length || all(p, "endNote").length)
    ) {
      // Use the native insertion/deletion path to recalculate note numbers in
      // document order, just as a normal note insertion would. The temporary
      // paragraph is detached and is removed before the package is adopted.
      const index = validated.getParagraphCount(sectionIndex);
      validated.insertParagraph(sectionIndex, index);
      const inserted = JSON.parse(
        validated.insertFootnote(sectionIndex, index, 0),
      );
      if (inserted.ok === false) throw new Error(inserted.error);
      const removed = JSON.parse(
        validated.deleteFootnote(
          sectionIndex,
          index,
          inserted.controlIdx ?? inserted.controlIndex,
        ),
      );
      if (removed.ok === false) throw new Error(removed.error);
      validated.deleteParagraph(sectionIndex, index);
      bytes = validated.exportHwpx();
    }
  } finally {
    validated.free();
  }
  return { bytes, start: insertBefore, end: insertBefore + end - start };
}
