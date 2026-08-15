const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  AUTHORITATIVE_FILES,
  CURRENT_NOTES,
  TARGET_ARTIFACT_NAME,
  TARGET_INSTALLER,
  TARGET_VERSION,
} = require("./release-identity-audit.cjs");

function replaceOnce(text, pattern, replacement, label) {
  const matches = text.match(pattern) || [];
  assert.equal(matches.length, 1, `fixture normalization must find one ${label}`);
  return text.replace(pattern, replacement);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createTargetFixture(sourceRoot, fixture) {
  for (const relativePath of AUTHORITATIVE_FILES.filter((file) => file !== CURRENT_NOTES)) {
    const destination = path.join(fixture, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(sourceRoot, relativePath), destination);
  }

  const pkgFile = path.join(fixture, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
  pkg.version = TARGET_VERSION;
  pkg.build.artifactName = TARGET_ARTIFACT_NAME;
  writeJson(pkgFile, pkg);

  const lockFile = path.join(fixture, "package-lock.json");
  const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  lock.version = TARGET_VERSION;
  lock.packages[""].version = TARGET_VERSION;
  writeJson(lockFile, lock);

  const indexFile = path.join(fixture, "index.html");
  let index = fs.readFileSync(indexFile, "utf8");
  index = replaceOnce(index, /css\/style\.css\?v=[^"&]+/g, `css/style.css?v=${TARGET_VERSION}`, "style cache entry");
  index = replaceOnce(index, /class="footer-brand">5E<\/strong>\s*<strong>v[^\s<]+/g, `class="footer-brand">5E</strong> <strong>v${TARGET_VERSION}`, "footer version");
  index = replaceOnce(index, /js\/main\.js\?v=[^"&]+/g, `js/main.js?v=${TARGET_VERSION}`, "main cache entry");
  fs.writeFileSync(indexFile, index);

  const mainFile = path.join(fixture, "js", "main.js");
  let main = fs.readFileSync(mainFile, "utf8");
  main = replaceOnce(main, /\.\/cut-tool\.js\?v=[^"&]+/g, `./cut-tool.js?v=${TARGET_VERSION}`, "cut tool cache entry");
  main = replaceOnce(main, /\[5E v[^\]]+\]/g, `[5E v${TARGET_VERSION}]`, "runtime banner");
  fs.writeFileSync(mainFile, main);

  const guideFile = path.join(fixture, "docs", "DESKTOP_WINDOWS.md");
  const guide = replaceOnce(fs.readFileSync(guideFile, "utf8"), /release\/[^`]+\.exe/g, `release/${TARGET_INSTALLER}`, "guide installer");
  fs.writeFileSync(guideFile, guide);

  const notes = fs.readFileSync(path.join(sourceRoot, "docs", "RELEASE_NOTES_v1.5.8.md"), "utf8")
    .replaceAll("v1.5.8", `v${TARGET_VERSION}`);
  const notesFile = path.join(fixture, CURRENT_NOTES);
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, notes);
}

function runAuditCli(root) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "release-identity-audit.cjs"), root], {
    encoding: "utf8",
  });
  process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status;
}

if (require.main === module) {
  const sourceRoot = path.join(__dirname, "..");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-identity-manual-"));
  let matchingExit;
  let mismatchExit;
  try {
    createTargetFixture(sourceRoot, fixture);
    matchingExit = runAuditCli(fixture);
    const pkgFile = path.join(fixture, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    pkg.version = "9.9.9";
    writeJson(pkgFile, pkg);
    mismatchExit = runAuditCli(fixture);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  process.stdout.write(`matching_exit=${matchingExit}\nmismatch_exit=${mismatchExit}\nfixture_cleaned=${!fs.existsSync(fixture)}\n`);
  process.exitCode = matchingExit === 0 && mismatchExit === 1 ? 0 : 1;
}

module.exports = { createTargetFixture, replaceOnce, writeJson };
