const assert = require("node:assert/strict");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const h = require("./helpers/rhwp-exam.cjs");
// 증거 파일을 쓰는 폴더는 Git에서 빠져 있어 새 작업 폴더엔 없다 — 먼저 만든다.
require("node:fs").mkdirSync("_work/palette-qa", { recursive: true });

async function exercise(page, origin) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await h.navigate(page, origin + "/?mode=pro&mobile=0&exam=1");
  await h.ready(page);
  await page.waitForSelector("#exam-palette [data-block]");
  const result = await page.evaluate(async () => {
    const { read, documentText, paragraphRecords } = await import(
      "/js/hwp-palette/native.js"
    );
    const { unzipSync, zipSync } = await import("/vendor/fflate/index.js");
    const { xmlDocument } = await import("/js/hwp-palette/workbook.js");
    const { bytesToBase64 } = await import("/js/hwp-palette/model.js");
    const n = window.fiveEHwpPalette.native,
      b = n.bridge();
    const d = () => b.wasm.borrowDocumentHandle();
    const xml = () =>
      new TextDecoder().decode(
        unzipSync(d().exportHwpx())["Contents/section0.xml"],
      );
    const region = (name) =>
      [
        ...xmlDocument(
          unzipSync(d().exportHwpx())["Contents/section0.xml"],
        ).getElementsByTagNameNS("*", name),
      ].map((node) => ({
        text: node.textContent,
        tables: node.getElementsByTagNameNS("*", "tbl").length,
        pictures: node.getElementsByTagNameNS("*", "pic").length,
        equations: node.getElementsByTagNameNS("*", "equation").length,
        numbers: node.getElementsByTagNameNS("*", "autoNum").length,
        number: node.getAttribute("number"),
      }));
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 16;
    canvas.getContext("2d").fillRect(0, 0, 32, 16);
    const image = new Uint8Array(
      await (
        await new Promise((resolve) => canvas.toBlob(resolve))
      ).arrayBuffer(),
    );
    await window.fiveEHwpPalette.store.update((s) => {
      s.photos.push({
        id: "subdoc-photo",
        asset: "subdoc-photo",
        label: "영역사진",
        extension: "png",
        width: 32,
        height: 16,
      });
      s.assets["subdoc-photo"] = bytesToBase64(image);
    });
    b.transaction("subdocument-seed", () => {
      d().insertText(0, 0, 0, "본문 보존");
      d().createHeaderFooter(0, true, 0);
      d().createHeaderFooter(0, false, 0);
      d().insertTextInHeaderFooter(0, true, 0, 0, 0, "머리말 시작");
      d().insertTextInHeaderFooter(0, false, 0, 0, 0, "꼬리말 시작");
      return b.input.getCursorPosition();
    });
    const out = {};
    for (const isHeader of [true, false]) {
      b.input.cursor.enterHeaderFooterMode(isHeader, 0, 0);
      b.input.cursor.setHfCursorPosition(0, 6);
      await n.executePlan({
        ops: [
          [
            "text",
            [{ text: "개체 앞" }, { formula: "x^2" }, { image: "영역사진" }],
          ],
          ["table", 1, 1, [["표 내용"]]],
          ["text", [{ text: "개체 뒤" }]],
        ],
        warnings: [],
      });
      out[isHeader ? "header" : "footer"] = xml();
      out[isHeader ? "headerRegion" : "footerRegion"] = region(
        isHeader ? "header" : "footer",
      )[0];
      b.input.performUndo();
      out[isHeader ? "headerUndo" : "footerUndo"] = xml();
      b.input.performRedo();
      out[isHeader ? "headerRedo" : "footerRedo"] = xml();
      b.input.cursor.exitHeaderFooterMode();
    }
    b.transaction("note-seed", () => {
      d().insertFootnote(0, 0, d().getParagraphLength(0, 0));
      const c = read(d().getControls()).find((c) => c.ctrlId === "fn");
      d().insertTextInFootnote(0, 0, c.controlIndex, 0, 2, "각주 시작");
      return b.input.getCursorPosition();
    });
    const note = read(d().getControls()).find((c) => c.ctrlId === "fn");
    out.noteInfo = read(d().getFootnoteInfo(0, 0, note.controlIndex));
    b.input.cursor.enterFootnoteMode(0, 0, note.controlIndex, 0, 0);
    b.input.cursor.setFnCursorPosition(0, 2);
    await n.insertChar("각주 추가");
    out.noteAfter = xml();
    await n.executePlan({
      ops: [
        ["table", 1, 1, [["각주 표"]]],
        ["text", [{ formula: "a over b" }, { text: "각주 끝" }]],
      ],
      warnings: [],
    });
    out.noteObjects = xml();
    out.noteRegion = region("footNote")[0];
    const capturedNote = await n.captureTemplate().catch((e) => {
      throw new Error(String(e) + " [capture note]");
    });
    out.noteCapture = capturedNote.preview;
    await n
      .applyFunctions([
        { func: "글씨크기", value: 12 },
        { func: "가운데정렬" },
        { func: "자간 자동조절", value: 20 },
      ])
      .catch((e) => {
        throw new Error(String(e) + " [note format]");
      });
    out.noteFormat = n.currentFormat();
    out.noteFormatXML = xml();
    b.input.cursor.exitFootnoteMode();
    b.input.cursor.enterHeaderFooterMode(true, 0, 0);
    const capturedHeader = await n.captureTemplate().catch((e) => {
      throw new Error(String(e) + " [capture header]");
    });
    out.headerCapture = capturedHeader.preview;
    const template = {
      id: "subdoc-captured",
      asset: "subdoc-captured",
      name: "영역조각",
      label: "영역조각",
    };
    await window.fiveEHwpPalette.store.update((s) => {
      s.assets[template.asset] = bytesToBase64(capturedHeader.bytes);
    });
    b.input.cursor.setHfCursorPosition(0, 0);
    await n.useItem(template).catch((e) => {
      throw new Error(String(e) + " [reuse header]");
    });
    out.reusedHeader = region("header")[0];
    const record = paragraphRecords(d()).find(
      (r) => r.target.hf?.isHeader && r.text === "표 내용",
    );
    const context = {
      ...n.capture(),
      position: record.target,
      selection: {
        start: record.target,
        end: { ...record.target, charOffset: 4 },
      },
    };
    await n.executePlan(
      { ops: [["table", 1, 1, [["중첩 머리말"]]]], warnings: [] },
      context,
    );
    out.nestedHeader = region("header")[0];
    const nested = paragraphRecords(d()).find(
      (r) => r.target.hf?.isHeader && r.text === "중첩 머리말",
    );
    await n.executePlan(
      {
        ops: [
          [
            "text",
            [{ text: "셀 그림" }, { image: "영역사진" }, { formula: "z^2" }],
          ],
        ],
        warnings: [],
      },
      { ...n.capture(), position: nested.target, selection: null },
    );
    out.nestedHeaderPicture = region("header")[0];
    // Seed slots in header/footer tables and note paragraphs. The caller supplies
    // values in exactly the same whole-document traversal order as HwpPalette.
    const files = unzipSync(d().exportHwpx()),
      section = xmlDocument(files["Contents/section0.xml"]);
    const hTable = [
      ...section.getElementsByTagNameNS("*", "header"),
    ][0].getElementsByTagNameNS("*", "tbl")[0];
    hTable.getElementsByTagNameNS("*", "t")[0].textContent = "\\머리칸\\";
    const fTable = [
      ...section.getElementsByTagNameNS("*", "footer"),
    ][0].getElementsByTagNameNS("*", "tbl")[0];
    fTable.getElementsByTagNameNS("*", "t")[0].textContent = "\\꼬리칸\\";
    const fn = section.getElementsByTagNameNS("*", "footNote")[0];
    [...fn.getElementsByTagNameNS("*", "t")].at(-1).textContent = "\\각주칸\\";
    files["Contents/section0.xml"] = new TextEncoder().encode(
      new XMLSerializer().serializeToString(section),
    );
    const slotItem = {
      id: "slot-source",
      asset: "slot-source",
      name: "영역빈칸",
    };
    await window.fiveEHwpPalette.store.update((s) => {
      s.assets[slotItem.asset] = bytesToBase64(zipSync(files));
    });
    const inspected = await n.inspectFile(zipSync(files));
    out.slots = inspected.slot_names;
    const values = inspected.slot_names.map((name) => [
      { text: name + " 채움" },
      { image: "영역사진" },
      { formula: "y^2" },
    ]);
    const prepared = await n.prepareItem(slotItem, values).catch((e) => {
      throw new Error(String(e) + " [fill slots]");
    });
    try {
      out.filled = new TextDecoder().decode(
        unzipSync(prepared.source.exportHwpx())["Contents/section0.xml"],
      );
    } finally {
      prepared.source.free();
    }
    b.input.cursor.exitHeaderFooterMode();
    n.focusPosition({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0 });
    await n.insertNote({ endnote: true });
    await n.insertChar("미주 내용");
    out.endnote = region("endNote");
    await n.deleteNote();
    out.deletedEndnote = region("endNote").length;
    b.input.performUndo();
    out.undoEndnoteDeletion = region("endNote");
    b.input.performRedo();
    out.redoEndnoteDeletion = region("endNote").length;
    // A foreign package deliberately reuses image/style IDs for different data.
    // Importing its body paragraph with a footnote must preserve both packages.
    const foreign = d().constructor.createEmpty();
    let foreignBytes;
    const whiteCanvas = document.createElement("canvas");
    whiteCanvas.width = 16;
    whiteCanvas.height = 16;
    whiteCanvas.getContext("2d").fillStyle = "white";
    whiteCanvas.getContext("2d").fillRect(0, 0, 16, 16);
    const white = new Uint8Array(
      await (
        await new Promise((resolve) => whiteCanvas.toBlob(resolve))
      ).arrayBuffer(),
    );
    try {
      foreign.createBlankDocument();
      foreign.insertText(0, 0, 0, "외부조각");
      foreign.applyCharFormat(
        0,
        0,
        0,
        4,
        JSON.stringify({
          fontFamily: "함초롬돋움",
          fontSize: 1700,
          bold: true,
          textColor: "#112233",
        }),
      );
      foreign.insertPicture(
        0,
        0,
        4,
        "[]",
        white,
        3200,
        3200,
        16,
        16,
        "png",
        "외부사진",
      );
      const added = read(foreign.insertFootnote(0, 0, 5));
      foreign.insertTextInFootnote(
        0,
        0,
        added.controlIdx ?? added.controlIndex,
        0,
        2,
        "외부 각주",
      );
      foreignBytes = new Uint8Array(foreign.exportHwpx());
    } finally {
      foreign.free();
    }
    const foreignItem = {
      id: "foreign-note",
      asset: "foreign-note",
      name: "외부각주조각",
    };
    await window.fiveEHwpPalette.store.update((s) => {
      s.assets[foreignItem.asset] = bytesToBase64(foreignBytes);
    });
    n.focusPosition({ sectionIndex: 0, paragraphIndex: 0, charOffset: 0 });
    await n.useItem(foreignItem);
    out.foreignNotes = region("footNote");
    out.foreignXML = xml();
    out.sectionDefinitions = xmlDocument(
      unzipSync(d().exportHwpx())["Contents/section0.xml"],
    ).getElementsByTagNameNS("*", "secPr").length;
    const importedFiles = unzipSync(d().exportHwpx());
    const bins = Object.entries(importedFiles)
      .filter(([name]) => name.startsWith("BinData/"))
      .map(([, data]) => data);
    const hasBytes = (bytes) =>
      bins.some(
        (data) =>
          data.length === bytes.length && data.every((v, i) => v === bytes[i]),
      );
    out.binary = { original: hasBytes(image), foreign: hasBytes(white) };
    const beforeFailure = xml(),
      revision = b.revision;
    b.input.cursor.enterHeaderFooterMode(false, 0, 0);
    try {
      await n.executePlan({
        ops: [
          ["text", [{ text: "残さない" }]],
          ["table", 0, 0, []],
        ],
        warnings: [],
      });
    } catch {
      out.failure = {
        unchanged: beforeFailure === xml(),
        revision: b.revision === revision,
      };
    }
    out.body = documentText(d());
    const reopened = new (d().constructor)(d().exportHwpx());
    try {
      reopened.convertToEditable();
      out.reopened = new TextDecoder().decode(
        unzipSync(reopened.exportHwpx())["Contents/section0.xml"],
      );
    } finally {
      reopened.free();
    }
    const hwp = new (d().constructor)(d().exportHwp());
    try {
      hwp.convertToEditable();
      out.hwpReopened = new TextDecoder().decode(
        unzipSync(hwp.exportHwpx())["Contents/section0.xml"],
      );
    } finally {
      hwp.free();
    }
    out.layout = Array.from(
      { length: d().pageCount() },
      (_, i) => read(d().getPageControlLayout(i)).controls,
    )
      .flat()
      .filter((c) => c.type === "image");
    out.previewHwpx = bytesToBase64(d().exportHwpx());
    out.previewHwp = bytesToBase64(d().exportHwp());
    return out;
  });
  require("node:fs").writeFileSync(
    "_work/palette-qa/subdoc-latest.json",
    JSON.stringify(result),
  );
  for (const key of [
    "header",
    "footer",
    "headerRedo",
    "footerRedo",
    "noteObjects",
    "reopened",
  ]) {
    assert.match(result[key], /<hp:tbl/);
    assert.match(result[key], /<hp:equation/);
  }
  assert.doesNotMatch(result.headerUndo, /<hp:tbl/);
  assert.match(result.noteAfter, /각주 추가/);
  assert.match(result.body, /본문 보존/);
  for (const key of ["headerRegion", "footerRegion"]) {
    assert.equal(result[key].tables, 1);
    assert.equal(result[key].pictures, 1);
    assert.equal(result[key].equations, 1);
  }
  assert.equal(result.noteRegion.tables, 1);
  assert.equal(result.noteRegion.equations, 1);
  assert.equal(result.noteRegion.numbers, 1);
  assert.match(result.noteCapture, /각주 표/);
  assert.equal(result.noteFormat.find((a) => a.func === "글씨크기").value, 12);
  assert.ok(result.noteFormat.some((a) => a.func === "가운데정렬"));
  assert.match(result.headerCapture, /표 내용/);
  assert.equal(result.reusedHeader.tables, 2);
  assert.equal(result.nestedHeader.tables, 3);
  assert.equal(result.nestedHeaderPicture.pictures, 3);
  assert.deepEqual(result.slots, ["머리칸", "꼬리칸", "각주칸"]);
  for (const name of result.slots)
    assert.match(result.filled, new RegExp(name + " 채움"));
  assert.doesNotMatch(result.filled, /\\(?:머리칸|꼬리칸|각주칸)\\/);
  assert.match(result.endnote[0].text, /미주 내용/);
  assert.equal(result.deletedEndnote, 0);
  assert.equal(result.redoEndnoteDeletion, 0);
  assert.match(result.undoEndnoteDeletion[0].text, /미주 내용/);
  assert.equal(result.foreignNotes.length, 2);
  assert.match(result.foreignNotes[0].text, /외부 각주/);
  assert.deepEqual(
    result.foreignNotes.map((n) => n.number),
    ["1", "2"],
  );
  assert.equal(result.sectionDefinitions, 1);
  assert.deepEqual(result.binary, { original: true, foreign: true });
  assert.deepEqual(result.failure, { unchanged: true, revision: true });
  for (const value of [
    "본문 보존",
    "외부조각",
    "외부 각주",
    "각주 표",
    "중첩 머리말",
  ])
    assert.match(result.hwpReopened, new RegExp(value));
  const reopened = [];
  for (const extension of ["hwpx", "hwp"]) {
    await h.nativeOpen(page, {
      name: `subdocuments.${extension}`,
      mimeType: "application/octet-stream",
      buffer: Buffer.from(
        extension === "hwpx" ? result.previewHwpx : result.previewHwp,
        "base64",
      ),
    });
    assert.equal(
      await page.locator("#exam-status").getAttribute("data-error"),
      "false",
      await page.locator("#exam-status").textContent(),
    );
    reopened.push(
      await page.evaluate(() => {
        const b = window.fiveEHwpPalette.native.bridge(),
          d = b.wasm.borrowDocumentHandle();
        const pics = b.documentPictures().filter((p) => p.ref.headerFooter);
        return {
          pictures: pics.map((p) => ({
            kind: p.ref.headerFooter.kind,
            cell: !!p.ref.cellPath?.length,
            bytes: b.pictureBytes(p.ref).length,
            mime: b.pictureMime(p.ref),
            width: b.properties(p.ref).width,
          })),
          svg: d.renderPageSvg(0),
        };
      }),
    );
    assert.ok(
      reopened.at(-1).pictures.some((p) => p.cell),
      "header cell picture is exposed to 5E",
    );
    assert.ok(reopened.at(-1).pictures.some((p) => p.kind === "footer"));
    assert.ok(
      reopened
        .at(-1)
        .pictures.every(
          (p) => p.bytes > 0 && p.mime === "image/png" && p.width > 0,
        ),
    );
    assert.match(reopened.at(-1).svg, /<image /);
  }
  result.uiReopened = reopened.map((x) => ({ pictures: x.pictures }));
  // Swap the actual bitmap in a header, and cross the document-handle swap
  // through native undo/redo. Keep this separate from XML structure assertions.
  result.pictureHistory = await page.evaluate(async () => {
    const b = window.fiveEHwpPalette.native.bridge(),
      ref = b
        .documentPictures()
        .find((p) => p.ref.headerFooter && !p.ref.cellPath?.length).ref;
    const before = Array.from(b.pictureBytes(ref));
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "red";
    ctx.fillRect(0, 0, 32, 16);
    const bytes = new Uint8Array(
      await (await new Promise((r) => canvas.toBlob(r))).arrayBuffer(),
    );
    b.transaction("header-picture-replace", () =>
      b.writeFigure(
        ref,
        { bytes, pixelWidth: 32, pixelHeight: 16 },
        "subdoc-replacement",
      ),
    );
    const replaced = Array.from(b.pictureBytes(ref));
    b.input.performUndo();
    const undone = Array.from(b.pictureBytes(ref));
    b.input.performRedo();
    const redone = Array.from(b.pictureBytes(ref));
    b.input.performUndo();
    return {
      changed: JSON.stringify(before) !== JSON.stringify(replaced),
      undo: JSON.stringify(before) === JSON.stringify(undone),
      redo: JSON.stringify(replaced) === JSON.stringify(redone),
    };
  });
  assert.deepEqual(result.pictureHistory, {
    changed: true,
    undo: true,
    redo: true,
  });
  // Exercise the shipped note buttons, including native keyboard input.
  await page.evaluate(() =>
    window.fiveEHwpPalette.native.focusPosition({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
    }),
  );
  const noteCount = () =>
    page.evaluate(
      () =>
        JSON.parse(
          window.fiveEHwpPalette.native
            .bridge()
            .wasm.borrowDocumentHandle()
            .getControls(),
        ).filter((c) => c.ctrlId === "fn" || c.ctrlId === "en").length,
    );
  const count = await noteCount();
  async function tool(action) {
    await page.locator('[data-palette-action="manager"]').click();
    await page
      .locator('[data-palette-action="category"][data-category="도구"]')
      .click();
    await page.locator(`[data-palette-action="${action}"]`).click();
    await page
      .locator('[data-palette-action="manager-close"]')
      .waitFor({ state: "hidden" });
  }
  await tool("note-insert");
  assert.equal(await noteCount(), count + 1);
  await page.evaluate(() =>
    window.fiveEHwpPalette.native.bridge().input.textarea.focus(),
  );
  await page.keyboard.type("typed note");
  assert.match(
    await page.evaluate(async () => {
      const { unzipSync } = await import("/vendor/fflate/index.js");
      return new TextDecoder().decode(
        unzipSync(
          window.fiveEHwpPalette.native
            .bridge()
            .wasm.borrowDocumentHandle()
            .exportHwpx(),
        )["Contents/section0.xml"],
      );
    }),
    /typed note/,
  );
  await tool("note-delete");
  assert.equal(await noteCount(), count);
  await tool("endnote-insert");
  assert.equal(await noteCount(), count + 1);
  await tool("note-delete");
  assert.equal(await noteCount(), count);
  result.noteTools = true;
  await page.screenshot({
    path: `_work/palette-qa/subdocuments-screen-${page.context().browser().browserType().name()}.png`,
  });
  await page.evaluate(() => {
    const manager = window.fiveEHwpPalette.native.bridge().input.viewportManager;
    manager.setScrollTop(0);
    manager.setScrollLeft(0);
  });
  await h.originalEdit(page, 0);
  await page.locator("[data-source-apply]").click();
  await page.locator("#exam-edit-bar").waitFor({ state: "hidden" });
  await h.idle(page);
  assert.equal(
    await page.locator("#exam-status").getAttribute("data-error"),
    "false",
    await page.locator("#exam-status").textContent(),
  );
  assert.ok(
    (await page.locator('.exam-figure[data-connection="linked"]').count()) > 0,
    "header picture returns from the 5E editor with its source",
  );
  result.editorRoundtrip = true;
  // Nonzero section and odd-page target must not be exchanged by the cursor
  // adapter. Build the second section through native HWPX, then use the real UI
  // cursor and palette transaction against it.
  result.secondSection = await page.evaluate(async () => {
    const { unzipSync, zipSync } = await import("/vendor/fflate/index.js");
    const { xmlDocument } = await import("/js/hwp-palette/workbook.js");
    const n = window.fiveEHwpPalette.native,
      b = n.bridge(),
      D = b.wasm.borrowDocumentHandle().constructor,
      blank = D.createEmpty();
    blank.createBlankDocument();
    const files = unzipSync(blank.exportHwpx());
    blank.free();
    files["Contents/section1.xml"] = files["Contents/section0.xml"].slice();
    const enc = (x) =>
      new TextEncoder().encode(new XMLSerializer().serializeToString(x));
    const header = xmlDocument(files["Contents/header.xml"]);
    header.documentElement.setAttribute("secCnt", "2");
    files["Contents/header.xml"] = enc(header);
    const content = xmlDocument(files["Contents/content.hpf"]),
      manifest = content.getElementsByTagNameNS("*", "manifest")[0],
      spine = content.getElementsByTagNameNS("*", "spine")[0];
    const item = content.createElementNS(manifest.namespaceURI, "opf:item");
    item.setAttribute("id", "section1");
    item.setAttribute("href", "Contents/section1.xml");
    item.setAttribute("media-type", "application/xml");
    manifest.append(item);
    const ref = content.createElementNS(spine.namespaceURI, "opf:itemref");
    ref.setAttribute("idref", "section1");
    ref.setAttribute("linear", "yes");
    spine.append(ref);
    files["Contents/content.hpf"] = enc(content);
    const two = new D(zipSync(files));
    two.convertToEditable();
    two.insertText(0, 0, 0, "첫 구역 유지");
    two.createHeaderFooter(1, true, 2);
    b.transaction("second-section", (input) => {
      b.documentHistory.adopt(two);
      input.cursor.exitHeaderFooterMode();
      input.cursor.moveTo({
        sectionIndex: 1,
        paragraphIndex: 0,
        charOffset: 0,
      });
      return input.getCursorPosition();
    });
    n.focusPosition({
      sectionIndex: 1,
      paragraphIndex: 0,
      charOffset: 0,
      hf: { isHeader: true, applyTo: 2 },
    });
    await n.executePlan({
      ops: [
        [
          "text",
          [
            { text: "둘째 구역 홀수 머리말" },
            { image: "영역사진" },
            { formula: "t^2" },
          ],
        ],
        ["table", 1, 1, [["둘째 구역 표"]]],
      ],
      warnings: [],
    });
    const d = b.wasm.borrowDocumentHandle(),
      region = xmlDocument(
        unzipSync(d.exportHwpx())["Contents/section1.xml"],
      ).getElementsByTagNameNS("*", "header")[0];
    return {
      cursor: n.capture().position,
      body: d.getTextRange(0, 0, 0, d.getParagraphLength(0, 0)),
      pageType: region.getAttribute("applyPageType"),
      tables: region.getElementsByTagNameNS("*", "tbl").length,
      pictures: region.getElementsByTagNameNS("*", "pic").length,
      equations: region.getElementsByTagNameNS("*", "equation").length,
    };
  });
  assert.equal(result.secondSection.cursor.sectionIndex, 1);
  assert.deepEqual(result.secondSection.cursor.hf, {
    isHeader: true,
    applyTo: 2,
  });
  assert.equal(result.secondSection.body, "첫 구역 유지");
  assert.equal(result.secondSection.pageType, "ODD");
  for (const k of ["tables", "pictures", "equations"])
    assert.equal(result.secondSection[k], 1);
  assert.deepEqual(errors, []);
  return result;
}
h.withServer(async (origin) => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch();
    try {
      const result = await exercise(
        await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
        origin,
      );
      require("node:fs").writeFileSync(
        `_work/palette-qa/subdocuments-${engine.name()}.json`,
        JSON.stringify(result, null, 2),
      );
      require("node:fs").writeFileSync(
        `_work/palette-qa/subdocuments-preview-${engine.name()}.hwpx`,
        Buffer.from(result.previewHwpx, "base64"),
      );
      console.log(
        engine.name() +
          ": header/footer objects and cells, note tools and typing, history, HWP/HWPX file-menu reopen passed",
      );
    } finally {
      await browser.close();
    }
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
