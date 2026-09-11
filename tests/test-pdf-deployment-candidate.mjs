import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

import { PDF_PACK_FIXTURE, writePdfPackFixture } from "./helpers/pdf-pack-fixture.mjs";
import { loadBundledDesktopPack } from "../js/pdf-library/desktop-pack.js";

const require = createRequire(import.meta.url);
const { createBundledPdfPackReader } = require("../desktop/bundled-pdf-pack.cjs");

test("Given a validated pack, when a deployment candidate is assembled, then app and pack are independent and no staged path contains .omo", async (t) => {
  // Given
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-candidate-test-"));
  const output = path.join(temporary, "candidate");
  const pack = path.join(temporary, "pack-source");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writePdfPackFixture(pack);

  // When
  const result = spawnSync(process.execPath, [
    "tools/pdf-library/build-deployment-candidate.mjs",
    "--output", output,
    "--pack", pack,
    "--pdf-pack-base-url", "../pack/recent-three/",
  ], { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8" });

  // Then
  assert.equal(result.status, 0, result.stderr);
  const candidate = JSON.parse(await readFile(path.join(output, "candidate.json"), "utf8"));
  assert.equal(candidate.status, "candidate");
  assert.match(candidate.source.gitCommit, /^[a-f0-9]{40}$/);
  assert.equal(["clean", "dirty"].includes(candidate.source.worktree), true);
  assert.equal(candidate.pack.id, PDF_PACK_FIXTURE.id);
  assert.equal(candidate.pack.version, PDF_PACK_FIXTURE.version);
  assert.equal(candidate.pack.path, "pack/recent-three");
  assert.match(candidate.pack.packManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(candidate.pack.checksumsManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.pack.bytes > 0, true);
  assert.equal(JSON.stringify(candidate).includes(".omo"), false);
  const sampleCatalog = JSON.parse(await readFile(path.join(output, "app", "assets", "exam-library", "sample-catalog.json"), "utf8"));
  assert.equal(sampleCatalog.version, "exam-library-v1");
  assert.equal(sampleCatalog.complete, false);
  assert.equal(sampleCatalog.items.length, 7);
  assert.deepEqual([...new Set(sampleCatalog.items.map((item) => item.subject))].sort(), ["p1", "p2"]);
  assert.deepEqual([...new Set(sampleCatalog.items.map((item) => item.year))].sort(), [2025, 2026, 2027]);
  assert.equal(sampleCatalog.items.every((item) => item.license === "이용 조건 미확인"), true);
  await Promise.all(sampleCatalog.items.map((item) => readFile(path.join(output, "app", item.url))));
  const verification = spawnSync(process.execPath, ["tools/pdf-library/verify-deployment-candidate.mjs", output], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
  });
  assert.equal(verification.status, 0, verification.stderr);
  assert.equal(JSON.parse(verification.stdout).valid, true);
});

test("Given a candidate manifest whose pack path escapes the candidate, when verified, then traversal is rejected", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-candidate-traversal-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await import("node:fs/promises").then(({ writeFile }) => writeFile(path.join(temporary, "candidate.json"), JSON.stringify({
    schemaVersion: 1, status: "candidate", app: { path: "app" }, pack: {
      id: "candidate.pack", version: "1.0.0", path: "../outside", documentCount: 1, pageCount: 1,
      files: 4, bytes: 1024, packManifestSha256: "a".repeat(64), checksumsManifestSha256: "b".repeat(64),
    },
  })));

  const result = spawnSync(process.execPath, ["tools/pdf-library/verify-deployment-candidate.mjs", temporary], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /safe relative path/i);
});

test("Given the Windows candidate path, when inspected, then NSIS is pinned to x64 and CI verifies a nonempty PE installer hash without publishing", async () => {
  const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  const packager = await readFile(path.resolve("tools/pdf-library/run-electron-builder.mjs"), "utf8");
  const workflow = await readFile(path.resolve(".github/workflows/windows-candidate.yml"), "utf8");
  const releaseWorkflow = await readFile(path.resolve(".github/workflows/windows-release.yml"), "utf8");

  assert.equal(packageJson.scripts["package:win"], "node tools/pdf-library/run-electron-builder.mjs --win --publish never");
  assert.match(packager, /\["--win", "nsis", "--x64", "--publish", "never"\]/u);
  assert.match(packager, /FIVE_E_PDF_PACK_SOURCE/);
  assert.match(packager, /spawnSync\(process\.execPath, \[builderCli, \.\.\.arguments_\]/u);
  assert.match(packager, /must contain exactly its manifests and declared assets/u);
  assert.equal(packageJson.build.files.includes("!node_modules/@napi-rs/canvas-darwin-*/**/*"), true);
  assert.equal("files" in packageJson.build.win, false);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /pdf_pack_base_url:[\s\S]*required: true/u);
  assert.match(workflow, /PDF_PACK_BASE_URL: \$\{\{ inputs\.pdf_pack_base_url \}\}/u);
  assert.match(workflow, /fetch-release-pack\.mjs --base-url "\$env:PDF_PACK_BASE_URL"/u);
  assert.match(workflow, /FIVE_E_PDF_PACK_SOURCE: \$\{\{ runner\.temp \}\}\/recent-three-pack/u);
  assert.match(releaseWorkflow, /PDF_PACK_BASE_URL: \$\{\{ vars\.FIVE_E_PDF_PACK_BASE_URL \}\}/u);
  assert.match(releaseWorkflow, /Repository variable FIVE_E_PDF_PACK_BASE_URL is required/u);
  assert.match(releaseWorkflow, /FIVE_E_PDF_PACK_SOURCE: \$\{\{ runner\.temp \}\}\/recent-three-pack/u);
  assert.match(workflow, /Get-FileHash -Algorithm SHA256/);
  assert.match(workflow, /MZ/);
  assert.doesNotMatch(workflow, /release create|contents:\s*write/i);
});

test("Given the desktop package and smoke launcher, when platform support is inspected, then macOS and Windows use installed Electron without installing dependencies", async () => {
  // Given
  const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  const smokeLauncher = await readFile(path.resolve("desktop/run-smoke.cjs"), "utf8");
  const requiredDesktopModules = [
    "desktop/ai-thread-profile.cjs",
    "desktop/batch-output-service.cjs",
    "desktop/bundled-pdf-pack.cjs",
    "desktop/codex-process-failure.cjs",
    "desktop/codex-turn-runtime.cjs",
    "desktop/main.cjs",
    "desktop/pdf-library-ipc.cjs",
    "desktop/pdf-library-scanner.cjs",
    "desktop/pdf-library-service.cjs",
    "desktop/preload.cjs",
    "desktop/splash.html",
  ];

  // When / Then
  assert.equal(packageJson.scripts.desktop, "electron .");
  assert.equal(packageJson.scripts["test:image"], "node desktop/run-smoke.cjs --image");
  assert.equal(packageJson.scripts["package:win"], "node tools/pdf-library/run-electron-builder.mjs --win --publish never");
  assert.equal(packageJson.scripts["package:mac"], "node tools/pdf-library/run-electron-builder.mjs --mac --publish never");
  assert.deepEqual(packageJson.build.extraResources, [{
    from: "${env.FIVE_E_PDF_PACK_SOURCE}", to: "pdf-library/recent-three-pack", filter: ["**/*"],
  }]);
  assert.deepEqual(packageJson.build.mac.target, [{ target: "dmg", arch: ["x64", "arm64"] }]);
  assert.equal(packageJson.build.mac.icon, "assets/icon-512.png");
  assert.equal(requiredDesktopModules.every((file) => packageJson.build.files.includes(file)), true);
  assert.match(smokeLauncher, /require\("electron"\)/);
  assert.match(smokeLauncher, /process\.argv\.includes\("--image"\)/);
  assert.match(smokeLauncher, /FIVE_E_IMAGE_E2E: "1"/);
  assert.doesNotMatch(smokeLauncher, /electron\.exe/);
  assert.match(smokeLauncher, /process\.platform === "darwin" \? 120_000 : 30_000/);
  assert.doesNotMatch(`${packageJson.scripts.desktop}\n${packageJson.scripts["package:mac"]}`, /npm (?:i|install|ci)|npx/u);
});

test("Given a packaged PDF pack reader, when the renderer requests a declared asset, then only checksum-verified bytes are exposed", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-bundled-pack-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fixture = await writePdfPackFixture(temporary);
  const reader = createBundledPdfPackReader({ root: temporary });

  assert.deepEqual(reader.describe(), {
    available: true, id: PDF_PACK_FIXTURE.id, version: PDF_PACK_FIXTURE.version,
    title: fixture.pack.title, documentCount: 1, pageCount: 1,
  });
  assert.equal(Buffer.from(await reader.read("documents/fixture.pdf")).subarray(0, 5).toString("ascii"), "%PDF-");
  await assert.rejects(reader.read("../pack.json"), /safe relative path/i);
  await assert.rejects(reader.read("undeclared.pdf"), /not declared/i);
  await writeFile(path.join(temporary, "documents", "fixture.pdf"), "%PDF-tampered");
  await assert.rejects(reader.read("documents/fixture.pdf"), /checksum does not match/i);
});

test("Given the desktop bundled-pack bridge, when its catalog loads and one PDF opens, then the existing remote validator drives the local bytes", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-bundled-driver-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writePdfPackFixture(temporary);
  const reader = createBundledPdfPackReader({ root: temporary });
  const bridge = { bundledPack: async () => reader.describe(), readBundledPack: (assetPath) => reader.read(assetPath) };
  const pack = await loadBundledDesktopPack(bridge);
  let opened;

  const document = await pack.openDocument({
    async openDocument(input) { opened = input; return { id: input.id, pageCount: 1 }; },
  }, pack.documents[0]);

  assert.equal(pack.documentCount, 1);
  assert.equal(pack.searchIndex.entries.length, 1);
  assert.equal(document.id, pack.documents[0].id);
  assert.equal(new TextDecoder().decode(opened.data.subarray(0, 5)), "%PDF-");
});
