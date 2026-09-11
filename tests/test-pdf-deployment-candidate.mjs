import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Given a validated pack, when a deployment candidate is assembled, then app and pack are independent and no staged path contains .omo", async (t) => {
  // Given
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-candidate-test-"));
  const output = path.join(temporary, "candidate");
  const pack = path.resolve(".omo/evidence/pdf-library/T5/real-partial-pack");
  t.after(() => rm(temporary, { recursive: true, force: true }));

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
  assert.equal(candidate.pack.id, "ebsi.verified-partial.2026");
  assert.equal(candidate.pack.version, "1.0.0");
  assert.equal(candidate.pack.path, "pack/recent-three");
  assert.match(candidate.pack.packManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(candidate.pack.checksumsManifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(candidate.pack.bytes > 0, true);
  assert.equal(JSON.stringify(candidate).includes(".omo"), false);
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
