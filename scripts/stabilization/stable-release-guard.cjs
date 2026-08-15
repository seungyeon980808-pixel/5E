const STABLE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const FULL_SHA = /^[0-9a-f]{40}$/;

class StableReleaseError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.code = code;
  }
}

function deny(code, detail) {
  throw new StableReleaseError(code, detail);
}

function assertStableIdentity(input) {
  const version = typeof input.version === "string" ? input.version : "";
  const tag = typeof input.tag === "string" ? input.tag : "";
  if (!STABLE_VERSION.test(version)) deny("STABLE_VERSION_REQUIRED", input.version);
  if (!tag.startsWith("v") || !STABLE_VERSION.test(tag.slice(1))) {
    deny("STABLE_TAG_REQUIRED", tag);
  }
  if (tag !== `v${version}`) deny("TAG_VERSION_MISMATCH", tag);
  if (!FULL_SHA.test(input.githubSha || "")) deny("GITHUB_SHA_INVALID", input.githubSha);
  if (!FULL_SHA.test(input.headSha || "")) deny("HEAD_SHA_INVALID", input.headSha);
  if (!FULL_SHA.test(input.tagSha || "")) deny("TAG_SHA_INVALID", input.tagSha);
  if (input.headSha !== input.githubSha) deny("HEAD_COMMIT_MISMATCH", input.headSha);
  if (input.tagSha !== input.githubSha) deny("TAG_COMMIT_MISMATCH", input.tagSha);
  if (input.mainAncestor !== true) deny("MAIN_ANCESTRY_REQUIRED");
}

function createStableReleasePlan(input) {
  assertStableIdentity(input);
  const expectedInstaller = `5E-Setup-${input.version}-windows-x64.exe`;
  if (input.installers?.length !== 1 || input.installers[0] !== expectedInstaller) {
    deny("INSTALLER_SET_INVALID", JSON.stringify(input.installers));
  }
  if (input.audit?.passed !== true) deny("ARTIFACT_AUDIT_REQUIRED");
  if (input.audit.version !== input.version) deny("ARTIFACT_VERSION_MISMATCH", input.audit.version);
  if (input.audit.commit !== input.githubSha) deny("ARTIFACT_COMMIT_MISMATCH", input.audit.commit);
  const expectedNotes = `RELEASE_NOTES_v${input.version}.md`;
  if (input.notes !== expectedNotes) deny("RELEASE_NOTES_REQUIRED", input.notes);
  if (input.checksum?.passed !== true || input.checksum.file !== "SHA256SUMS.txt") deny("CHECKSUM_REQUIRED");
  return {
    version: input.version,
    tag: input.tag,
    commit: input.githubSha,
    installer: expectedInstaller,
    checksum: "SHA256SUMS.txt",
    notes: expectedNotes,
    draft: true,
    latest: true,
  };
}

module.exports = { StableReleaseError, assertStableIdentity, createStableReleasePlan };
