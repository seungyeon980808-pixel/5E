const fs = require("node:fs");
const { createHash } = require("node:crypto");

// File paths, user filenames and image contents never enter the diagnostic event.
function snapshotAttachments(paths) {
  return paths.map((file, index) => {
    try {
      const data = fs.readFileSync(file);
      return { index, inputType: "localImage", readable: true, bytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex") };
    } catch (error) {
      return { index, inputType: "localImage", readable: false, errorCode: error.code || "READ_FAILED" };
    }
  });
}

module.exports = { snapshotAttachments };
