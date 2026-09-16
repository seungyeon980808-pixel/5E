import { previewStorage } from '../preview-storage.js';
import { loadRemotePack } from "./remote-pack.js?v=1.6.0-preview-0916";

export const PROVIDED_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX";

export function driveFolderPack(pack, folderUrl) {
  const folder = parseGoogleDriveFolderUrl(folderUrl);
  const documents = pack.documents.map((document) => Object.freeze({
    ...document,
    driveFolder: Object.freeze({ id: folder.folderId, title: pack.title }),
    source: Object.freeze({
      ...document.source,
      relativePath: document.source.locator.slice(`${pack.id}/`.length),
    }),
  }));
  return Object.freeze({ ...pack, documents: Object.freeze(documents) });
}

const DRIVE_HOST = "drive.google.com";
const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/u;
const RESOURCE_KEY_PATTERN = /^[A-Za-z0-9_-]{8,256}$/u;
const CONNECTION_KEY = "5e.googleDriveLibrary.v1";
const DEFAULT_CONFIG_URL = "assets/pdf-library/google-drive.json";

function nonEmptyUrl(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new TypeError(`${field} must be a valid URL`); }
  if (url.username || url.password) throw new TypeError(`${field} must not include credentials`);
  return url;
}

function loopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function normalizeGoogleDriveGatewayUrl(value) {
  const url = nonEmptyUrl(value, "Google Drive gateway URL");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback(url.hostname))) {
    throw new TypeError("Google Drive gateway URL must use HTTPS or loopback HTTP");
  }
  if (url.search || url.hash) throw new TypeError("Google Drive gateway URL must not include a query or fragment");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}

export function parseGoogleDriveFolderUrl(value) {
  const url = nonEmptyUrl(value, "Google Drive folder URL");
  if (url.protocol !== "https:" || url.hostname !== DRIVE_HOST) {
    throw new TypeError("공개 Google Drive 폴더 링크를 입력하세요.");
  }
  const folderMatch = /^\/drive(?:\/u\/\d+)?\/folders\/([A-Za-z0-9_-]+)\/?$/u.exec(url.pathname);
  const folderId = folderMatch?.[1] || (url.pathname === "/open" ? url.searchParams.get("id") : "");
  if (!FOLDER_ID_PATTERN.test(folderId || "")) throw new TypeError("Google Drive 폴더 ID를 찾을 수 없습니다.");
  const resourceKey = url.searchParams.get("resourcekey") || "";
  if (resourceKey && !RESOURCE_KEY_PATTERN.test(resourceKey)) throw new TypeError("Google Drive resource key 형식이 올바르지 않습니다.");
  const canonical = new URL(`https://${DRIVE_HOST}/drive/folders/${folderId}`);
  if (resourceKey) canonical.searchParams.set("resourcekey", resourceKey);
  return Object.freeze({ folderId, resourceKey: resourceKey || null, folderUrl: canonical.href });
}

export function googleDrivePackBaseUrl(gatewayBaseUrl, folder) {
  const gateway = new URL(normalizeGoogleDriveGatewayUrl(gatewayBaseUrl));
  const descriptor = typeof folder === "string" ? parseGoogleDriveFolderUrl(folder) : folder;
  if (!descriptor || !FOLDER_ID_PATTERN.test(descriptor.folderId || "")) throw new TypeError("Google Drive folder descriptor is invalid");
  const access = descriptor.resourceKey ? `resource/${encodeURIComponent(descriptor.resourceKey)}` : "public";
  return new URL(`v1/google-drive/folders/${encodeURIComponent(descriptor.folderId)}/${access}/`, gateway).href;
}

export async function configuredGoogleDriveGatewayUrl({
  configuredUrl = globalThis.FIVE_E_GOOGLE_DRIVE_GATEWAY_URL,
  configUrl = DEFAULT_CONFIG_URL,
  fetcher = globalThis.fetch,
} = {}) {
  if (typeof configuredUrl === "string" && configuredUrl.trim()) return normalizeGoogleDriveGatewayUrl(configuredUrl);
  if (typeof fetcher !== "function") return "";
  try {
    const response = await fetcher(configUrl, { cache: "no-store" });
    if (!response.ok) return "";
    const config = await response.json();
    if (config?.schemaVersion !== 1 || typeof config.gatewayBaseUrl !== "string" || !config.gatewayBaseUrl.trim()) return "";
    return normalizeGoogleDriveGatewayUrl(config.gatewayBaseUrl);
  } catch {
    return "";
  }
}

function readSaved(storage) {
  if (!storage || typeof storage.getItem !== "function") return "";
  try {
    const value = JSON.parse(storage.getItem(CONNECTION_KEY) || "null");
    return value?.schemaVersion === 1 ? parseGoogleDriveFolderUrl(value.folderUrl).folderUrl : "";
  } catch {
    return "";
  }
}

export function createGoogleDriveConnection({
  gatewayBaseUrl = "",
  storage = previewStorage,
  loadPack = loadRemotePack,
  fetcher = globalThis.fetch,
} = {}) {
  const normalizedGateway = gatewayBaseUrl ? normalizeGoogleDriveGatewayUrl(gatewayBaseUrl) : "";
  let connected = null;
  return Object.freeze({
    gatewayConfigured: Boolean(normalizedGateway),
    savedFolderUrl: () => readSaved(storage),
    current: () => connected,
    async connect(folderUrl) {
      if (!normalizedGateway) throw new Error("운영자가 Google Drive 연결 서비스를 아직 설정하지 않았습니다.");
      const folder = parseGoogleDriveFolderUrl(folderUrl);
      const pack = await loadPack({ baseUrl: googleDrivePackBaseUrl(normalizedGateway, folder), fetcher });
      connected = Object.freeze({ folder, pack });
      storage?.setItem?.(CONNECTION_KEY, JSON.stringify({ schemaVersion: 1, folderUrl: folder.folderUrl }));
      return connected;
    },
    disconnect() {
      connected = null;
      storage?.removeItem?.(CONNECTION_KEY);
    },
  });
}
