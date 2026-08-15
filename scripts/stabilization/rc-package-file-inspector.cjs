const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const WINDOWS_SCRIPT = [
  "$item=Get-Item -LiteralPath $env:FIVE_E_OUTPUT_FILE -Force -ErrorAction Stop",
  "$streams=@(Get-Item -LiteralPath $env:FIVE_E_OUTPUT_FILE -Stream * -ErrorAction Stop|ForEach-Object{$_.Stream})",
  "$source='using System;using System.Runtime.InteropServices;public static class FiveEFileSize{[DllImport(\"kernel32.dll\",CharSet=CharSet.Unicode,SetLastError=true)]public static extern uint GetCompressedFileSizeW(string name,out uint high);}'",
  "Add-Type -TypeDefinition $source",
  "[uint32]$high=0",
  "[uint32]$low=[FiveEFileSize]::GetCompressedFileSizeW($item.FullName,[ref]$high)",
  "$errorCode=[Runtime.InteropServices.Marshal]::GetLastWin32Error()",
  "if($low -eq [uint32]::MaxValue -and $errorCode -ne 0){throw ('allocated-size:'+ $errorCode)}",
  "$allocated=([uint64]$high*4294967296)+[uint64]$low",
  "[pscustomobject]@{reparse=[bool]($item.Attributes-band[IO.FileAttributes]::ReparsePoint);sparse=[bool]($item.Attributes-band[IO.FileAttributes]::SparseFile);allocatedBytes=[string]$allocated;streams=$streams}|ConvertTo-Json -Compress",
].join(";");

function inspectWindowsFile(file, { run = execFileSync } = {}) {
  try {
    const value = run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, FIVE_E_OUTPUT_FILE: file },
    });
    return JSON.parse(value);
  } catch {
    throw new Error("OUTPUT_FILE_METADATA_UNAVAILABLE");
  }
}

function inspectFile(file) {
  if (process.platform === "win32") return inspectWindowsFile(file);
  const stat = fs.statSync(file);
  return { reparse: false, sparse: false, allocatedBytes: String((stat.blocks || 0) * 512), streams: [] };
}

module.exports = { inspectFile, inspectWindowsFile };
