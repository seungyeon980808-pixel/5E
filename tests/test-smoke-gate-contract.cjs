const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { desktopSmokePasses, requiredTruthy } = require("../desktop/smoke-contract.cjs");

function passingResult() {
  return Object.assign(Object.fromEntries(requiredTruthy.map((field) => [field, true])), {
    buttonText: "AI 이미지 변환",
    codexSendInvocationsDuringLocalSmoke: 0,
    fixtureSendCount: 1,
    realSendCount: 0,
    installDialogOpened: false,
  });
}

test("desktop smoke gate preserves current reference, comparison, comment, and public output requirements", () => {
  const baseline = passingResult();
  assert.equal(desktopSmokePasses(baseline), true);
  const groups = {
    "current-reference-and-task": ["currentSourceReferenceWorks", "aiReferencesOpenImmediately", "aiTaskIsolationWorks"],
    "current-comparison-and-comment": ["aiCurrentComparisonReady", "aiAreaCommentReady", "aiAreaCommentTracksZoom"],
    "public-output-contract": ["aiPublicRasterVisible", "aiPublicAssetHidden"],
    "native-safety-and-dialog": ["codexSendInvocationsDuringLocalSmoke", "fixtureSendCount", "realSendCount", "installDialogOpened"],
  };
  const mutations = [];
  for (const [name, fields] of Object.entries(groups)) {
    for (const field of fields) {
      const mutated = {
        ...baseline,
        [field]: field === "codexSendInvocationsDuringLocalSmoke" || field === "realSendCount" ? 1 : field === "fixtureSendCount" ? 0 : field === "installDialogOpened" ? true : false,
      };
      assert.equal(desktopSmokePasses(mutated), false, `${name} must reject missing ${field}`);
      mutations.push({ group: name, field, passes: desktopSmokePasses(mutated) });
    }
  }
  const wrongLabel = { ...baseline, buttonText: "AI 이미지 생성" };
  assert.equal(desktopSmokePasses(wrongLabel), false, "the retired AI trigger label must fail the current contract");
  mutations.push({ group: "current-trigger-label", field: "buttonText", passes: desktopSmokePasses(wrongLabel) });

  const main = fs.readFileSync(path.join(__dirname, "../desktop/main.cjs"), "utf8");
  const currentBlockStart = main.indexOf("let currentSourceReferenceWorks");
  const resultStart = main.lastIndexOf("resolve({", main.indexOf("buttonText:", currentBlockStart));
  const resultEnd = main.indexOf("const ok = desktopSmokePasses", resultStart);
  assert.ok(currentBlockStart >= 0 && resultStart >= 0 && resultEnd > resultStart, "current native smoke producer block is present");
  const producer = main.slice(resultStart, resultEnd);
  const producerConsumer = requiredTruthy.map((field) => ({
    field,
    produced: new RegExp(`(?:\\b${field}\\s*[:,]|result\\.${field}\\s*=)`).test(producer),
  }));
  assert.deepEqual(producerConsumer.filter(({ produced }) => !produced), [], "every required truthy field is returned by the native producer");
  const currentAiBlock = main.slice(currentBlockStart, resultStart);
  for (const retiredSelector of [".examlib-card", ".partslib-card", "[data-ai-compare]", "[data-ai-output-engine=\\\"asset\\\"]?.click"]) {
    assert.equal(currentAiBlock.includes(retiredSelector), false, `retired native smoke path must stay absent: ${retiredSelector}`);
  }
  if (process.env.EVIDENCE_DIR) {
    fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, "smoke-gate-contract.json"), `${JSON.stringify({ baselinePasses: true, mutations, producerConsumer }, null, 2)}\n`);
  }
});
