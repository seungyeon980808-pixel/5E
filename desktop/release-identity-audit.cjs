const fs = require("node:fs");
const path = require("node:path");

const TARGET_VERSION = "1.6.0-rc.1";
const TARGET_INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";
const TARGET_ARTIFACT_NAME = "5E-Setup-${version}-windows-${arch}.${ext}";
const CURRENT_NOTES = "docs/RELEASE_NOTES_v1.6.0-rc.1.md";

const AUTHORITATIVE_FILES = Object.freeze([
  "package.json",
  "package-lock.json",
  "index.html",
  "js/main.js",
  "docs/DESKTOP_WINDOWS.md",
  CURRENT_NOTES,
]);

function readText(root, relativePath) {
  try {
    return { value: fs.readFileSync(path.join(root, relativePath), "utf8") };
  } catch (error) {
    return { error: error.code === "ENOENT" ? "<missing file>" : `<unreadable: ${error.code || "error"}>` };
  }
}

function readJson(root, relativePath) {
  const text = readText(root, relativePath);
  if (text.error) return text;
  try {
    return { value: JSON.parse(text.value) };
  } catch {
    return { error: "<malformed JSON>" };
  }
}

function captured(text, pattern) {
  if (typeof text !== "string") return text || "<unavailable>";
  if (/^<[^>]+>$/.test(text)) return text;
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return "<missing>";
  if (matches.length > 1) return `<ambiguous: ${matches.length} matches>`;
  return matches[0][1];
}

function auditReleaseIdentity(root) {
  const pkg = readJson(root, "package.json");
  const lock = readJson(root, "package-lock.json");
  const index = readText(root, "index.html");
  const main = readText(root, "js/main.js");
  const guide = readText(root, "docs/DESKTOP_WINDOWS.md");
  const notes = readText(root, CURRENT_NOTES);
  const packageValue = (selector) => pkg.error || selector(pkg.value) || "<missing>";
  const lockValue = (selector) => lock.error || selector(lock.value) || "<missing>";

  const surfaces = [
    ["package-version", "package.json", TARGET_VERSION, packageValue((value) => value.version)],
    ["lock-root-version", "package-lock.json", TARGET_VERSION, lockValue((value) => value.version)],
    ["lock-package-version", "package-lock.json", TARGET_VERSION, lockValue((value) => value.packages?.[""]?.version)],
    ["installer-artifact-name", "package.json", TARGET_ARTIFACT_NAME, packageValue((value) => value.build?.artifactName)],
    ["footer-version", "index.html", TARGET_VERSION, captured(index.value || index.error, /class="footer-brand">5E<\/strong>\s*<strong>v([^\s<]+)\s*·/g)],
    ["style-cache-version", "index.html", TARGET_VERSION, captured(index.value || index.error, /href="css\/style\.css\?v=([^"&]+)"/g)],
    ["main-cache-version", "index.html", TARGET_VERSION, captured(index.value || index.error, /src="js\/main\.js\?v=([^"&]+)"/g)],
    ["cut-tool-cache-version", "js/main.js", TARGET_VERSION, captured(main.value || main.error, /from\s+"\.\/cut-tool\.js\?v=([^"&]+)"/g)],
    ["runtime-banner-version", "js/main.js", TARGET_VERSION, captured(main.value || main.error, /\[5E v([^\]]+)\]/g)],
    ["current-notes-metadata", CURRENT_NOTES, TARGET_VERSION, captured(notes.value || notes.error, /release-title:\s+v([^\s]+)\s/g)],
    ["current-notes-heading", CURRENT_NOTES, TARGET_VERSION, captured(notes.value || notes.error, /^#\s+v([^\s]+)\s/mg)],
    ["desktop-guide-installer", "docs/DESKTOP_WINDOWS.md", TARGET_INSTALLER, captured(guide.value || guide.error, /release\/([^`]+\.exe)/g)],
  ].map(([id, file, expected, actual]) => ({ id, file, expected, actual }));

  return {
    targetVersion: TARGET_VERSION,
    surfaces,
    errors: surfaces.filter(({ actual, expected }) => actual !== expected),
  };
}

function formatAudit(audit) {
  if (audit.errors.length === 0) {
    return `[release-identity] PASS target ${audit.targetVersion}; ${audit.surfaces.length} authoritative surfaces`;
  }
  return [
    `[release-identity] FAIL target ${audit.targetVersion}; ${audit.errors.length}/${audit.surfaces.length} mismatches`,
    ...audit.errors.map(({ id, file, expected, actual }) => `- ${id} (${file}): expected ${expected}, found ${actual}`),
  ].join("\n");
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const audit = auditReleaseIdentity(root);
  process.stdout.write(`${formatAudit(audit)}\n`);
  process.exitCode = audit.errors.length === 0 ? 0 : 1;
}

module.exports = {
  AUTHORITATIVE_FILES,
  CURRENT_NOTES,
  TARGET_ARTIFACT_NAME,
  TARGET_INSTALLER,
  TARGET_VERSION,
  auditReleaseIdentity,
  formatAudit,
};
