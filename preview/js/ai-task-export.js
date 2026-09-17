import {
  FS_DIR_SUPPORTED,
  ensureDirPermission,
  pickDir,
} from "./export-dir.js?v=1.6.0-preview-labeler-0917-1111";
import { zipStore } from "./backup-zip.js?v=1.6.0-preview-labeler-0917-1111";

export const TASK_EXPORT_MODES = Object.freeze({
  SELECTED: "selected",
  ALL: "all",
});

export function normalizeTaskExportMode(value) {
  return value === TASK_EXPORT_MODES.ALL ? TASK_EXPORT_MODES.ALL : TASK_EXPORT_MODES.SELECTED;
}

export function sanitizeTaskExportName(value) {
  const cleaned = String(value || "AI 결과")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. -]+$/g, "")
    .slice(0, 120)
    .replace(/[. -]+$/g, "");
  const fallback = cleaned || "AI 결과";
  const stem = fallback.split('.')[0];
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem) ? `_${fallback}` : fallback;
}

export function imageExtension(dataUrl) {
  const mime = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(String(dataUrl || ""))?.[1]?.toLowerCase();
  return ({
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/bmp": ".bmp",
    "image/svg+xml": ".svg",
  })[mime] || null;
}

export function taskExportSelection(tabs, mode = TASK_EXPORT_MODES.SELECTED) {
  const normalizedMode = normalizeTaskExportMode(mode);
  const output = [];
  for (const tab of tabs || []) {
    const generated = Array.isArray(tab?.generated) ? tab.generated.filter(item => imageExtension(item?.data)) : [];
    if (!generated.length) continue;
    const selected = generated.find(item => item.id === tab.selectedCandidateId) || generated.at(-1);
    const candidates = normalizedMode === TASK_EXPORT_MODES.ALL ? generated : [selected];
    const sourceLabel = String(tab.attachments?.[0]?.name || tab.title || "작업")
      .replace(/\.(?:png|jpe?g|webp|gif|bmp|svg)$/i, '');
    for (const candidate of candidates) {
      const version = Math.max(1, generated.indexOf(candidate) + 1);
      const versionLabel = normalizedMode === TASK_EXPORT_MODES.ALL ? ` - 버전 ${version}` : "";
      output.push({
        taskId: tab.id,
        candidateId: candidate.id,
        item: candidate,
        outputOptions: tab.outputOptions || null,
        sourceName: sanitizeTaskExportName(`${tab.title || "작업"} - ${sourceLabel}${versionLabel}`),
      });
    }
  }
  return output;
}

function dataUrlBlob(dataUrl) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("저장할 이미지 데이터가 올바르지 않습니다.");
  const bytes = Uint8Array.from(atob(match[2]), character => character.charCodeAt(0));
  return new Blob([bytes], { type: match[1] });
}

function dataUrlBytes(dataUrl) {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=]+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("저장할 이미지 데이터가 올바르지 않습니다.");
  return Uint8Array.from(atob(match[1]), character => character.charCodeAt(0));
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

export async function nextAvailableBrowserName(directory, baseName, extension) {
  let sequence = 1;
  while (true) {
    const marker = sequence === 1 ? "" : ` (${sequence})`;
    const name = `${sanitizeTaskExportName(baseName)}${marker}${extension}`;
    if (!(await fileExists(directory, name))) return name;
    sequence += 1;
  }
}

export async function chooseTaskExportDestination({
  desktopBatchOutput,
  directorySupported = FS_DIR_SUPPORTED,
  pickBrowserDirectory = pickDir,
  confirmDownloads = message => window.confirm(message),
} = {}) {
  if (desktopBatchOutput?.pickFolder && desktopBatchOutput?.save) {
    const result = await desktopBatchOutput.pickFolder();
    return result?.folder ? { kind: "desktop", folder: result.folder, writer: desktopBatchOutput } : null;
  }
  if (directorySupported) {
    const directory = await pickBrowserDirectory();
    if (!directory || !(await ensureDirPermission(directory))) return null;
    return { kind: "browser-directory", directory };
  }
  const confirmed = confirmDownloads("이 브라우저는 폴더 저장을 지원하지 않습니다. 결과를 한 폴더처럼 묶은 ZIP 다운로드를 요청할까요? 다운로드 완료 여부는 브라우저에서 확인해야 하며 현재 편집 내용은 유지됩니다.");
  return confirmed ? { kind: "browser-zip" } : null;
}

export async function writeTaskExports(destination, records, {
  documentApi = globalThis.document,
} = {}) {
  if (!destination) return { status: "cancelled", count: 0, files: [] };
  const files = [];
  const zipEntries = [];
  for (const record of records || []) {
    const extension = imageExtension(record.dataUrl);
    if (!extension) throw new Error(`‘${record.sourceName || "결과"}’의 이미지 형식을 저장할 수 없습니다.`);
    if (destination.kind === "desktop") {
      const result = await destination.writer.save({
        outputDirectory: destination.folder,
        sourceName: record.sourceName,
        dataUrl: record.dataUrl,
        extension,
        appendConverted: false,
      });
      files.push(result.path || record.sourceName);
      continue;
    }
    if (destination.kind === "browser-directory") {
      const name = await nextAvailableBrowserName(destination.directory, record.sourceName, extension);
      const handle = await destination.directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(dataUrlBlob(record.dataUrl));
        await writable.close();
      } catch (error) {
        await writable.abort?.().catch(() => {});
        throw error;
      }
      files.push(name);
      continue;
    }
    if (destination.kind !== "browser-zip") throw new Error("결과 저장 위치가 올바르지 않습니다.");
    let sequence = 1;
    let name;
    do {
      const marker = sequence === 1 ? "" : ` (${sequence})`;
      name = `${sanitizeTaskExportName(record.sourceName)}${marker}${extension}`;
      sequence += 1;
    } while (zipEntries.some(entry => entry.name === `5E-AI-결과/${name}`));
    zipEntries.push({ name: `5E-AI-결과/${name}`, data: dataUrlBytes(record.dataUrl) });
    files.push(name);
  }
  if (destination.kind === "browser-zip" && zipEntries.length) {
    const link = documentApi.createElement("a");
    const url = URL.createObjectURL(zipStore(zipEntries));
    link.href = url;
    link.download = "5E-AI-결과.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return {
    status: destination.kind === "browser-zip" ? "download-requested" : "stored",
    count: files.length,
    files,
  };
}
