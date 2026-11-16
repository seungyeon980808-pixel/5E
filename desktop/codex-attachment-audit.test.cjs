const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { snapshotAttachments } = require("./codex-attachment-audit.cjs");

test("attachment snapshots observe ordered on-disk bytes and deletion without exposing paths", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "5e-attachment-audit-"));
  try {
    const first = path.join(dir, "private-source.png"), second = path.join(dir, "private-guide.png");
    fs.writeFileSync(first, Buffer.from([1, 2, 3]));
    fs.writeFileSync(second, Buffer.from([4, 5]));
    assert.deepEqual(snapshotAttachments([first, second]), [
      { index: 0, inputType: "localImage", readable: true, bytes: 3,
        sha256: createHash("sha256").update(Buffer.from([1, 2, 3])).digest("hex") },
      { index: 1, inputType: "localImage", readable: true, bytes: 2,
        sha256: createHash("sha256").update(Buffer.from([4, 5])).digest("hex") },
    ]);
    fs.unlinkSync(first);
    assert.deepEqual(snapshotAttachments([first])[0],
      { index: 0, inputType: "localImage", readable: false, errorCode: "ENOENT" });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
