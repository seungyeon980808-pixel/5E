// Editable HWPX subdocuments and cross-document native history. AGPL-3.0.
import { zipSync, unzipSync } from "../../vendor/fflate/index.js";
import { xmlDocument } from "./workbook.js?v=1.7.0-four-session-integration";

const adapters = new WeakMap();
const decode = (x) => (typeof x === "string" ? JSON.parse(x) : x);
const children = (node, name) =>
  [...(node?.children || [])].filter((n) => n.localName === name);
const paragraphs = (node) => children(node, "p");
const controls = (para) =>
  children(para, "run").flatMap((run) =>
    [...run.children].flatMap((n) =>
      n.localName === "ctrl" ? [...n.children] : [n],
    ),
  );
export const inSubdocument = (p) => !!(p.hf || p.note);
export const REPLACE_DETACHED = Symbol("palette.replaceDetachedDocument");
// Layout references use native control indices, while HWPX may serialize
// header/footer controls in a different order. Resolve by kind and ordinal.
export function headerFooterPosition(d, ref) {
  const hf = ref.headerFooter,
    kind = hf.kind === "header" ? "head" : "foot";
  let global = hf.outerParaIdx;
  for (let s = 0; s < ref.sec; s++) global += d.getParagraphCount(s);
  const native = decode(d.getControls()).filter(
    (c) => c.list === 0 && c.para === global && c.ctrlId === kind,
  );
  const ordinal = native.findIndex(
    (c) => c.controlIndex === hf.outerControlIdx,
  );
  const files = unzipSync(d.exportHwpx()),
    xml = xmlDocument(files[`Contents/section${ref.sec}.xml`]),
    owner = paragraphs(xml.documentElement)[hf.outerParaIdx],
    container = controls(owner).filter((c) => c.localName === hf.kind)[ordinal],
    applyTo = ["BOTH", "EVEN", "ODD"].indexOf(
      container?.getAttribute("applyPageType"),
    );
  if (ordinal < 0 || applyTo < 0)
    throw new Error("그림이 속한 머리말·꼬리말을 찾지 못했습니다.");
  return {
    sectionIndex: ref.sec,
    paragraphIndex: ref.ppi,
    charOffset: 0,
    hf: { isHeader: hf.kind === "header", applyTo },
    ...(ref.cellPath?.length
      ? { parentParaIndex: ref.ppi, cellPath: structuredClone(ref.cellPath) }
      : {}),
  };
}
export function withHeaderFooterPicture(d, ref, operation) {
  const original = headerFooterPosition(d, ref),
    stage = stageSubdocument(d, original);
  try {
    let position = stage.map(original);
    if (ref.cellPath?.length) {
      // The pinned renderer can omit intermediate nested table steps. Native
      // export names each image by its BinData ID; resolve the full path in the
      // lifted paragraph's XML rather than trusting that shortened layout path.
      const source = nativePicturePaint(d, ref),
        identity = sourceIdentity(source?.sourceImageKey);
      const files = unzipSync(stage.document.exportHwpx()),
        xml = xmlDocument(
          files[`Contents/section${position.sectionIndex}.xml`],
        );
      const candidates = [];
      function visit(para, path) {
        let ci = 0;
        for (const control of controls(para)) {
          if (["t", "lineSeg", "char"].includes(control.localName)) continue;
          if (
            control.localName === "pic" &&
            control
              .getElementsByTagNameNS("*", "img")[0]
              ?.getAttribute("binaryItemIDRef") === `image${identity}`
          )
            candidates.push({ ci, cellPath: path });
          if (control.localName === "tbl") {
            let cell = 0;
            for (const row of children(control, "tr"))
              for (const tc of children(row, "tc")) {
                paragraphs(children(tc, "subList")[0]).forEach((p, cp) =>
                  visit(p, [
                    ...path,
                    { controlIndex: ci, cellIndex: cell, cellParaIndex: cp },
                  ]),
                );
                cell++;
              }
          }
          ci++;
        }
      }
      visit(paragraphs(xml.documentElement)[position.parentParaIndex], []);
      const unique = candidates.filter(
        (c) =>
          c.ci === ref.ci &&
          ref.cellPath.every(
            (p, i) =>
              c.cellPath[i] &&
              p.controlIndex === c.cellPath[i].controlIndex &&
              p.cellIndex === c.cellPath[i].cellIndex &&
              p.cellParaIndex === c.cellPath[i].cellParaIndex,
          ),
      );
      if (unique.length !== 1)
        throw new Error(
          "머리말·꼬리말 표 안의 그림 위치를 정확히 확인하지 못했습니다.",
        );
      position = {
        ...position,
        cellPath: structuredClone(unique[0].cellPath),
        pictureControlIndex: unique[0].ci,
      };
    }
    return operation(stage, position);
  } finally {
    stage.document.free();
  }
}
// Source keys and image<ID> native export names belong to this pinned build.
function sourceIdentity(key) {
  if (!/^bin:\d+:\d+:(?:src|wmpng)$/.test(key || ""))
    throw new Error("그림의 원본 리소스 키를 확인하지 못했습니다.");
  return key.split(":")[2];
}
export function nativePicturePaint(d, ref) {
  for (const page of Number.isInteger(ref.pageIndex)
    ? [ref.pageIndex]
    : Array.from({ length: d.pageCount() }, (_, i) => i)) {
    const control = decode(d.getPageControlLayout(page)).controls?.find(
      (c) =>
        c.type === "image" &&
        c.secIdx === ref.sec &&
        c.paraIdx === ref.ppi &&
        c.controlIdx === ref.ci &&
        JSON.stringify(c.cellPath || []) ===
          JSON.stringify(ref.cellPath || []) &&
        JSON.stringify(c.headerFooter || null) ===
          JSON.stringify(ref.headerFooter || null),
    );
    if (!control) continue;
    const matches = (op) =>
      op.bbox &&
      [
        op.bbox.x - control.x,
        op.bbox.y - control.y,
        op.bbox.width - control.w,
        op.bbox.height - control.h,
      ].every((x) => Math.abs(x) <= 0.051);
    const flow = decode(d.getPageFlowImageOps(page));
    const image = flow.images?.find(matches);
    if (image) return image;
    const visit = (node) => {
      if (!node) return null;
      const op = node.ops?.find((x) => x.type === "image" && matches(x));
      if (op) return op;
      for (const child of [
        ...(node.children || []),
        ...(node.child ? [node.child] : []),
      ]) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };
    const imageOp = visit(
      decode(d.getPageLayerTreeWithProfile(page, "screen", true)).root,
    );
    if (imageOp) return imageOp;
  }
  throw new Error("그림의 원본 표시 정보를 찾지 못했습니다.");
}
export function nativePictureBytes(d, ref) {
  if (ref.headerFooter)
    return d.getSourceImageBytes(nativePicturePaint(d, ref).sourceImageKey);
  return d.getControlImageData(
    ref.sec,
    ref.ppi,
    JSON.stringify(ref.cellPath || []),
    ref.ci,
  );
}
export function detachedDocument(Document, bytes, headerSection = null) {
  let handle = new Document(bytes);
  try {
    handle.convertToEditable();
  } catch (error) {
    handle.free();
    throw error;
  }
  const replace = (bytes) => {
    const next = new Document(bytes);
    try {
      next.convertToEditable();
    } catch (error) {
      next.free();
      throw error;
    }
    const previous = handle;
    handle = next;
    previous.free();
  };
  return new Proxy(handle, {
    get: (_, key) => {
      if (key === REPLACE_DETACHED) return replace;
      if (key === "getColumnDef" && headerSection != null)
        return (sec) =>
          sec === headerSection
            ? JSON.stringify({
                ...decode(handle.getColumnDef(sec)),
                columnCount: 1,
                spacing: 0,
              })
            : handle.getColumnDef(sec);
      if (key === "constructor") return Document;
      return typeof handle[key] === "function"
        ? handle[key].bind(handle)
        : handle[key];
    },
  });
}
export function stageDocument(d) {
  const Document = d.constructor,
    document = detachedDocument(Document, d.exportHwpx());
  return {
    document,
    map: (position) => structuredClone(position),
    finish(position) {
      const next = new Document(document.exportHwpx());
      try {
        next.convertToEditable();
        return { document: next, position: structuredClone(position) };
      } catch (error) {
        next.free();
        throw error;
      }
    },
  };
}

