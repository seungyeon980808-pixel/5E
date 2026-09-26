const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { desktopSmokePasses, requiredTruthy } = require("../desktop/smoke-contract.cjs");

function passingResult() {
  return Object.assign(Object.fromEntries(requiredTruthy.map((field) => [field, true])), {
    buttonText: "AI 이미지 생성",
    codexSendInvocationsDuringLocalSmoke: 0,
    installDialogOpened: false,
  });
}

test("desktop smoke gate preserves current reference, comparison, comment, and local-asset requirements", () => {
  const baseline = passingResult();
  assert.equal(desktopSmokePasses(baseline), true);
  const groups = {
    "exam-reference-transfer": ["examLibraryAiReferenceWorks", "imageLibraryAiReferenceWorks", "aiMultipleReferencesReady", "aiReferencesOpenImmediately"],
    "comparison-and-comment": ["aiComparisonReady", "aiAreaCommentReady", "aiAreaCommentTracksZoom"],
    "local-asset-and-apparatus": ["aiLocalAssetZeroRoundTripWorks", "aiLocalApparatusZeroRoundTripWorks"],
    "native-safety-and-dialog": ["codexSendInvocationsDuringLocalSmoke", "installDialogOpened"],
  };
  const mutations = [];
  for (const [name, fields] of Object.entries(groups)) {
    for (const field of fields) {
      const mutated = {
        ...baseline,
        [field]: field === "codexSendInvocationsDuringLocalSmoke" ? 1 : field === "installDialogOpened" ? true : false,
      };
      assert.equal(desktopSmokePasses(mutated), false, `${name} must reject missing ${field}`);
      mutations.push({ group: name, field, passes: desktopSmokePasses(mutated) });
    }
  }
  if (process.env.EVIDENCE_DIR) {
    fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, "smoke-gate-contract.json"), `${JSON.stringify({ baselinePasses: true, mutations }, null, 2)}\n`);
  }
});
