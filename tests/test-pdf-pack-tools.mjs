import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { createPdfLibraryFixture } from "./helpers/pdf-library-fixture.mjs";

test("Given self-authored source PDFs, when the pack builder runs, then it creates a validated reproducible directory pack", async () => {
  // Given
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-pack-tool-"));
  const sourcePath = path.join(temporary, "fixture.pdf");
  const specPath = path.join(temporary, "spec.json");
  const outputPath = path.join(temporary, "pack");
  await writeFile(sourcePath, createPdfLibraryFixture());
  await writeFile(specPath, JSON.stringify({
    id: "self-authored.physics",
    version: "1.0.0",
    title: "Self-authored physics fixture",
    kind: "exam",
    subjects: ["physics1"],
    academicYears: [2026],
    createdAt: "2026-09-10T00:00:00.000Z",
    minAppVersion: "1.5.3",
    documents: [{ id: "fixture", title: "Fixture", source: "fixture.pdf", destination: "documents/fixture.pdf" }],
  }));

  // When
  const result = spawnSync(process.execPath, ["tools/pdf-library/build-pack.mjs", "--spec", specPath, "--output", outputPath], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
  });

  // Then
  assert.equal(result.status, 0, result.stderr);
  const pack = JSON.parse(await readFile(path.join(outputPath, "pack.json"), "utf8"));
  const catalog = JSON.parse(await readFile(path.join(outputPath, "catalog.json"), "utf8"));
  const searchIndex = JSON.parse(await readFile(path.join(outputPath, "search-index.json"), "utf8"));
  assert.equal(pack.documentCount, 1);
  assert.equal(pack.pageCount, 1);
  assert.equal(catalog.documents[0].pages.length, 0);
  assert.equal(searchIndex.entries[0].text.includes("Momentum"), true);
  assert.match(result.stdout, /validated.*self-authored\.physics.*1\.0\.0/i);
});
