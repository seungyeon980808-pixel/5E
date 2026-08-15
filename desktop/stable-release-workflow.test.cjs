const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { auditStableReleaseWorkflow } = require("../scripts/stabilization/stable-release-workflow-contract.cjs");

const root = path.join(__dirname, "..");
const workflow = path.join(root, ".github", "workflows", "windows-release.yml");

function replace(source, original, replacement) {
  assert.ok(source.includes(original), `fixture mutation must find ${original}`);
  return source.replace(original, replacement);
}

function mutate(t, transform) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "5e-stable-workflow-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, "windows-release.yml");
  fs.writeFileSync(fixture, transform(fs.readFileSync(workflow, "utf8")));
  return auditStableReleaseWorkflow(fixture);
}

test("stable workflow has exact read-only verification and protected draft publication jobs", () => {
  assert.deepEqual(auditStableReleaseWorkflow(workflow), []);
});

for (const [name, transform, expected] of [
  ["global write permission", (s) => replace(s, "permissions:\n  contents: read", "permissions:\n  contents: write"), "PERMISSIONS_NOT_READ_ONLY"],
  ["verification write permission", (s) => replace(s, "  verify-and-build:\n", "  verify-and-build:\n    permissions:\n      contents: write\n"), "verify-and-build:JOB_SCHEMA_INVALID"],
  ["publish read permission", (s) => replace(s, "      contents: write", "      contents: read"), "publish-draft:JOB_SCHEMA_INVALID"],
  ["missing approval environment", (s) => replace(s, "    environment: stable-release", "    environment: {}"), "publish-draft:JOB_SCHEMA_INVALID"],
  ["missing read-only protection gate", (s) => replace(s, "  verify-publish-environment:", "  untrusted-environment-gate:"), "JOB_SET_INVALID"],
  ["build bypasses protection gate", (s) => replace(s, "    needs: verify-publish-environment", "    needs: []"), "verify-and-build:JOB_SCHEMA_INVALID"],
  ["protection API token removed", (s) => replace(s, "STABLE_RELEASE_ENVIRONMENT_TOKEN: ${{ github.token }}", "STABLE_RELEASE_ENVIRONMENT_TOKEN: ''"), "verify-publish-environment:STEP_SCHEMA_INVALID"],
  ["publish protection revalidation removed", (s) => replace(s, "run: node release/stable-release-environment.cjs", "run: echo skipped"), "publish-draft:STEP_SCHEMA_INVALID"],
  ["mutable action", (s) => replace(s, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "actions/checkout@v4"), "verify-publish-environment:STEP_SCHEMA_INVALID"],
  ["shallow publish checkout", (s) => replace(s, "      - name: Freshly fetch exact publish SHA, full history, tags, and main\n        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 0\n          persist-credentials: false\n          clean: false", "      - name: Freshly fetch exact publish SHA, full history, tags, and main\n        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683\n        with:\n          ref: ${{ github.sha }}\n          fetch-depth: 1\n          persist-credentials: false\n          clean: false"), "publish-draft:STEP_SCHEMA_INVALID"],
  ["removed release verification", (s) => replace(s, "run: npm run verify:release", "run: npm test"), "verify-and-build:STEP_SCHEMA_INVALID"],
  ["reordered audit and package", (s) => replace(s,
    "      - name: Build exact Windows package\n        run: npm run package:win -- \"-c.extraMetadata.buildCommit=${{ github.sha }}\"\n      - name: Strictly audit packaged application\n        shell: pwsh\n        run: |\n          $version = node -p \"require('./package.json').version\"\n          node scripts/stabilization/package-artifact-audit.cjs --strict --artifact release/win-unpacked --web-version $version --web-commit $env:GITHUB_SHA > release/package-artifact-audit.json",
    "      - name: Strictly audit packaged application\n        shell: pwsh\n        run: |\n          $version = node -p \"require('./package.json').version\"\n          node scripts/stabilization/package-artifact-audit.cjs --strict --artifact release/win-unpacked --web-version $version --web-commit $env:GITHUB_SHA > release/package-artifact-audit.json\n      - name: Build exact Windows package\n        run: npm run package:win -- \"-c.extraMetadata.buildCommit=${{ github.sha }}\""), "verify-and-build:STEP_SCHEMA_INVALID"],
  ["extra unsafe step", (s) => replace(s, "  verify-and-build:\n    needs: verify-publish-environment\n    runs-on: windows-latest\n    timeout-minutes: 60\n    steps:\n", "  verify-and-build:\n    needs: verify-publish-environment\n    runs-on: windows-latest\n    timeout-minutes: 60\n    steps:\n      - run: gh release create v0.0.0\n"), "verify-and-build:STEP_SCHEMA_INVALID"],
  ["non-draft release", (s) => replace(s, " --draft --latest", " --latest"), "publish-draft:STEP_SCHEMA_INVALID"],
  ["generated notes fallback", (s) => replace(s, "--notes-file \"${{ steps.publish.outputs.notes }}\"", "--generate-notes"), "publish-draft:STEP_SCHEMA_INVALID"],
  ["first arbitrary executable", (s) => replace(s, "node scripts/stabilization/stable-release-cli.cjs publish", "Get-ChildItem release -Filter *.exe | Select-Object -First 1"), "publish-draft:STEP_SCHEMA_INVALID"],
]) {
  test(`stable workflow rejects ${name}`, (t) => {
    const errors = mutate(t, transform);
    assert.ok(errors.some((error) => error.includes(expected)), errors.join("\n"));
  });
}
