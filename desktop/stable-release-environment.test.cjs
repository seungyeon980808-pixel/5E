const test = require("node:test");
const assert = require("node:assert/strict");
const { validateStableReleaseEnvironment } = require("../scripts/stabilization/stable-release-environment.cjs");

const VALID = {
  name: "stable-release",
  protection_rules: [{
    type: "required_reviewers",
    prevent_self_review: true,
    reviewers: [{ type: "User", reviewer: { id: 7, login: "reviewer" } }],
  }],
};

function response(status, body) {
  return { status, text: async () => body };
}

function invoke(reply) {
  return validateStableReleaseEnvironment({
    repository: "owner/repo",
    apiUrl: "https://api.github.com",
    token: "test-token",
    fetchImpl: async () => reply,
  });
}

test("accepts an exact protected stable-release environment", async () => {
  let request;
  const receipt = await validateStableReleaseEnvironment({
    repository: "owner/repo",
    apiUrl: "https://api.github.com",
    token: "test-token",
    fetchImpl: async (...args) => { request = args; return response(200, JSON.stringify(VALID)); },
  });
  assert.deepEqual(receipt, {
    environment: "stable-release",
    reviewers: 1,
    preventSelfReview: true,
  });
  assert.equal(request[0], "https://api.github.com/repos/owner/repo/environments/stable-release");
  assert.equal(request[1].method, "GET");
  assert.equal(request[1].headers.Authorization, "Bearer test-token");
  assert.equal(request[1].headers["X-GitHub-Api-Version"], "2026-03-10");
});

for (const [name, reply, code] of [
  ["missing environment", response(404, "{}"), "STABLE_ENVIRONMENT_MISSING"],
  ["missing protection rules", response(200, JSON.stringify({ ...VALID, protection_rules: [] })), "STABLE_ENVIRONMENT_PROTECTION_REQUIRED"],
  ["no reviewers", response(200, JSON.stringify({ ...VALID, protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [] }] })), "STABLE_ENVIRONMENT_REVIEWERS_REQUIRED"],
  ["self review allowed", response(200, JSON.stringify({ ...VALID, protection_rules: [{ ...VALID.protection_rules[0], prevent_self_review: false }] })), "STABLE_ENVIRONMENT_SELF_REVIEW_FORBIDDEN"],
  ["malformed response", response(200, "{"), "STABLE_ENVIRONMENT_RESPONSE_INVALID"],
  ["duplicate JSON key", response(200, '{"name":"stable-release","name":"other","protection_rules":[]}'), "STABLE_ENVIRONMENT_RESPONSE_INVALID"],
  ["API failure", response(503, "unavailable"), "STABLE_ENVIRONMENT_API_FAILED"],
]) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(invoke(reply), { code });
  });
}

test("rejects transport failure without leaking its message", async () => {
  const secret = "private transport detail";
  await assert.rejects(validateStableReleaseEnvironment({
    repository: "owner/repo",
    apiUrl: "https://api.github.com",
    token: "test-token",
    fetchImpl: async () => { throw new Error(secret); },
  }), (error) => error.code === "STABLE_ENVIRONMENT_API_FAILED" && !error.message.includes(secret));
});

test("bounds a stalled API request", async () => {
  await assert.rejects(validateStableReleaseEnvironment({
    repository: "owner/repo",
    apiUrl: "https://api.github.com",
    token: "test-token",
    timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  }), { code: "STABLE_ENVIRONMENT_API_FAILED" });
});
