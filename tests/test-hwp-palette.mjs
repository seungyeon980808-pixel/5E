import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  parseQuestion,
  buildLibraryPlan,
  buildSegments,
  resolveStyle,
  splitSelectionUnits,
} from "../js/hwp-palette/parser.js";
import {
  defaultState,
  normalizeState,
  installChip,
  readChip,
  exportChip,
  importProfile,
  removeItem,
  libraryLookup,
  deepMerge,
} from "../js/hwp-palette/model.js";
import { zipSync, strToU8 } from "../vendor/fflate/index.js";
const oracle = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/hwp-palette-parser-oracle.json", import.meta.url),
  ),
);
test("original HwpPalette 86 parser tests: 216 recorded calls match exactly", () => {
  for (const row of oracle) {
    const args = structuredClone(row.args);
    if (
      ["build_library_plan", "build_segments", "resolve_style_token"].includes(
        row.fn,
      )
    )
      args[1] = new Map(Object.entries(args[1]));
    let result = {
      parse: parseQuestion,
      build_library_plan: buildLibraryPlan,
      build_segments: buildSegments,
      resolve_style_token: resolveStyle,
      split_selection_units: splitSelectionUnits,
    }[row.fn](...args);
    if (row.fn === "build_library_plan") result = [result.ops, result.warnings];
    assert.deepEqual(result, row.result, `${row.fn}: ${args[0]}`);
  }
});
test("profile imports complete partial legacy defaults and reject invalid dimensions", () => {
  const state = defaultState(),
    next = importProfile(state, {
      exam_scribe_profile: "기본 2단",
      spec: { layout: { column_width_mm: 155 }, font: { size_pt: 12 } },
    });
  assert.equal(next.config.active_profile, "기본 2단 (2)");
  assert.equal(
    next.config.profiles[next.config.active_profile].bogi_box.line_spacing,
    130,
  );
  assert.equal(
    next.config.profiles[next.config.active_profile].font.name,
    "함초롬바탕",
  );
  assert.throws(() =>
    normalizeState({
      ...state,
      config: {
        ...state.config,
        profiles: { broken: { layout: { column_width_mm: -1 } } },
      },
    }),
  );
  assert.throws(() =>
    deepMerge({}, JSON.parse('{"__proto__":{"polluted":true}}')),
  );
});
test("existing .hwpal nested stack references and repeated imports remain connected", async () => {
  const state = defaultState(),
    item = {
      id: "local-a",
      origin_id: "origin-a",
      name: "문자",
      label: "문자",
      text: "ㄱ",
    },
    tab = {
      name: "수신",
      cols: 8,
      blocks: [
        {
          id: "old",
          type: "stack",
          row: 0,
          col: 0,
          span: 4,
          rows: 2,
          items: [{ id: "old2", type: "char", ref: "origin-a" }],
        },
      ],
    };
  state.library["문자"].push(item);
  const chip = {
    manifest: { name: "칩" },
    files: {},
    items: [
      {
        category: "문자",
        origin_id: "origin-a",
        name: "문자",
        label: "문자",
        text: "ㄱ",
      },
      {
        category: "문자",
        origin_id: "origin-b",
        name: "문자",
        label: "문자",
        text: "ㄴ",
      },
    ],
    tab,
  };
  const first = installChip(state, chip);
  assert.equal(first.report.reused, 1);
  assert.equal(first.report.added, 1);
  assert.equal(
    first.state.config.palette_tabs.at(-1).blocks[0].items[0].ref,
    "local-a",
  );
  assert.equal(first.state.library["문자"][1].label, "문자2");
  const again = installChip(first.state, chip);
  assert.equal(again.report.added, 0);
  const blob = await exportChip(first.state, {
      tab: first.state.config.palette_tabs.at(-1),
    }),
    parsed = readChip(new Uint8Array(await blob.arrayBuffer()));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].origin_id, "local-a");
  assert.equal(parsed.tab.blocks[0].items[0].ref, "local-a");
});
test("chip validation rejects missing fragments and unsafe archive paths", () => {
  assert.throws(
    () =>
      installChip(defaultState(), {
        manifest: {},
        files: {},
        items: [
          {
            category: "템플릿",
            origin_id: "f",
            name: "없음",
            file: "missing.hwp",
          },
        ],
      }),
    /조각 파일/,
  );
  assert.throws(
    () =>
      readChip(
        zipSync({ "../library.json": strToU8('{"version":1,"items":[]}') }),
      ),
    /경로/,
  );
});
test("mixed template deletion preserves dependencies and removes nested block references", () => {
  const state = defaultState(),
    item = state.library["템플릿"][0];
  state.library["템플릿"].push({
    id: "mix",
    name: "꾸러미",
    label: "꾸러미",
    mix: [item.id],
  });
  assert.throws(() => removeItem(state, "템플릿", item.id), /꾸러미/);
  removeItem(state, "템플릿", "mix");
  removeItem(state, "템플릿", item.id);
  assert.ok(
    ![...libraryLookup(state).values()].some(([, i]) => i.id === item.id),
  );
});