// The pinned Studio exposes its native handle through borrowDocumentHandle().
// Keep native snapshots with their owning handle when a staged HWPX edit swaps
// that handle. Regular typing still uses native snapshots, without serializing
// the document for every keystroke. Retired handles live only as long as history.
export function installDocumentHistory(wasm) {
  if (adapters.has(wasm)) return adapters.get(wasm);
  if (wasm.doc !== wasm.borrowDocumentHandle())
    throw new Error("한글 문서 교체 경로가 달라졌습니다.");
  const snapshots = new Map(),
    retired = new Set();
  let nextId = 0x80000000;
  const current = () => wasm.borrowDocumentHandle();
  const collect = () => {
    const referenced = new Set([...snapshots.values()].map((s) => s.document));
    for (const doc of retired)
      if (doc !== current() && !referenced.has(doc)) {
        retired.delete(doc);
        doc.free();
      }
  };
  const reset = () => {
    for (const { document, id } of snapshots.values())
      document.discardSnapshot(id);
    snapshots.clear();
    collect();
    // The native loader owns the current handle and may free it immediately.
    retired.delete(current());
  };
  const nativeRestore = wasm.restoreSnapshot.bind(wasm),
    nativeDiscard = wasm.discardSnapshot.bind(wasm);
  wasm.saveSnapshot = () => {
    const document = current(),
      id = document.saveSnapshot(),
      key = nextId++;
    snapshots.set(key, { document, id });
    return key;
  };
  wasm.restoreSnapshot = (key) => {
    const entry = snapshots.get(key);
    if (!entry) {
      if (key < 0x80000000) return nativeRestore(key);
      throw new Error("이 문서의 취소 기록이 더 이상 유효하지 않습니다.");
    }
    const before = current();
    try {
      entry.document.restoreSnapshot(entry.id);
      if (before !== entry.document) {
        retired.add(before);
        wasm.doc = entry.document;
        wasm._documentDigest = null;
      }
      collect();
    } catch (error) {
      wasm.doc = before;
      throw error;
    }
  };
  wasm.discardSnapshot = (key) => {
    const entry = snapshots.get(key);
    if (!entry) {
      if (key < 0x80000000) return nativeDiscard(key);
      return;
    }
    entry.document.discardSnapshot(entry.id);
    snapshots.delete(key);
    collect();
  };
  for (const name of [
    "loadDocument",
    "loadDocumentWithPassword",
    "createNewDocument",
    "destroy",
  ]) {
    if (typeof wasm[name] !== "function") continue;
    const original = wasm[name].bind(wasm);
    wasm[name] = (...args) => {
      // Parse/validation must happen before a failed open invalidates history.
      if (name.startsWith("loadDocument")) {
        const D = current()?.constructor;
        if (D) {
          const probe =
            name === "loadDocumentWithPassword"
              ? D.openWithPassword(args[0], args[1])
              : new D(args[0]);
          try {
            probe.convertToEditable();
          } finally {
            probe.free();
          }
        }
      }
      reset();
      return original(...args);
    };
  }
  const adapter = {
    adopt(document) {
      const before = current();
      if (before === document) return;
      document.setFileName?.(wasm.fileName);
      retired.add(before);
      wasm.doc = document;
      wasm._documentDigest = null;
      collect();
    },
    reset,
    stats: () => ({ snapshots: snapshots.size, retired: retired.size }),
  };
  adapters.set(wasm, adapter);
  return adapter;
}

