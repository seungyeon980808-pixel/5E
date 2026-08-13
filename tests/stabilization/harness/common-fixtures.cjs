const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function stableFixtureHash(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

async function withTemporaryDirectory(prefix, use) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await use(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { canonicalJson, stableFixtureHash, withTemporaryDirectory };
