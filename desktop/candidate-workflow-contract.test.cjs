const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { auditCandidateWorkflow } = require("../scripts/stabilization/candidate-workflow-contract.cjs");

const root = path.join(__dirname, "..");
const workflow = path.join(root, ".github", "workflows", "candidate-verification.yml");
const checkout = "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683";
const setupNode = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020";

function replaceFirst(source, original, replacement) {
  assert.ok(source.includes(original), `fixture mutation must find ${original}`);
  return source.replace(original, replacement);
}

function auditMutation(t, mutate) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-candidate-workflow-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const file = path.join(fixture, "candidate-verification.yml");
  fs.writeFileSync(file, mutate(fs.readFileSync(workflow, "utf8")));
  return auditCandidateWorkflow(file);
}

test("candidate workflow has the exact non-publishing execution contract", () => {
  assert.deepEqual(auditCandidateWorkflow(workflow), []);
});

const verifyRun = "run: npm run verify:release";
const prValidation = "run: node scripts/stabilization/verify-workflow-checkout.cjs pr";
const manualValidation = "run: node .workflow-source/scripts/stabilization/verify-workflow-checkout.cjs manual .candidate";
const installBlock = "      - name: Install dependencies\n        run: npm ci";
const verifyBlock = "      - name: Run the complete release verification gate\n        run: npm run verify:release";

for (const [name, mutate, expected] of [
  ["write permission", (text) => replaceFirst(text, "contents: read", "contents: write"), "PERMISSIONS_NOT_READ_ONLY"],
  ["push trigger", (text) => replaceFirst(text, "on:\n", "on:\n  push:\n"), "TRIGGER_CONTRACT_INVALID"],
  ["mutable action tag", (text) => replaceFirst(text, checkout, "actions/checkout@v4"), "STEP_SCHEMA_INVALID"],
  ["omitted action ref", (text) => replaceFirst(text, checkout, "actions/checkout"), "STEP_SCHEMA_INVALID"],
  ["local action", (text) => replaceFirst(text, setupNode, "./.github/actions/unreviewed"), "STEP_SCHEMA_INVALID"],
  ["artifact upload", (text) => replaceFirst(text, setupNode, "actions/upload-artifact@0000000000000000000000000000000000000000"), "STEP_SCHEMA_INVALID"],
  ["Pages deployment", (text) => replaceFirst(text, setupNode, "actions/deploy-pages@0000000000000000000000000000000000000000"), "STEP_SCHEMA_INVALID"],
  ["release action", (text) => replaceFirst(text, setupNode, "actions/create-release@0000000000000000000000000000000000000000"), "STEP_SCHEMA_INVALID"],
  ["git.exe push", (text) => replaceFirst(text, verifyRun, "run: git.exe push origin HEAD"), "STEP_SCHEMA_INVALID"],
  ["gh.exe release", (text) => replaceFirst(text, verifyRun, "run: gh.exe release create v1.6.0"), "STEP_SCHEMA_INVALID"],
  ["semicolon suffix", (text) => replaceFirst(text, verifyRun, `${verifyRun}; git push origin HEAD`), "STEP_SCHEMA_INVALID"],
  ["quoted command", (text) => replaceFirst(text, verifyRun, `run: '\"npm run verify:release\"'`), "STEP_SCHEMA_INVALID"],
  ["comment marker", (text) => replaceFirst(text, verifyRun, `${verifyRun} # accepted; gh release create v1.6.0`), "STEP_SCHEMA_INVALID"],
  ["fake PR comparison", (text) => replaceFirst(text, prValidation, "run: node -e \"process.exit(0)\""), "STEP_SCHEMA_INVALID"],
  ["fake manual comparison", (text) => replaceFirst(text, manualValidation, "run: node -e \"process.exit(0)\""), "STEP_SCHEMA_INVALID"],
  ["manual ref mismatch", (text) => replaceFirst(text, "ref: ${{ inputs.candidate_sha }}", "ref: ${{ github.sha }}"), "STEP_SCHEMA_INVALID"],
  ["pull request ref mismatch", (text) => replaceFirst(text, "ref: ${{ github.event.pull_request.head.sha }}", "ref: ${{ github.sha }}"), "STEP_SCHEMA_INVALID"],
  ["extra step", (text) => replaceFirst(text, "    steps:\n", "    steps:\n      - run: echo unreviewed\n"), "STEP_SCHEMA_INVALID"],
  ["reordered steps", (text) => replaceFirst(text, `${installBlock}\n${verifyBlock}`, `${verifyBlock}\n${installBlock}`), "STEP_SCHEMA_INVALID"],
  ["extra job", (text) => `${text}\n  unreviewed:\n    runs-on: windows-latest\n    steps:\n      - run: npm test\n`, "JOB_SET_INVALID"],
]) {
  test(`candidate workflow rejects ${name}`, (t) => {
    const errors = auditMutation(t, mutate);
    assert.ok(errors.some((error) => error.includes(expected)), errors.join("\n"));
  });
}
