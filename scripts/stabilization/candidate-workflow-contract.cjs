const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const { parseWorkflow } = require("./workflow-yaml-subset.cjs");

const CHECKOUT = "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683";
const SETUP_NODE = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020";
const PR_SHA = "${{ github.event.pull_request.head.sha }}";
const INPUT_SHA = "${{ inputs.candidate_sha }}";

const checkout = (ref) => ({ uses: CHECKOUT, with: { ref, "persist-credentials": false } });
const setupNode = { uses: SETUP_NODE, with: { "node-version": 20, cache: "npm" } };
const manualSetupNode = {
  uses: SETUP_NODE,
  with: { "node-version": 20, cache: "npm", "cache-dependency-path": ".workflow-source/package-lock.json" },
};
const validate = (mode, sha) => ({
  env: { EXPECTED_SHA: sha },
  run: `node scripts/stabilization/verify-workflow-checkout.cjs ${mode}`,
});
const install = { run: "npm ci" };
const verify = { run: "npm run verify:release" };
const candidateInstall = { ...install, "working-directory": ".candidate" };
const candidateVerify = { ...verify, "working-directory": ".candidate" };

const EXPECTED = Object.freeze({
  topLevel: ["concurrency", "jobs", "name", "on", "permissions"],
  trigger: {
    pull_request: {},
    workflow_dispatch: {
      inputs: {
        candidate_sha: {
          description: "Full 40-character commit SHA to verify",
          required: true,
          type: "string",
        },
      },
    },
  },
  permissions: { contents: "read" },
  concurrency: {
    group: "candidate-verification-${{ github.event.pull_request.number || inputs.candidate_sha || github.run_id }}",
    "cancel-in-progress": true,
  },
  jobs: {
    "pull-request-verify": {
      metadata: { if: "github.event_name == 'pull_request'", "runs-on": "windows-latest", "timeout-minutes": 45 },
      steps: [checkout(PR_SHA), setupNode, validate("pr", PR_SHA), install, verify],
    },
    "manual-candidate-verify": {
      metadata: { if: "github.event_name == 'workflow_dispatch'", "runs-on": "windows-latest", "timeout-minutes": 45 },
      steps: [
        { uses: CHECKOUT, with: { ref: "${{ github.sha }}", "persist-credentials": false, path: ".workflow-source" } },
        manualSetupNode,
        { env: { EXPECTED_SHA: INPUT_SHA }, run: "node .workflow-source/scripts/stabilization/verify-workflow-checkout.cjs input" },
        { uses: CHECKOUT, with: { ref: INPUT_SHA, "persist-credentials": false, path: ".candidate" } },
        { env: { EXPECTED_SHA: INPUT_SHA }, run: "node .workflow-source/scripts/stabilization/verify-workflow-checkout.cjs manual .candidate" },
        candidateInstall,
        candidateVerify,
      ],
    },
  },
});

function machineStep(step) {
  if (!step || typeof step !== "object") return step;
  const { name, ...machineFields } = step;
  return machineFields;
}

function auditCandidateWorkflow(workflowPath) {
  if (!fs.existsSync(workflowPath)) return ["WORKFLOW_MISSING"];
  let workflow;
  try {
    workflow = parseWorkflow(fs.readFileSync(workflowPath, "utf8"));
  } catch {
    return ["WORKFLOW_PARSE_FAILED"];
  }
  const errors = [];
  if (!isDeepStrictEqual(Object.keys(workflow).sort(), EXPECTED.topLevel)) errors.push("TOP_LEVEL_INVALID");
  if (workflow.name !== "Candidate Verification") errors.push("WORKFLOW_NAME_INVALID");
  if (!isDeepStrictEqual(workflow.on, EXPECTED.trigger)) errors.push("TRIGGER_CONTRACT_INVALID");
  if (!isDeepStrictEqual(workflow.permissions, EXPECTED.permissions)) errors.push("PERMISSIONS_NOT_READ_ONLY");
  if (!isDeepStrictEqual(workflow.concurrency, EXPECTED.concurrency)) errors.push("CONCURRENCY_INVALID");
  if (!isDeepStrictEqual(Object.keys(workflow.jobs || {}).sort(), Object.keys(EXPECTED.jobs).sort())) {
    errors.push("JOB_SET_INVALID");
    return errors.sort();
  }
  for (const [name, expected] of Object.entries(EXPECTED.jobs)) {
    const { steps = [], ...metadata } = workflow.jobs[name] || {};
    if (!isDeepStrictEqual(metadata, expected.metadata)) errors.push(`${name}:JOB_SCHEMA_INVALID`);
    if (!isDeepStrictEqual(steps.map(machineStep), expected.steps)) errors.push(`${name}:STEP_SCHEMA_INVALID`);
  }
  return errors.sort();
}

module.exports = { auditCandidateWorkflow };
