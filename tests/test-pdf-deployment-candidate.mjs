import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { PDF_PACK_FIXTURE, writePdfPackFixture } from "./helpers/pdf-pack-fixture.mjs";

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
  const workflow = await readFile(path.resolve(".github/workflows/windows-candidate.yml"), "utf8");

  assert.match(packageJson.scripts["package:win"], /--x64/);
  assert.equal(packageJson.build.files.includes("!node_modules/@napi-rs/canvas-darwin-*/**/*"), true);
  assert.equal("files" in packageJson.build.win, false);
  assert.match(workflow, /workflow_dispatch/);
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
  assert.match(packageJson.scripts["package:mac"], /^electron-builder --mac dmg --x64 --arm64 --publish never$/);
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
