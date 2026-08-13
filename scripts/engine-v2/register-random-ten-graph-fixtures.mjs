#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = path.join(root, "docs/engine-v2/graph-validation-manifest.jsonl");
const fixtures = new Map(Object.entries({
  "p1_2023_06_16.png#1": "tests/fixtures/exam-graphs/p1_2023_06_16__p1.json",
  "p2_2026_06_03.png#2": "tests/fixtures/exam-graphs/p2_2026_06_03__p2.json",
  "p1_2026_09_06.png#1": "tests/fixtures/exam-graphs/p1_2026_09_06__p1.json",
  "p2_2024_11_17.png#2": "tests/fixtures/exam-graphs/p2_2024_11_17__p2.json",
  "c2_2023_11_09.png#1": "tests/fixtures/exam-graphs/c2_2023_11_09__p1.json",
  "p1_2025_06_13.png#1": "tests/fixtures/exam-graphs/p1_2025_06_13__p1.json",
  "p2_2026_09_05.png#2": "tests/fixtures/exam-graphs/p2_2026_09_05__p2.json",
  "e1_2026_11_10.png#1": "tests/fixtures/exam-graphs/e1_2026_11_10__p1.json",
  "p2_2023_11_06.png#2": "tests/fixtures/exam-graphs/p2_2023_11_06__p2.json",
  "p2_2024_09_07.png#2": "tests/fixtures/exam-graphs/p2_2024_09_07__p2.json",
}));

const rows = fs.readFileSync(manifest, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
for (const row of rows) {
  const fixture = fixtures.get(row.id);
  if (!fixture) continue;
  if (!fs.existsSync(path.join(root, fixture))) throw new Error(`Missing fixture: ${fixture}`);
  row.status = "candidate";
  row.fixture = fixture;
  row.verification = null;
  fixtures.delete(row.id);
}
if (fixtures.size) throw new Error(`Manifest ids not found: ${[...fixtures.keys()].join(", ")}`);
fs.writeFileSync(manifest, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
console.log("Registered the deterministic random sample (seed 20260810): 10 candidate fixtures.");
