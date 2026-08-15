const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseStrictJson } = require("../scripts/stabilization/strict-json.cjs");

const ROOT = path.resolve(__dirname, "..");
const HANDOFF = path.join(ROOT, "docs", "RC_HANDOFF.md");
const UAT_IDS = ["real-account-network", "clean-machine-install", "clean-machine-upgrade", "clean-machine-uninstall"];
const PROMOTION_GATES = [
  "automated-verification", "sha256-verified", "real-account-network-uat", "clean-machine-lifecycle-uat",
  "no-open-p0-p1", "p2-decision-recorded", "signing-decision-recorded", "public-docs-promoted",
];

function fail(code) {
  throw new Error(code);
}

function parseContract(markdown) {
  const match = /<!-- rc-handoff-contract -->\s*```json\s*([\s\S]*?)\s*```/u.exec(markdown);
  if (!match) fail("HANDOFF_CONTRACT_MISSING");
  try { return parseStrictJson(match[1]); }
  catch { fail("HANDOFF_CONTRACT_INVALID"); }
}

function validateLinks(markdown) {
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const target = match[1].split("#")[0];
    if (!target || /^[a-z]+:/iu.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(HANDOFF), target))) fail("HANDOFF_LINK_MISSING");
  }
}

function validateContract(markdown) {
  const contract = parseContract(markdown);
  if (contract.schema !== "5e-private-rc-handoff@1") fail("HANDOFF_SCHEMA_INVALID");
  if (contract.candidate?.version !== "1.6.0-rc.1" || contract.candidate?.scope !== "agent-local"
    || contract.candidate?.publicReleaseClaim !== false) fail("CANDIDATE_SCOPE_INVALID");
  if (contract.publicStable !== "v1.5.8") fail("PUBLIC_STABLE_INVALID");
  if (!Array.isArray(contract.uat) || contract.uat.map(({ id }) => id).join("|") !== UAT_IDS.join("|")
    || contract.uat.some(({ status, passRecorded }) => status !== "DEFERRED" || passRecorded !== false)) {
    fail("UAT_DEFERRED_REQUIRED");
  }
  if (contract.signing?.expectedStatus !== "NotSigned" || contract.signing?.warningRequired !== true) {
    fail("SIGNING_WARNING_REQUIRED");
  }
  if (contract.integrity?.manifest !== "SHA256SUMS.txt" || contract.integrity?.verificationRequired !== true) {
    fail("INTEGRITY_CONTRACT_INVALID");
  }
  if (contract.privacy?.redactionRequired !== true || contract.privacy?.privateFilenamesForbidden !== true) {
    fail("PRIVACY_CONTRACT_INVALID");
  }
  if (contract.issueSeverities?.join("|") !== "P0|P1|P2|P3") fail("ISSUE_SEVERITIES_INVALID");
  if (contract.recovery?.rcFixForward !== "1.6.0-rc.N" || contract.recovery?.stablePatch !== "1.6.1"
    || contract.recovery?.rollbackStable !== "v1.5.8") fail("RECOVERY_POLICY_INVALID");
  if (contract.promotion?.status !== "BLOCKED" || contract.promotion?.gates?.join("|") !== PROMOTION_GATES.join("|")) {
    fail("PROMOTION_GATES_INVALID");
  }
  validateLinks(markdown);
  if (!/^# /mu.test(markdown) || (markdown.match(/^```/gmu) || []).length % 2 !== 0) fail("MARKDOWN_STRUCTURE_INVALID");
  return contract;
}

test("Given the current private RC handoff, When parsed, Then deferred UAT and stable promotion remain distinct", () => {
  const markdown = fs.existsSync(HANDOFF) ? fs.readFileSync(HANDOFF, "utf8") : "";
  const contract = validateContract(markdown);
  assert.equal(contract.promotion.status, "BLOCKED");
});

test("Given controlled omissions, When validated, Then missing DEFERRED or signing warning fails closed", () => {
  const markdown = fs.existsSync(HANDOFF) ? fs.readFileSync(HANDOFF, "utf8") : "";
  const missingDeferred = markdown.replace('"status": "DEFERRED"', '"status": "PASS"');
  const missingWarning = markdown.replace('"warningRequired": true', '"warningRequired": false');
  assert.throws(() => validateContract(missingDeferred), /UAT_DEFERRED_REQUIRED/);
  assert.throws(() => validateContract(missingWarning), /SIGNING_WARNING_REQUIRED/);
});

module.exports = { parseContract, validateContract };
