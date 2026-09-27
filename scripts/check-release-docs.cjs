#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function fail(message) {
  throw new Error(message);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  if (!process.argv[index + 1]) fail(`${name} requires a value`);
  return process.argv[index + 1];
}

const root = path.resolve(option("--root") || path.join(__dirname, ".."));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const channels = JSON.parse(read("release-channels.json"));
const pkg = JSON.parse(read("package.json"));

if (channels.schemaVersion !== 3) fail("release-channels schemaVersion must be 3");
if (channels.candidate.version !== pkg.version) fail("candidate version must match package.version");
if (channels.candidate.status !== "HOLD") fail("candidate status must remain HOLD");
if (Object.hasOwn(channels.candidate, "sourceSha")) fail("candidate.sourceSha is forbidden; bind final SHA in the external artifact manifest");
if (channels.channels.latestPublishedDesktop.version !== "1.5.8") fail("latest published desktop must be v1.5.8");
if (channels.channels.latestPublishedDesktop.artifact.name !== "5E.Setup.1.5.8.exe") fail("published artifact basename mismatch");

const holdValues = channels.releaseHolds;
for (const [key, expected] of Object.entries({
  windowsSigning: "PENDING_EXTERNAL",
  nativeWindowsValidation: "PENDING_EXTERNAL",
  serverDeploymentAndAuth: "PENDING_EXTERNAL",
  liveAuthenticatedAi: "PENDING_EXTERNAL",
  worktreeRetention: "PENDING_OWNER_APPROVAL",
  sample7Rights: "UNVERIFIED",
  publishedV158Checksum: "OPEN_PENDING_PUBLICATION",
})) {
  if (holdValues[key] !== expected) fail(`release hold ${key} must be ${expected}`);
}

const requiredDocs = [
  "README.md",
  "docs/BRANCH_MAP.md",
  "docs/RELEASE_CHANNELS.md",
  "docs/RELEASE_HOLD.md",
  "docs/RELEASE_NOTES_v1.6.0.md",
  "docs/RELEASE_ROLLBACK.md",
  "preview/PREVIEW.md",
];
const combined = requiredDocs.map(read).join("\n");
for (const token of ["v1.5.8", "https://www.5e.ai.kr/", "HOLD", "UNVERIFIED", "OPEN_PENDING_PUBLICATION"]) {
  if (!combined.includes(token)) fail(`release docs missing ${token}`);
}

const driveConfig = JSON.parse(read("preview/assets/pdf-library/google-drive.json"));
if (driveConfig.schemaVersion !== 1) fail("PDF/Drive metadata schemaVersion must be 1");
let driveGateway;
try {
  driveGateway = new URL(driveConfig.gatewayBaseUrl);
} catch {
  fail("PDF/Drive metadata gatewayBaseUrl must be a valid URL");
}
if (driveGateway.protocol !== "https:" || !driveGateway.hostname) {
  fail("PDF/Drive metadata gatewayBaseUrl must use HTTPS");
}

const correctedV158 = read("docs/checksums/SHA256SUMS-v1.5.8-corrected.txt").trim();
const publishedArtifact = channels.channels.latestPublishedDesktop.artifact;
if (correctedV158 !== `${publishedArtifact.sha256}  ${publishedArtifact.name}`) {
  fail("corrected v1.5.8 checksum packet does not match public artifact metadata");
}

for (const relative of requiredDocs) {
  const source = read(relative);
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].split("#", 1)[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(path.join(root, relative)), target);
    if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved)) {
      fail(`${relative} has broken local link: ${match[1]}`);
    }
  }
}

const artifactsDirOption = option("--artifacts-dir");
const checksumsOption = option("--checksums");
if (Boolean(artifactsDirOption) !== Boolean(checksumsOption)) fail("--artifacts-dir and --checksums must be used together");

if (artifactsDirOption) {
  const artifactsDir = path.resolve(artifactsDirOption);
  const checksumPath = path.resolve(checksumsOption);
  const actualNames = fs.readdirSync(artifactsDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const lines = fs.readFileSync(checksumPath, "utf8").split(/\r?\n/).filter(Boolean);
  const recorded = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
    if (!match) fail(`invalid checksum line or basename: ${line}`);
    if (recorded.has(match[2])) fail(`duplicate checksum basename: ${match[2]}`);
    recorded.set(match[2], match[1]);
  }
  if (JSON.stringify([...recorded.keys()].sort()) !== JSON.stringify(actualNames)) {
    fail(`checksum basenames do not match actual artifacts: expected ${actualNames.join(", ")}`);
  }
  for (const name of actualNames) {
    const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(artifactsDir, name))).digest("hex");
    if (recorded.get(name) !== digest) fail(`checksum mismatch for ${name}`);
  }
  console.log(`Artifact checksums OK: ${actualNames.length} files`);
}

console.log(`Release docs OK: candidate ${channels.candidate.version} ${channels.candidate.status}; PDF/Drive metadata schema ${driveConfig.schemaVersion}`);
