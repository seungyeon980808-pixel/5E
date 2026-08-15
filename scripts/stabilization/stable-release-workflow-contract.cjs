const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const { parseWorkflow } = require("./workflow-yaml-subset.cjs");

const CHECKOUT = "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683";
const SETUP_NODE = "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020";
const UPLOAD = "actions/upload-artifact@65462800fd760344b1a7b4382951275a0abb4808";
const DOWNLOAD = "actions/download-artifact@fa0a91b85d4f404e444e00e005971372dc801d16";
const SHA = "${{ github.sha }}";
const TAG = "${{ github.ref_name }}";
const ARTIFACT = "stable-release-${{ github.sha }}";
const env = { RELEASE_TAG: TAG, EXPECTED_SHA: SHA };
const protectionEnv = {
  STABLE_RELEASE_ENVIRONMENT_TOKEN: "${{ github.token }}",
  GITHUB_REPOSITORY_NAME: "${{ github.repository }}",
  GITHUB_API_URL: "${{ github.api_url }}",
};

const EXPECTED = Object.freeze({
  topLevel: ["concurrency", "jobs", "name", "on", "permissions"],
  trigger: { push: { tags: ["v*"] } },
  permissions: { contents: "read" },
  concurrency: { group: "stable-release-${{ github.ref }}", "cancel-in-progress": false },
  jobs: {
    "verify-publish-environment": {
      metadata: { "runs-on": "ubuntu-latest", "timeout-minutes": 5, permissions: { actions: "read", contents: "read" } },
      steps: [
        { uses: CHECKOUT, with: { ref: SHA, "persist-credentials": false } },
        { uses: SETUP_NODE, with: { "node-version": 20 } },
        { env: protectionEnv, run: "node scripts/stabilization/stable-release-environment.cjs" },
      ],
    },
    "verify-and-build": {
      metadata: { needs: "verify-publish-environment", "runs-on": "windows-latest", "timeout-minutes": 60 },
      steps: [
        { uses: CHECKOUT, with: { ref: SHA, "fetch-depth": 0, "persist-credentials": false } },
        { uses: SETUP_NODE, with: { "node-version": 20, cache: "npm" } },
        { env, run: "node scripts/stabilization/stable-release-cli.cjs preflight" },
        { run: "npm ci" },
        { run: "npm run verify:release" },
        { run: "npm run package:win -- \"-c.extraMetadata.buildCommit=${{ github.sha }}\"" },
        { shell: "pwsh", run: "$version = node -p \"require('./package.json').version\"\nnode scripts/stabilization/package-artifact-audit.cjs --strict --artifact release/win-unpacked --web-version $version --web-commit $env:GITHUB_SHA > release/package-artifact-audit.json" },
        { id: "bundle", env, run: "node scripts/stabilization/stable-release-cli.cjs bundle" },
        { shell: "pwsh", run: "Copy-Item -LiteralPath scripts/stabilization/stable-release-environment.cjs -Destination release/stable-release-environment.cjs\nCopy-Item -LiteralPath scripts/stabilization/strict-json.cjs -Destination release/strict-json.cjs" },
        { uses: UPLOAD, with: { name: ARTIFACT, path: "${{ steps.bundle.outputs.installer }}\n${{ steps.bundle.outputs.checksum }}\n${{ steps.bundle.outputs.notes }}\n${{ steps.bundle.outputs.plan }}\n${{ steps.bundle.outputs.audit }}\nrelease/stable-release-environment.cjs\nrelease/strict-json.cjs", "if-no-files-found": "error", "retention-days": 1 } },
      ],
    },
    "publish-draft": {
      metadata: { needs: "verify-and-build", "runs-on": "windows-latest", "timeout-minutes": 15, environment: "stable-release", permissions: { actions: "read", contents: "write" } },
      steps: [
        { uses: DOWNLOAD, with: { name: ARTIFACT, path: "release" } },
        { env: protectionEnv, run: "node release/stable-release-environment.cjs" },
        { uses: CHECKOUT, with: { ref: SHA, "fetch-depth": 0, "persist-credentials": false, clean: false } },
        { id: "publish", env, run: "node scripts/stabilization/stable-release-cli.cjs publish" },
        { env: protectionEnv, run: "node release/stable-release-environment.cjs" },
        { shell: "pwsh", env: { GH_TOKEN: "${{ github.token }}" }, run: "gh release create \"${{ steps.publish.outputs.tag }}\" \"${{ steps.publish.outputs.installer }}\" \"${{ steps.publish.outputs.checksum }}\" --verify-tag --target \"${{ steps.publish.outputs.commit }}\" --draft --latest --notes-file \"${{ steps.publish.outputs.notes }}\" --title \"5E ${{ steps.publish.outputs.tag }}\"" },
      ],
    },
  },
});

function machineStep(step) {
  if (!step || typeof step !== "object") return step;
  const { name, ...fields } = step;
  return fields;
}

function auditStableReleaseWorkflow(file) {
  if (!fs.existsSync(file)) return ["WORKFLOW_MISSING"];
  let workflow;
  try { workflow = parseWorkflow(fs.readFileSync(file, "utf8")); }
  catch { return ["WORKFLOW_PARSE_FAILED"]; }
  const errors = [];
  if (!isDeepStrictEqual(Object.keys(workflow).sort(), EXPECTED.topLevel)) errors.push("TOP_LEVEL_INVALID");
  if (workflow.name !== "Windows Stable Release") errors.push("WORKFLOW_NAME_INVALID");
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

module.exports = { auditStableReleaseWorkflow };
