#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const json = (relativePath) => JSON.parse(read(relativePath));

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  assert.ok(value && !value.startsWith("--"), `${name} requires a value`);
  return value;
}

function visibleVersion(html, element, version) {
  const content = html.match(new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\\/${element}>`, "i"))?.[1] || "";
  return new RegExp(`\\bv?${version.replaceAll(".", "\\.")}\\b`).test(content);
}

function checkReleaseIdentity({ tag = null, sha = null } = {}) {
  const metadata = json("release-channels.json");
  const pkg = json("package.json");
  const lock = json("package-lock.json");
  const version = metadata.candidate?.version;
  assert.match(version || "", /^\d+\.\d+\.\d+$/, "candidate version must be stable semver");
  assert.equal(pkg.version, version, "package.version must equal candidate version");
  assert.equal(lock.version, version, "package-lock.version must equal candidate version");
  assert.equal(lock.packages?.[""]?.version, version, "package-lock root version must equal candidate version");
  assert.equal(metadata.channels?.desktop?.version, version, "desktop channel must equal candidate version");
  assert.equal(metadata.channels?.stableWeb?.version, version, "stable web channel must equal candidate version");
  assert.equal(metadata.candidate.desktopEntry, "index.html", "desktop must use the canonical root entry");
  assert.equal(metadata.channels.desktop.entry, metadata.candidate.desktopEntry, "desktop entry must match candidate entry");
  assert.equal(pkg.engines?.node, ">=24.21.0 <25", "Node engine must stay on the pinned Node 24 LTS line");
  assert.equal(read(".nvmrc").trim(), "24.21.0", ".nvmrc must pin Node 24.21.0");
  assert.equal(pkg.devDependencies?.electron, "44.4.5", "Electron must be pinned to 44.4.5");
  assert.equal(pkg.devDependencies?.playwright, "1.62.1", "Playwright must be pinned to the audited browser tuple");
  assert.equal(pkg.build?.win?.artifactName, "5E-${version}-windows-${arch}.${ext}");
  assert.equal(pkg.build?.mac?.artifactName, "5E-${version}-macos-${arch}.${ext}");
  assert.deepEqual(metadata.channels.desktop.artifacts, [
    `5E-${version}-windows-x64.exe`,
    `5E-${version}-macos-x64.dmg`,
    `5E-${version}-macos-arm64.dmg`,
    `5E-${version}-macos-x64.zip`,
    `5E-${version}-macos-arm64.zip`,
  ]);
  const preview = read(metadata.candidate.desktopEntry);
  assert.ok(visibleVersion(preview, "title", version), "canonical title must show candidate version");
  assert.ok(visibleVersion(preview, "footer", version), "canonical footer must show candidate version");
  if (tag) assert.equal(tag, `v${version}`, `release tag ${tag} must equal candidate tag v${version}`);
  if (sha) {
    assert.match(sha, /^[0-9a-f]{40}$/, "--sha must be a full commit SHA");
    const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(actual, sha, `checked out SHA ${actual} must equal workflow SHA ${sha}`);
  }
  return { version, tag, sha };
}

try {
  const result = checkReleaseIdentity({ tag: argument("--tag"), sha: argument("--sha") });
  console.log(`Release identity OK: ${result.version}${result.tag ? ` tag=${result.tag}` : ""}${result.sha ? ` sha=${result.sha}` : ""}`);
} catch (error) {
  console.error(`Release identity FAILED: ${error.message}`);
  process.exitCode = 1;
}

module.exports = { checkReleaseIdentity };