function locator(d, p) {
  if (p.hf) return { hf: p.hf };
  const note = { ...p.note };
  if (note.ordinal == null) {
    let global = note.parentParaIndex;
    for (let s = 0; s < p.sectionIndex; s++) global += d.getParagraphCount(s);
    const list = decode(d.getControls()).filter(
      (c) =>
        c.list === 0 && c.para === global && ["fn", "en"].includes(c.ctrlId),
    );
    const control = list.find((c) => c.controlIndex === note.controlIndex);
    if (!control) throw new Error("각주 위치를 찾지 못했습니다.");
    note.kind = control.ctrlId === "en" ? "endNote" : "footNote";
    note.ordinal = list
      .filter((c) => c.ctrlId === control.ctrlId)
      .indexOf(control);
  }
  return { note };
}
function subList(xml, location) {
  let control;
  if (location.hf) {
    const { isHeader, applyTo } = location.hf;
    control = [
      ...xml.getElementsByTagNameNS("*", isHeader ? "header" : "footer"),
    ].find(
      (n) =>
        n.getAttribute("applyPageType") === ["BOTH", "EVEN", "ODD"][applyTo],
    );
  } else {
    const n = location.note,
      owner = paragraphs(xml.documentElement)[n.parentParaIndex];
    control = controls(owner).filter((c) => c.localName === n.kind)[n.ordinal];
  }
  const sub = children(control, "subList")[0];
  if (!sub) throw new Error("편집할 머리말·꼬리말 또는 각주가 없습니다.");
  return sub;
}

