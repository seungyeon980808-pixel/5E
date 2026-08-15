const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const { assertStableIdentity, createStableReleasePlan } = require("./stable-release-guard.cjs");

const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");

function context(options = {}) {
  const root = options.root || DEFAULT_ROOT;
  return {
    root,
    release: options.release || path.join(root, "release"),
    env: options.env || process.env,
    outputFile: options.outputFile || process.env.GITHUB_OUTPUT,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function git(ctx, args) {
  return execFileSync("git", args, {
    cwd: ctx.root,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function baseIdentity(ctx) {
  return {
    version: readJson(path.join(ctx.root, "package.json")).version,
    tag: ctx.env.RELEASE_TAG,
    githubSha: ctx.env.EXPECTED_SHA,
  };
}

function resolveIdentity(ctx) {
  const identity = baseIdentity(ctx);
  assertStableIdentity({ ...identity, headSha: identity.githubSha, tagSha: identity.githubSha, mainAncestor: true });
  const headSha = git(ctx, ["rev-parse", "HEAD"]);
  const tagSha = git(ctx, ["rev-parse", `refs/tags/${identity.tag}^{commit}`]);
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", identity.githubSha, "origin/main"], { cwd: ctx.root });
  if (ancestry.error || ![0, 1].includes(ancestry.status)) throw ancestry.error || new Error("git ancestry check failed");
  const resolved = { ...identity, headSha, tagSha, mainAncestor: ancestry.status === 0 };
  assertStableIdentity(resolved);
  return resolved;
}

function output(ctx, values) {
  if (!ctx.outputFile) return;
  fs.appendFileSync(ctx.outputFile, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
}

function auditIdentity(report) {
  return {
    passed: report?.violations?.length === 0 && report?.identity?.matches === true,
    version: report?.identity?.desktop?.version,
    commit: report?.identity?.desktop?.commit,
  };
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function requireNonemptyInstaller(file) {
  let stat;
  try { stat = fs.lstatSync(file, { bigint: true }); }
  catch { throw Object.assign(new Error("INSTALLER_FILE_INVALID"), { code: "INSTALLER_FILE_INVALID" }); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0n) {
    throw Object.assign(new Error("INSTALLER_FILE_INVALID"), { code: "INSTALLER_FILE_INVALID" });
  }
}

function bundle(ctx) {
  const identity = resolveIdentity(ctx);
  const installers = fs.readdirSync(ctx.release).filter((name) => name.toLowerCase().endsWith(".exe")).sort();
  const notesName = `RELEASE_NOTES_v${identity.version}.md`;
  const notesSource = path.join(ctx.root, "docs", notesName);
  const report = readJson(path.join(ctx.release, "package-artifact-audit.json"));
  const installer = installers.length === 1 ? path.join(ctx.release, installers[0]) : null;
  if (installer) requireNonemptyInstaller(installer);
  const hash = installer ? sha256(installer) : null;
  if (hash) fs.writeFileSync(path.join(ctx.release, "SHA256SUMS.txt"), `${hash}  ${installers[0]}\n`, "ascii");
  const plan = createStableReleasePlan({
    ...identity,
    installers,
    audit: auditIdentity(report),
    notes: fs.existsSync(notesSource) ? notesName : null,
    checksum: { passed: Boolean(hash), file: "SHA256SUMS.txt" },
  });
  fs.copyFileSync(notesSource, path.join(ctx.release, notesName));
  fs.writeFileSync(path.join(ctx.release, "stable-release-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  output(ctx, {
    installer: `release/${plan.installer}`,
    checksum: `release/${plan.checksum}`,
    notes: `release/${plan.notes}`,
    plan: "release/stable-release-plan.json",
    audit: "release/package-artifact-audit.json",
  });
  return plan;
}

function refreshPublishIdentity(ctx, plan) {
  const input = { version: plan.version, tag: ctx.env.RELEASE_TAG, githubSha: ctx.env.EXPECTED_SHA };
  assertStableIdentity({ ...input, headSha: input.githubSha, tagSha: input.githubSha, mainAncestor: true });
  const headSha = git(ctx, ["rev-parse", "HEAD"]);
  const tagSha = git(ctx, ["rev-parse", `refs/tags/${input.tag}^{commit}`]);
  const ancestry = spawnSync("git", ["merge-base", "--is-ancestor", headSha, "origin/main"], { cwd: ctx.root });
  if (ancestry.error || ![0, 1].includes(ancestry.status)) throw ancestry.error || new Error("git ancestry check failed");
  const identity = { ...input, headSha, tagSha, mainAncestor: ancestry.status === 0 };
  assertStableIdentity(identity);
  return identity;
}

function publish(ctx) {
  const plan = readJson(path.join(ctx.release, "stable-release-plan.json"));
  const expectedKeys = ["checksum", "commit", "draft", "installer", "latest", "notes", "tag", "version"];
  if (JSON.stringify(Object.keys(plan).sort()) !== JSON.stringify(expectedKeys)) throw Object.assign(new Error("PUBLISH_PLAN_INVALID"), { code: "PUBLISH_PLAN_INVALID" });
  const identity = refreshPublishIdentity(ctx, plan);
  const input = identity;
  const namesAreCanonical = plan.tag === input.tag && plan.commit === input.githubSha
    && plan.installer === `5E-Setup-${plan.version}-windows-x64.exe`
    && plan.notes === `RELEASE_NOTES_v${plan.version}.md` && plan.checksum === "SHA256SUMS.txt"
    && plan.draft === true && plan.latest === true;
  if (!namesAreCanonical) throw Object.assign(new Error("PUBLISH_PLAN_MISMATCH"), { code: "PUBLISH_PLAN_MISMATCH" });
  const files = fs.readdirSync(ctx.release);
  const exes = files.filter((name) => name.toLowerCase().endsWith(".exe")).sort();
  for (const name of [plan.installer, plan.checksum, plan.notes, "package-artifact-audit.json"]) {
    if (!fs.existsSync(path.join(ctx.release, name))) throw Object.assign(new Error(`PUBLISH_FILE_MISSING: ${name}`), { code: "PUBLISH_FILE_MISSING" });
  }
  requireNonemptyInstaller(path.join(ctx.release, plan.installer));
  const expectedLine = `${sha256(path.join(ctx.release, plan.installer))}  ${plan.installer}\n`;
  const checksumPassed = fs.readFileSync(path.join(ctx.release, plan.checksum), "ascii") === expectedLine;
  const checked = createStableReleasePlan({
    ...input,
    headSha: identity.headSha,
    tagSha: identity.tagSha,
    mainAncestor: identity.mainAncestor,
    installers: exes,
    audit: auditIdentity(readJson(path.join(ctx.release, "package-artifact-audit.json"))),
    notes: plan.notes,
    checksum: { passed: checksumPassed, file: plan.checksum },
  });
  if (JSON.stringify(checked) !== JSON.stringify(plan)) throw Object.assign(new Error("PUBLISH_PLAN_MISMATCH"), { code: "PUBLISH_PLAN_MISMATCH" });
  output(ctx, { tag: plan.tag, commit: plan.commit, installer: `release/${plan.installer}`, checksum: `release/${plan.checksum}`, notes: `release/${plan.notes}` });
  return plan;
}

function run(mode = process.argv[2], options) {
  const ctx = context(options);
  if (mode === "preflight") return resolveIdentity(ctx);
  if (mode === "bundle") return bundle(ctx);
  if (mode === "publish") return publish(ctx);
  throw Object.assign(new Error(`MODE_INVALID: ${mode}`), { code: "MODE_INVALID" });
}

if (require.main === module) {
  try { process.stdout.write(`${JSON.stringify({ gate: `stable-release-${process.argv[2]}`, state: "passed", plan: run() })}\n`); }
  catch (error) {
    process.stderr.write(`${JSON.stringify({ gate: `stable-release-${process.argv[2] || "unknown"}`, state: "failed", code: error.code || "STABLE_RELEASE_FAILED", error: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { run };
