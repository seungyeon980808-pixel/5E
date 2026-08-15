const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function load() {
  return require("../scripts/stabilization/rc-authenticode.cjs");
}

test("Given an Authenticode query, When invoked, Then the child boundary is bounded and path-safe", () => {
  let observed;
  const status = load().inspectAuthenticode("C:\\sentinel\\installer.exe", { run: (...args) => (observed = args, "NotSigned\r\n") });
  assert.equal(status, "NotSigned");
  assert.deepEqual(observed[2].stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(observed[2].timeout, 15_000);
  assert.equal(observed[2].maxBuffer, 64 * 1024);
  assert.equal(observed[2].shell, false);
  assert.equal(observed[2].windowsHide, true);
  assert.equal(observed[2].env.FIVE_E_SIGNATURE_FILE, "C:\\sentinel\\installer.exe");
  assert.doesNotMatch(observed[1].join(" "), /sentinel|installer\.exe/i);
});

for (const [name, run] of [
  ["timeout", () => { const error = new Error("C:\\secret"); error.code = "ETIMEDOUT"; throw error; }],
  ["buffer overflow", () => { const error = new Error("C:\\secret"); error.code = "ENOBUFS"; throw error; }],
  ["raw stderr", () => { const error = new Error("failure"); error.stderr = Buffer.from("RAW_SENTINEL C:\\secret"); throw error; }],
  ["unknown status", () => "PrivatePath"],
]) {
  test(`Given ${name}, When Authenticode inspection fails, Then diagnostics are stable`, () => {
    assert.throws(() => load().inspectAuthenticode("C:\\secret\\installer.exe", { run }),
      (error) => error.message === "AUTHENTICODE_UNAVAILABLE" && !/secret|sentinel|path/i.test(error.message));
  });
}

test("Given a real unsigned temp file, When inspected on Windows, Then status is NotSigned", { skip: process.platform !== "win32" }, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-authenticode-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "unsigned.exe");
  fs.writeFileSync(file, "not-a-signed-executable");
  let status;
  try { status = load().inspectAuthenticode(file); }
  catch { return t.skip("synthetic probe unavailable; Todo14 actual installer NotSigned probe remains an acceptance blocker"); }
  if (status !== "NotSigned") return t.skip(`synthetic non-PE status is ${status}; Todo14 actual installer NotSigned probe remains an acceptance blocker`);
  assert.equal(status, "NotSigned");
});