// Lift only this container into temporary body paragraphs of a detached copy.
// The normal native APIs edit tables, equations, pictures and nested cells there.
// Splice the edited paragraphs back before adopting; temporary body content never
// becomes visible or enters project autosave. All resource IDs come from the same
// native document, including newly imported fonts, styles and binary images.
export function stageSubdocument(d, p) {
  const files = unzipSync(d.exportHwpx()),
    name = `Contents/section${p.sectionIndex}.xml`,
    xml = xmlDocument(files[name]);
  const location = locator(d, p),
    sub = subList(xml, location),
    root = xml.documentElement,
    start = paragraphs(root).length;
  for (const para of paragraphs(sub)) {
    const lifted = para.cloneNode(true);
    // Newly created headers may export a paragraph without any run. The native
    // HWPX parser drops that empty paragraph; retain an explicit empty text run
    // so its mapped editing position exists before inserting the first object.
    if (!children(lifted, "run").length) {
      const run = xml.createElementNS(lifted.namespaceURI, "hp:run"),
        text = xml.createElementNS(lifted.namespaceURI, "hp:t");
      run.setAttribute("charPrIDRef", "0");
      run.append(text);
      lifted.append(run);
    }
    root.append(lifted);
  }
  const encode = (xml) =>
    new TextEncoder().encode(new XMLSerializer().serializeToString(xml));
  files[name] = encode(xml);
  const staged = detachedDocument(
    d.constructor,
    zipSync(files),
    p.hf ? p.sectionIndex : null,
  );
  const map = (position) => {
    const out = structuredClone(position),
      inner = out.cellPath?.length ? out.parentParaIndex : out.paragraphIndex;
    delete out.hf;
    delete out.note;
    if (out.cellPath?.length) out.parentParaIndex = start + inner;
    else out.paragraphIndex = start + inner;
    return out;
  };
  const unmap = (position, document) => {
    const out = structuredClone(position);
    if (out.cellPath?.length) out.parentParaIndex -= start;
    else out.paragraphIndex -= start;
    Object.assign(out, structuredClone(location));
    if (out.note) {
      let global = out.note.parentParaIndex;
      for (let s = 0; s < p.sectionIndex; s++)
        global += document.getParagraphCount(s);
      const kind = out.note.kind === "endNote" ? "en" : "fn";
      const control = decode(document.getControls()).filter(
        (c) => c.list === 0 && c.para === global && c.ctrlId === kind,
      )[out.note.ordinal];
      if (!control) throw new Error("편집한 각주를 다시 찾지 못했습니다.");
      out.note.controlIndex = control.controlIndex;
    }
    return out;
  };
  return {
    document: staged,
    map,
    start,
    location,
    finish(position) {
      const output = unzipSync(staged.exportHwpx()),
        updated = xmlDocument(output[name]);
      const target = subList(updated, location),
        lifted = paragraphs(updated.documentElement).slice(start);
      for (const para of paragraphs(target)) para.remove();
      for (const para of lifted) target.append(para);
      output[name] = encode(updated);
      const next = new d.constructor(zipSync(output));
      try {
        next.convertToEditable();
        return {
          document: next,
          position: position ? unmap(position, next) : null,
        };
      } catch (error) {
        next.free();
        throw error;
      }
    },
  };
}
