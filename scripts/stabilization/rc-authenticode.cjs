const { execFileSync } = require("node:child_process");

const SCRIPT = [
  "$signature=Get-AuthenticodeSignature -LiteralPath $env:FIVE_E_SIGNATURE_FILE -ErrorAction Stop",
  "$signature.Status.ToString()",
].join(";");
const STATUS = new Set(["NotSigned", "Valid", "HashMismatch", "NotTrusted", "UnknownError"]);

function inspectAuthenticode(file, { run = execFileSync } = {}) {
  try {
    const env = { ...process.env, FIVE_E_SIGNATURE_FILE: file };
    delete env.PSModulePath;
    const value = run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", SCRIPT], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 64 * 1024,
      env,
    }).trim();
    if (!STATUS.has(value)) throw new Error("invalid");
    return value;
  } catch {
    throw new Error("AUTHENTICODE_UNAVAILABLE");
  }
}

module.exports = { inspectAuthenticode };
