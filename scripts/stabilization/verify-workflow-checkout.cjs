const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TARGET_VERSION = "1.6.0-rc.1";
const FULL_SHA = /^[0-9a-f]{40}$/;
const MODES = new Set(["input", "manual", "pr"]);

function gitHead(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", shell: false });
  if (result.status !== 0 || result.error) throw new Error("GIT_HEAD_READ_FAILED");
  return result.stdout.trim();
}

function packageVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  } catch {
    throw new Error("PACKAGE_JSON_INVALID");
  }
}

function verifyCheckout({ mode, expectedSha, root, readHead = gitHead }) {
  if (!MODES.has(mode)) throw new Error("VALIDATION_MODE_INVALID");
  if (!FULL_SHA.test(expectedSha || "")) throw new Error("EXPECTED_SHA_INVALID");
  if (mode === "input") return { mode, sha: expectedSha };
  const actualSha = readHead(root);
  if (actualSha !== expectedSha) throw new Error("HEAD_SHA_MISMATCH");
  if (mode === "pr") return { mode, sha: actualSha };
  const version = packageVersion(root);
  if (version !== TARGET_VERSION) throw new Error("CANDIDATE_VERSION_MISMATCH");
  return { mode, sha: actualSha, version };
}

function runCli() {
  try {
    const root = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, "..", "..");
    const receipt = verifyCheckout({ mode: process.argv[2], expectedSha: process.env.EXPECTED_SHA, root });
    process.stdout.write(`${JSON.stringify({ gate: "workflow-checkout", state: "passed", ...receipt })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = runCli();

module.exports = { verifyCheckout };
