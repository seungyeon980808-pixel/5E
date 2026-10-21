const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const h = require("./helpers/rhwp-exam.cjs");

async function exercise(page, origin) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await h.navigate(page, origin + "/?mode=pro&mobile=0&exam=1");
  await h.ready(page);
  await page.waitForSelector("#exam-palette [data-block]");
  const result = await page.evaluate(async () => {
    const { read, insertTable, paragraphRecords, NativePalette } = await import(
      "/js/hwp-palette/native.js"
    );
    const { bytesToBase64, defaultState } = await import(
      "/js/hwp-palette/model.js"
    );
    const { unzipSync, zipSync } = await import("/vendor/fflate/index.js");
    const { xmlDocument, buildQuestionWorkbook, readWorkbook } = await import(
      "/js/hwp-palette/workbook.js"
    );
    const { loadOpenCv, convertExamImage, physicalImageSize, IMAGE_STYLES } =
      await import("/js/hwp-palette/image.js");
    const api = window.fiveEPalette,
      n = api.native,
      b = n.bridge(),
      d = b.wasm.borrowDocumentHandle();
    const out = {};
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, 64, 32);
    context.fillStyle = "black";
    context.fillRect(12, 8, 40, 16);
    const bytes = new Uint8Array(
      await (
        await new Promise((resolve) => canvas.toBlob(resolve))
      ).arrayBuffer(),
    );
    out.images = [];
    for (const style of Object.keys(IMAGE_STYLES).filter(Boolean)) {
      const converted = await convertExamImage(bytes, style);
      const bitmap = await createImageBitmap(new Blob([converted.bytes]));
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      out.images.push({
        style,
        width: converted.width,
        height: converted.height,
        physical: physicalImageSize(
          converted.bytes,
          converted.width,
          converted.height,
        ),
        binary: pixels.every((v, i) =>
          i % 4 === 3 ? v === 255 : v === 0 || v === 255,
        ),
        whiteMargin: pixels[0] === 255 && pixels[1] === 255,
      });
    }
    out.cvVersion = (await loadOpenCv()).getBuildInformation().split("\n")[1];
    const item = {
      id: "feature-photo",
      asset: "feature-photo",
      label: "그림검증",
      extension: "png",
      width: 64,
      height: 32,
    };
    await api.store.update((s) => {
      s.photos.push(item);
      s.assets[item.asset] = bytesToBase64(bytes);
    });
    const workbook = readWorkbook(
      new Uint8Array(
        await buildQuestionWorkbook(api.store.state).arrayBuffer(),
      ),
    );
    out.workbook = {
      main: new TextDecoder().decode(
        workbook.files["xl/worksheets/sheet1.xml"],
      ),
      metadata: new TextDecoder().decode(workbook.files["xl/workbook.xml"]),
    };

    // Keep both header content and the original page definition during nested formatting.
    b.transaction("feature-setup", () => {
      d.createHeaderFooter(0, true, 0);
      d.insertTextInHeaderFooter(0, true, 0, 0, 0, "머리말 보존");
      insertTable(
        d,
        { sectionIndex: 0, paragraphIndex: 0, charOffset: 0 },
        1,
        1,
        [["바깥"]],
        new Map(),
      );
      const outer = read(d.getControls()).find((c) => c.ctrlId === "tbl");
      const cell = {
        sectionIndex: 0,
        parentParaIndex: outer.para,
        paragraphIndex: 0,
        charOffset: 0,
        cellPath: [
          { controlIndex: outer.controlIndex, cellIndex: 0, cellParaIndex: 0 },
        ],
      };
      insertTable(d, cell, 1, 1, [["중첩서식검증"]], new Map(), {
        width: 3600,
        border: "Dash",
        margins: { left: 1, right: 1, top: 1, bottom: 1 },
      });
      return cell;
    });
    b.transaction("late-header", () => {
      d.createHeaderFooter(0, true, 1);
      d.insertTextInHeaderFooter(0, true, 1, 0, 0, "나중 머리말");
      return true;
    });
    const nested = paragraphRecords(d).find(
      (r) => r.text === "중첩서식검증",
    ).target;
    const before = {
      text: String(d.getTextFileText()),
      page: read(d.getPageDef(0)),
      hf: read(d.getHeaderFooter(0, true, 0)),
    };
    const ctx = {
      ...n.capture(),
      position: nested,
      selection: { start: nested, end: { ...nested, charOffset: 7 } },
    };
    await n.applyFunctions(
      [
        { func: "가운데정렬" },
        { func: "내어쓰기", value: 5 },
        { func: "왼쪽여백", value: 3 },
        { func: "줄간격", value: 160 },
        { func: "자간 자동조절", value: 30 },
        { func: "글씨크기", value: 12 },
        { func: "굵게", value: true },
      ],
      ctx,
    );
    const record = paragraphRecords(d).find((r) => r.text === "중첩서식검증");
    const files = unzipSync(d.exportHwpx()),
      header = xmlDocument(files["Contents/header.xml"]);
    const style = [...header.getElementsByTagNameNS("*", "paraPr")].find(
      (node) =>
        node.getAttribute("id") === record.node.getAttribute("paraPrIDRef"),
    );
    out.nested = {
      textBefore: before.text,
      textAfter: String(d.getTextFileText()),
      pageBefore: before.page,
      pageAfter: read(d.getPageDef(0)),
      hfBefore: before.hf,
      hfAfter: read(d.getHeaderFooter(0, true, 0)),
      style: new XMLSerializer().serializeToString(style),
    };
    b.input.performUndo();
    out.undoStyle = paragraphRecords(d)
      .find((r) => r.text === "중첩서식검증")
      .node.getAttribute("paraPrIDRef");
    b.input.performRedo();
    out.redoStyle = paragraphRecords(d)
      .find((r) => r.text === "중첩서식검증")
      .node.getAttribute("paraPrIDRef");
    out.formattedStyle = record.node.getAttribute("paraPrIDRef");
    const capturePos = { sectionIndex: 0, paragraphIndex: 0, charOffset: 0 };
    const captured = await n.captureTemplate({
      ...n.capture(),
      position: capturePos,
      selection: null,
    });
    const saved = new d.constructor(captured.bytes);
    try {
      saved.convertToEditable();
      out.capture = {
        text: String(saved.getTextFileText()),
        tables: paragraphRecords(saved).filter((r) => r.target.cellPath?.length)
          .length,
        remaining: captured.slot_count,
      };
    } finally {
      saved.free();
    }
    // Capturing must never mutate the user's document.
    out.captureUnchanged = String(d.getTextFileText()) === out.nested.textAfter;

    // A non-first section previously imported from section zero by mistake.
    const secondFiles = unzipSync(d.exportHwpx()),
      encoder = new TextEncoder();
    const second = xmlDocument(secondFiles["Contents/section0.xml"]);
    const firstParagraph = [...second.documentElement.children].find(
      (node) => node.localName === "p",
    );
    for (const node of [...second.documentElement.children])
      if (node !== firstParagraph) node.remove();
    for (const node of [...firstParagraph.getElementsByTagNameNS("*", "run")])
      node.remove();
    const run = second.createElementNS(
      "http://www.hancom.co.kr/hwpml/2011/paragraph",
      "hp:run",
    );
    run.setAttribute("charPrIDRef", "0");
    const text = second.createElementNS(run.namespaceURI, "hp:t");
    text.textContent = "둘째구역검증";
    run.append(text);
    firstParagraph.append(run);
    secondFiles["Contents/section1.xml"] = encoder.encode(
      new XMLSerializer().serializeToString(second),
    );
    const meta = xmlDocument(secondFiles["Contents/header.xml"]);
    meta.documentElement.setAttribute("secCnt", "2");
    secondFiles["Contents/header.xml"] = encoder.encode(
      new XMLSerializer().serializeToString(meta),
    );
    const content = xmlDocument(secondFiles["Contents/content.hpf"]);
    const manifest = content.getElementsByTagNameNS("*", "manifest")[0],
      spine = content.getElementsByTagNameNS("*", "spine")[0];
    const manifestItem = content.createElementNS(
      manifest.namespaceURI,
      "opf:item",
    );
    manifestItem.setAttribute("id", "section1");
    manifestItem.setAttribute("href", "Contents/section1.xml");
    manifestItem.setAttribute("media-type", "application/xml");
    manifest.append(manifestItem);
    const ref = content.createElementNS(spine.namespaceURI, "opf:itemref");
    ref.setAttribute("idref", "section1");
    ref.setAttribute("linear", "yes");
    spine.append(ref);
    secondFiles["Contents/content.hpf"] = encoder.encode(
      new XMLSerializer().serializeToString(content),
    );
    const two = new d.constructor(zipSync(secondFiles));
    try {
      two.convertToEditable();
      const fakeBridge = {
        generation: 0,
        revision: 0,
        wasm: { borrowDocumentHandle: () => two },
        input: {},
      };
      const native = new NativePalette(() => fakeBridge, {
        state: defaultState(),
      });
      const cap = await native.captureTemplate({
        generation: 0,
        revision: 0,
        position: { sectionIndex: 1, paragraphIndex: 0, charOffset: 0 },
        selection: null,
      });
      const fragment = new d.constructor(cap.bytes);
      try {
        fragment.convertToEditable();
        out.secondSection = String(fragment.getTextFileText());
      } finally {
        fragment.free();
      }
    } finally {
      two.free();
    }
    const beforeBad = String(d.getTextFileText()),
      oldRevision = b.revision;
    let rejected = false;
    try {
      await n.executePlan({
        ops: [["template", { id: "broken", asset: "broken" }, []]],
        warnings: [],
      });
    } catch {
      rejected = true;
    }
    out.atomic = {
      rejected,
      unchanged: String(d.getTextFileText()) === beforeBad,
      revisionUnchanged: b.revision === oldRevision,
    };
    // Header/footer selection uses its own native coordinates, never the body cursor.
    const cursor = b.input.cursor;
    cursor.enterHeaderFooterMode(true, 0, 0);
    cursor.selectAllInHeaderFooter();
    out.headerSelection = n.capture().text;
    await n.insertChar("머리말수정검증");
    out.headerAfter = read(
      b.wasm.borrowDocumentHandle().getHeaderFooter(0, true, 0),
    ).text;
    out.headerCursor = cursor.hfCharOffset;
    const headerCapture = await n.captureTemplate();
    out.headerCapture = headerCapture.preview;
    cursor.exitHeaderFooterMode();
    return out;
  });
  assert.equal(result.headerSelection, "머리말 보존");
  assert.equal(result.headerAfter, "머리말수정검증");
  assert.equal(result.headerCursor, 7);
  assert.match(result.headerCapture, /머리말수정검증/);
  assert.equal(result.images.length, 8);
  for (const image of result.images) {
    assert.equal(image.width, 104);
    assert.equal(image.height, 72);
    assert.equal(image.binary, true);
    assert.equal(image.whiteMargin, true);
    assert.ok(Math.abs(image.physical.widthMm - (104 * 25.4) / 300) < 0.001);
  }
  assert.match(result.cvVersion, /4\.13\.0/);
  assert.match(result.workbook.main, /dataValidations count="4"/);
  assert.match(result.workbook.metadata, /name="목록"[^>]*state="hidden"/);
  assert.equal(result.nested.textBefore, result.nested.textAfter);
  assert.deepEqual(result.nested.pageBefore, result.nested.pageAfter);
  assert.deepEqual(result.nested.hfBefore, result.nested.hfAfter);
  assert.match(result.nested.style, /horizontal="CENTER"/);
  assert.match(result.nested.style, /condense="30"/);
  assert.match(result.nested.style, /intent[^>]* value="-500"/);
  assert.match(result.nested.style, /left[^>]* value="850"/);
  assert.notEqual(result.undoStyle, result.formattedStyle);
  assert.equal(result.redoStyle, result.formattedStyle);
  assert.match(result.capture.text, /中|중첩서식검증/);
  assert.ok(result.capture.tables > 1);
  assert.equal(result.captureUnchanged, true);
  assert.match(result.secondSection, /둘째구역검증/);
  assert.deepEqual(result.atomic, {
    rejected: true,
    unchanged: true,
    revisionUnchanged: true,
  });
  const originalText = await page.evaluate(() =>
    String(
      window.fiveEPalette.native
        .bridge()
        .wasm.borrowDocumentHandle()
        .getTextFileText(),
    ),
  );
  await page
    .getByRole("button", { name: "팔레트와 물감 설정", exact: true })
    .click();
  await page.locator('[data-category="템플릿"][data-palette-action]').click();
  await page.locator("[data-item]").first().click();
  const editedId = await page
    .locator('[data-item][aria-pressed="true"]')
    .getAttribute("data-item");
  await page.locator('[data-palette-action="item-content"]').click();
  await page.locator('[data-palette-action="content-save"]').waitFor();
  await h.idle(page);
  await page.evaluate(async () =>
    window.fiveEPalette.native.insertChar("조각수정검증"),
  );
  await page.locator('[data-palette-action="content-save"]').click();
  await page
    .locator('[data-palette-action="content-save"]')
    .waitFor({ state: "hidden" });
  await h.idle(page);
  const edited = await page.evaluate(async (id) => {
    const api = window.fiveEPalette,
      { itemBytes } = await import("/js/hwp-palette/model.js");
    const item = api.store.state.library["템플릿"].find((i) => i.id === id);
    return {
      document: String(
        api.native.bridge().wasm.borrowDocumentHandle().getTextFileText(),
      ),
      preview: (
        await api.native.inspectFile(await itemBytes(api.store.state, item))
      ).preview,
    };
  }, editedId);
  assert.equal(
    edited.document,
    originalText,
    "return from fragment editing restores the original document",
  );
  assert.match(edited.preview, /조각수정검증/);
  result.contentEditing = { restored: true, saved: true };
  assert.deepEqual(errors, []);
  return result;
}

h.withServer(async (origin) => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 950 },
      });
      const result = await exercise(page, origin);
      const dir = process.env.EVIDENCE_DIR || "_work/palette-qa";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "hwp-palette-features-" + engine.name() + ".json"),
        JSON.stringify(result, null, 2),
      );
      console.log(
        engine.name() +
          ": image styles / DPI, XLSX dropdowns, nested paragraph format, undo/redo, decomposition reuse, section capture and atomic failure passed",
      );
    } finally {
      await browser.close();
    }
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
