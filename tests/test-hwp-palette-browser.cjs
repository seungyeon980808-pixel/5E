const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { chromium, webkit } = require(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const h = require("./helpers/rhwp-exam.cjs");
async function exercise(page, origin) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await h.navigate(page, origin + "/?mode=pro&mobile=0&exam=1");
  await h.ready(page);
  await page.waitForSelector("#exam-palette [data-block]");
  const result = await page.evaluate(async () => {
    const {
        read,
        slotNames,
        paragraphRecords,
        insertTable,
        insertValue,
        textAt,
      } = await import("/js/hwp-palette/native.js"),
      { itemBytes, defaultState, clone, bytesToBase64, PaletteStore } =
        await import("/js/hwp-palette/model.js"),
      {
        buildWorkbook,
        readWorkbook,
        workbookToMarkdown,
        buildMacroWorkbook,
        buildQuestionWorkbook,
        blockRows,
      } = await import("/js/hwp-palette/workbook.js");
    const api = window.fiveEPalette,
      n = api.native,
      b = n.bridge(),
      d = b.wasm.borrowDocumentHandle(),
      state = api.store.state,
      out = { assets: [], errors: [] };
    for (const cat of ["템플릿", "양식"])
      for (const item of state.library[cat]) {
        try {
          const prepared = await n.prepareItem(
            item,
            Array.from({ length: item.slot_count }, (_, i) => `확인${i + 1}`),
          );
          const source = prepared.source;
          try {
            const names = slotNames(source),
              text = read(source.getTextFileText()),
              saved = new d.constructor(new Uint8Array(source.exportHwpx()));
            try {
              saved.convertToEditable();
              out.assets.push({
                label: item.label,
                remaining: names.length,
                text,
                reopen: read(saved.getTextFileText()),
                expected: item.slot_count,
                controls: read(saved.getControls()).length,
              });
            } finally {
              saved.free();
            }
          } finally {
            source.free();
          }
        } catch (e) {
          out.errors.push(item.label + ": " + e.message);
        }
      }
    const initial = d.getParagraphCount(0),
      item = state.library["템플릿"].find(
        (i) => i.label === "학교합답0사진5선지",
      );
    await n.useItem(item, {
      fills: Array.from({ length: item.slot_count }, (_, i) => String(i + 1)),
    });
    out.bodyText = read(d.getTextFileText());
    out.bodyCount = d.getParagraphCount(0);
    b.input.performUndo();
    out.undoCount = d.getParagraphCount(0);
    b.input.performRedo();
    out.redoCount = d.getParagraphCount(0);
    out.initial = initial;
    // Slot rendering must preserve nested rich text, native equations, and tables.
    const staged = new d.constructor(await itemBytes(state, item));
    try {
      staged.convertToEditable();
      const records = paragraphRecords(staged);
      out.slotRecord = records.find((r) => r.text.includes("\\")).target;
    } finally {
      staged.free();
    }
    const tiny = {
      id: "qa-photo",
      asset: "qa-photo-asset",
      label: "검증그림",
      folder: "",
      extension: "png",
      width: 2,
      height: 2,
    };
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    canvas.getContext("2d").fillRect(0, 0, 2, 2);
    const bytes = new Uint8Array(
      await (await fetch(canvas.toDataURL())).arrayBuffer(),
    );
    await api.store.update((s) => {
      s.photos.push(tiny);
      s.assets[tiny.asset] = bytesToBase64(bytes);
    });
    await n.convert(
      "앞 \\굵게{강조} \\수식{x over {y}} \\검증그림\\ 뒤\n\\표2*2\\\n가&나\n다&라",
    );
    out.rich = read(d.getTextFileText());
    out.richControls = read(d.getControls());
    const raw = b.wasm.borrowDocumentHandle();
    let table;
    b.transaction("qa-table", () => {
      const para = raw.getParagraphCount(0);
      raw.insertParagraph(0, para);
      table = read(
        raw.createTableEx(
          JSON.stringify({
            sectionIdx: 0,
            paraIdx: para,
            charOffset: 0,
            rowCount: 1,
            colCount: 1,
            treatAsChar: true,
          }),
        ),
      );
      return table;
    });
    const cell = {
      sectionIndex: 0,
      parentParaIndex: table.paraIdx,
      paragraphIndex: 0,
      charOffset: 0,
      cellPath: [
        { controlIndex: table.controlIdx, cellIndex: 0, cellParaIndex: 0 },
      ],
    };
    b.input.cursor.moveTo(cell);
    await n.useItem(item, {
      fills: Array.from({ length: item.slot_count }, (_, i) => `셀${i + 1}`),
    });
    out.cell = read(raw.getTextFileText());
    out.cellParas = raw.getCellParagraphCountByPath(
      0,
      table.paraIdx,
      JSON.stringify(cell.cellPath),
    );
    const workbook = buildWorkbook(
      new Map([
        [
          "문항",
          [
            ["번호", "유형", "발문", "보기", "선지", "배점", "정답"],
            [
              "2",
              "합답형",
              "질문",
              "ㄱ. 첫째\nㄴ. 둘째\nㄷ. 셋째",
              "① ㄱ\n② ㄴ\n③ ㄷ\n④ ㄱ, ㄴ\n⑤ ㄱ, ㄴ, ㄷ",
              "3",
              "③",
            ],
          ],
        ],
        [
          "목록",
          [
            ["", "", "유형", "스타일"],
            ["", "", "합답형", "학교 5지선다"],
          ],
        ],
      ]),
    );
    out.excel = workbookToMarkdown(
      new Uint8Array(await workbook.arrayBuffer()),
      api.store.state,
    );
    const vertical = buildWorkbook(
      new Map([
        [
          "시험지",
          blockRows([
            [
              "학교정답0사진1선지",
              [
                ["번호", "1"],
                ["발문", "질문"],
                ["배점", "3"],
                ...Array.from({ length: 5 }, (_, i) => [
                  "선" + (i + 1),
                  "선지" + i,
                ]),
              ],
            ],
          ]),
        ],
      ]),
    );
    out.vertical = workbookToMarkdown(
      new Uint8Array(await vertical.arrayBuffer()),
      api.store.state,
    );
    const macroBytes = new Uint8Array(
        await (
          await fetch("/assets/hwp-palette/excel_block_template.xlsm")
        ).arrayBuffer(),
      ),
      before = readWorkbook(macroBytes),
      macro = buildMacroWorkbook(macroBytes, api.store.state),
      after = readWorkbook(new Uint8Array(await macro.arrayBuffer()));
    out.macro = {
      vbaSame: before.files["xl/vbaProject.bin"].every(
        (v, i) => after.files["xl/vbaProject.bin"][i] === v,
      ),
      packs: after.sheets.get("_꾸러미").length,
      validation: Object.entries(after.files)
        .filter(([name]) => name.startsWith("xl/worksheets/"))
        .some(([, bytes]) =>
          new TextDecoder().decode(bytes).includes('sqref="B1"'),
        ),
    };
    await Promise.all(
      Array.from({ length: 5 }, () =>
        api.store.update((s) => s.config.next_number++),
      ),
    );
    out.concurrent = api.store.state.config.next_number;
    await api.store.undoChange();
    out.settingsUndo = api.store.state.config.next_number;
    await api.store.redoChange();
    out.settingsRedo = api.store.state.config.next_number;
    return out;
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.assets.length, 14);
  for (const item of result.assets) {
    assert.equal(item.remaining, 0, item.label);
    assert.equal(item.text, item.reopen, item.label);
    for (let i = 1; i <= item.expected; i++)
      assert.ok(item.text.includes(`확인${i}`), `${item.label} slot ${i}`);
  }
  assert.equal(result.undoCount, result.initial);
  assert.equal(result.redoCount, result.bodyCount);
  assert.match(result.bodyText, /ㄱ\.\s*4/);
  assert.match(result.cell, /셀11/);
  assert.ok(result.cellParas > 1);
  assert.match(result.rich, /강조/);
  assert.ok(
    result.richControls.some(
      (x) =>
        JSON.stringify(x).includes("그림") || JSON.stringify(x).includes("gso"),
    ),
  );
  assert.match(result.excel.markdown, /\\학교합답0사진5선지\\/);
  assert.match(result.excel.markdown, /첫째/);
  assert.equal(result.excel.answers[0][2], "③");
  assert.match(result.vertical.markdown, /\\학교정답0사진1선지\\/);
  assert.equal(result.macro.vbaSame, true);
  assert.equal(result.macro.validation, true);
  assert.equal(result.settingsUndo, result.concurrent - 1);
  assert.equal(result.settingsRedo, result.concurrent);
  await page
    .getByRole("button", { name: "팔레트와 물감 설정", exact: true })
    .click();
  await h.idle(page);
  await page.locator('[data-category="문자"][data-palette-action]').click();
  await h.idle(page);
  await page.getByRole("button", { name: "물감 등록", exact: true }).click();
  await page.locator('.palette-dialog [name="name"]').fill("검증 문구");
  await page.locator('.palette-dialog [name="label"]').fill("검증문구");
  await page.locator('.palette-dialog [name="text"]').fill("검증되었습니다");
  await page.locator('.palette-dialog button[type="submit"]').click();
  await page.locator(".palette-dialog").waitFor({ state: "hidden" });
  assert.ok(
    await page.locator("[data-item]").filter({ hasText: "검증 문구" }).count(),
  );
  await page
    .locator('[data-category="문서 해체"][data-palette-action]')
    .click();
  await h.idle(page);
  assert.ok(await page.locator("[data-piece]").count());
  await page.locator('[data-palette-action="manager-close"]').click();
  await h.idle(page);
  await page.getByRole("button", { name: "문항 엑셀", exact: true }).click();
  await page.locator('[data-palette-action="excel-block-add"]').click();
  await page.locator('[name="block-0-0"]').fill("기존 값 유지");
  await page.locator('[data-palette-action="excel-block-add"]').click();
  assert.equal(
    await page.locator('[name="block-0-0"]').inputValue(),
    "기존 값 유지",
  );
  assert.match(
    await page.locator('.palette-dialog [name="markdown"]').inputValue(),
    /기존 값 유지/,
  );
  await page.locator(".palette-dialog [data-close]").click();
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
      const evidence = process.env.EVIDENCE_DIR || "_work/palette-qa";
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(
        path.join(evidence, "hwp-palette-" + engine.name() + ".json"),
        JSON.stringify(result, null, 2),
      );
      await page.screenshot({
        path: path.join(evidence, "hwp-palette-" + engine.name() + ".png"),
      });
      console.log(
        engine.name() +
          ": 14 native fragments, undo/redo, nested cells, pictures/equations, legacy Excel/VBA, settings concurrency and UI passed",
      );
    } finally {
      await browser.close();
    }
  }
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
