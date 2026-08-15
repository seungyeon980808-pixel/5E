const { parseStrictJson } = require("./strict-json.cjs");

const ENVIRONMENT = "stable-release";
const MAX_RESPONSE_BYTES = 256 * 1024;
const TIMEOUT_MS = 15_000;

function reject(code) {
  throw Object.assign(new Error(code), { code });
}

function exactConfig(options) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(options.repository || "")) reject("STABLE_ENVIRONMENT_CONFIG_INVALID");
  if (options.repository.split("/").some((part) => part === "." || part === "..")) reject("STABLE_ENVIRONMENT_CONFIG_INVALID");
  if (options.apiUrl !== "https://api.github.com") reject("STABLE_ENVIRONMENT_CONFIG_INVALID");
  if (typeof options.token !== "string" || options.token.length < 1 || /[\r\n]/u.test(options.token)) reject("STABLE_ENVIRONMENT_TOKEN_REQUIRED");
}

async function validateStableReleaseEnvironment(options = {}) {
  exactConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") reject("STABLE_ENVIRONMENT_API_FAILED");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(`${options.apiUrl}/repos/${options.repository}/environments/${ENVIRONMENT}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    reject("STABLE_ENVIRONMENT_API_FAILED");
  }
  if (response?.status === 404) { clearTimeout(timer); reject("STABLE_ENVIRONMENT_MISSING"); }
  if (response?.status !== 200 || typeof response.text !== "function") { clearTimeout(timer); reject("STABLE_ENVIRONMENT_API_FAILED"); }
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) { clearTimeout(timer); reject("STABLE_ENVIRONMENT_RESPONSE_INVALID"); }
  let payload;
  try {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) reject("STABLE_ENVIRONMENT_RESPONSE_INVALID");
    payload = parseStrictJson(text);
  } catch (error) {
    if (error?.code === "STABLE_ENVIRONMENT_RESPONSE_INVALID") throw error;
    reject("STABLE_ENVIRONMENT_RESPONSE_INVALID");
  } finally {
    clearTimeout(timer);
  }
  if (payload?.name !== ENVIRONMENT || !Array.isArray(payload.protection_rules)) reject("STABLE_ENVIRONMENT_PROTECTION_REQUIRED");
  const rules = payload.protection_rules.filter((rule) => rule?.type === "required_reviewers");
  if (rules.length !== 1) reject("STABLE_ENVIRONMENT_PROTECTION_REQUIRED");
  const rule = rules[0];
  if (!Array.isArray(rule.reviewers) || rule.reviewers.length < 1) reject("STABLE_ENVIRONMENT_REVIEWERS_REQUIRED");
  if (!rule.reviewers.every((entry) => ["User", "Team"].includes(entry?.type)
    && Number.isSafeInteger(entry?.reviewer?.id) && entry.reviewer.id > 0)) {
    reject("STABLE_ENVIRONMENT_REVIEWERS_REQUIRED");
  }
  if (rule.prevent_self_review !== true) reject("STABLE_ENVIRONMENT_SELF_REVIEW_FORBIDDEN");
  return {
    environment: ENVIRONMENT,
    reviewers: rule.reviewers.length,
    preventSelfReview: true,
  };
}

async function main() {
  const receipt = await validateStableReleaseEnvironment({
    repository: process.env.GITHUB_REPOSITORY_NAME,
    apiUrl: process.env.GITHUB_API_URL,
    token: process.env.STABLE_RELEASE_ENVIRONMENT_TOKEN,
  });
  process.stdout.write(`${JSON.stringify({ gate: "stable-release-environment", state: "passed", ...receipt })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ gate: "stable-release-environment", state: "failed", code: error.code || "STABLE_ENVIRONMENT_FAILED" })}\n`);
    process.exitCode = 1;
  });
}

module.exports = { validateStableReleaseEnvironment };
