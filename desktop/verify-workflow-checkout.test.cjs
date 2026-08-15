const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { verifyCheckout } = require("../scripts/stabilization/verify-workflow-checkout.cjs");

const SHA = "eed4ca599c55c34d8685bd06792e8f2d39ba1428";

function fixture(t, version = "1.6.0-rc.1") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-workflow-checkout-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version }));
  return root;
}

test("manual candidate validation binds a full lowercase requested SHA to HEAD and RC version", (t) => {
  const result = verifyCheckout({ mode: "manual", expectedSha: SHA, root: fixture(t), readHead: () => SHA });
  assert.deepEqual(result, { mode: "manual", sha: SHA, version: "1.6.0-rc.1" });
});

test("pull request validation binds the event head SHA to HEAD", (t) => {
  const result = verifyCheckout({ mode: "pr", expectedSha: SHA, root: fixture(t), readHead: () => SHA });
  assert.equal(result.sha, SHA);
});

for (const [name, input, code] of [
  ["short SHA", { mode: "input", expectedSha: "eed4ca5" }, "EXPECTED_SHA_INVALID"],
  ["uppercase SHA", { mode: "input", expectedSha: SHA.toUpperCase() }, "EXPECTED_SHA_INVALID"],
  ["shell-shaped SHA", { mode: "input", expectedSha: `${SHA}; git push origin HEAD` }, "EXPECTED_SHA_INVALID"],
  ["unknown mode", { mode: "publish", expectedSha: SHA }, "VALIDATION_MODE_INVALID"],
  ["HEAD mismatch", { mode: "manual", expectedSha: SHA, readHead: () => "0".repeat(40) }, "HEAD_SHA_MISMATCH"],
  ["candidate version mismatch", { mode: "manual", expectedSha: SHA, version: "9.9.9", readHead: () => SHA }, "CANDIDATE_VERSION_MISMATCH"],
]) {
  test(`workflow checkout validator rejects ${name}`, (t) => {
    const root = fixture(t, input.version);
    assert.throws(() => verifyCheckout({ root, readHead: () => SHA, ...input }), new RegExp(code));
  });
}
