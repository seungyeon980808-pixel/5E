// OmO 작성: 전체 폴더 순회 대신 요청 경로만 해석한다.
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,200}$/u;
const RESOURCE_KEY_PATTERN = /^[A-Za-z0-9_-]{8,256}$/u;
const MAX_DEPTH = 8;
const MAX_LOOKUP_REQUESTS = 32;
const MAX_CACHED_PATHS = 256;

function gatewayHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "Range",
    "access-control-expose-headers": "Cache-Control, Content-Length, Content-Range, ETag",
    "cache-control": "public, max-age=300",
    "content-type": contentType,
    "cross-origin-resource-policy": "cross-origin",
    "x-content-type-options": "nosniff",
  };
}

function jsonResponse(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers: gatewayHeaders() });
}

function safeAssetPath(value) {
  let decoded;
  try { decoded = decodeURIComponent(value); }
  catch { return ""; }
  if (!decoded || decoded.length > 4096 || decoded.includes("%") || decoded.includes("\\") || decoded.includes("\0")) return "";
  const parts = decoded.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return "";
  return parts.join("/");
}

export function parseGatewayRequest(urlValue) {
  const url = new URL(urlValue);
  const match = /^\/v1\/google-drive\/folders\/([A-Za-z0-9_-]+)\/(public|resource\/([A-Za-z0-9_-]+))\/(.+)$/u.exec(url.pathname);
  if (!match || !FOLDER_ID_PATTERN.test(match[1])) return null;
  const resourceKey = match[3] || "";
  if (resourceKey && !RESOURCE_KEY_PATTERN.test(resourceKey)) return null;
  const assetPath = safeAssetPath(match[4]);
  return assetPath ? Object.freeze({ folderId: match[1], resourceKey: resourceKey || null, assetPath }) : null;
}

function resourceHeader(fileId, resourceKey) {
  return resourceKey ? { "x-goog-drive-resource-keys": `${fileId}/${resourceKey}` } : {};
}

function driveQueryLiteral(value) {
  return `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`;
}

async function resolvePublicAsset({ fetcher, apiKey, folderId, resourceKey, assetPath }) {
  const parts = assetPath.split("/");
  if (parts.length - 1 > MAX_DEPTH) throw new Error("Google Drive 폴더 깊이가 허용 범위를 넘었습니다.");
  let parent = { id: folderId, resourceKey };
  let requests = 0;
  for (const [index, part] of parts.entries()) {
    const name = part.normalize("NFC");
    // macOS 업로드의 분해형 이름도 같은 요청 안에서 찾는다.
    const names = [...new Set([name, name.normalize("NFD")])];
    const nameQuery = names.map((value) => `name = ${driveQueryLiteral(value)}`).join(" or ");
    let found = null;
    let pageToken = "";
    do {
      if (requests >= MAX_LOOKUP_REQUESTS) throw new Error("Google Drive 경로 조회 요청 수가 허용 범위를 넘었습니다.");
      const url = new URL(DRIVE_API);
      url.searchParams.set("q", `(${nameQuery}) and ${driveQueryLiteral(parent.id)} in parents and trashed = false`);
      url.searchParams.set("spaces", "drive");
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,modifiedTime,md5Checksum,resourceKey,capabilities(canDownload))");
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      requests += 1;
      const response = await fetcher(url, { headers: resourceHeader(parent.id, parent.resourceKey) });
      if (!response.ok) throw Object.assign(new Error("Google Drive 폴더를 읽을 수 없습니다."), { status: response.status });
      const data = await response.json();
      if (!Array.isArray(data.files)) throw new Error("Google Drive가 올바른 파일 목록을 반환하지 않았습니다.");
      for (const file of data.files) {
        if (!file || !FOLDER_ID_PATTERN.test(file.id || "") || typeof file.name !== "string") continue;
        if (file.name.normalize("NFC") !== name || !safeAssetPath(file.name)) continue;
        if (found) throw Object.assign(new Error("Google Drive 폴더에 이름이 같은 파일이 있습니다."), { status: 409 });
        found = file;
      }
      pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    } while (pageToken);
    if (!found) return null;
    if (index === parts.length - 1) return found.mimeType === FOLDER_MIME ? null : Object.freeze(found);
    if (found.mimeType !== FOLDER_MIME) return null;
    parent = found;
  }
}

function allowedAsset(file) {
  return file?.mimeType === "application/pdf" || file?.mimeType === "application/json" || /\.json$/iu.test(file?.name || "");
}

function contentType(file) {
  if (file.mimeType === "application/pdf" || /\.pdf$/iu.test(file.name)) return "application/pdf";
  return "application/json; charset=utf-8";
}

export function createGoogleDriveGateway({ fetcher = globalThis.fetch } = {}) {
  const resolvedPaths = new Map();
  const assetFor = (env, route) => {
    const key = `${route.folderId}\0${route.resourceKey || ""}\0${route.assetPath}`;
    const current = resolvedPaths.get(key);
    if (current && current.expiresAt > Date.now()) return current.promise;
    for (const [cachedKey, entry] of resolvedPaths) {
      if (entry.expiresAt <= Date.now()) resolvedPaths.delete(cachedKey);
    }
    if (resolvedPaths.size >= MAX_CACHED_PATHS) resolvedPaths.delete(resolvedPaths.keys().next().value);
    const promise = resolvePublicAsset({
      fetcher,
      apiKey: env.GOOGLE_DRIVE_API_KEY,
      ...route,
    });
    resolvedPaths.set(key, { expiresAt: Date.now() + 300_000, promise });
    promise.catch(() => {
      if (resolvedPaths.get(key)?.promise === promise) resolvedPaths.delete(key);
    });
    return promise;
  };
  return Object.freeze({
    async fetch(request, env = {}) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: gatewayHeaders() });
      if (!["GET", "HEAD"].includes(request.method)) return jsonResponse(405, "METHOD_NOT_ALLOWED", "읽기 요청만 허용됩니다.");
      const route = parseGatewayRequest(request.url);
      if (!route) return jsonResponse(404, "NOT_FOUND", "요청한 Drive 자료를 찾을 수 없습니다.");
      if (typeof env.GOOGLE_DRIVE_API_KEY !== "string" || !env.GOOGLE_DRIVE_API_KEY) {
        return jsonResponse(503, "GATEWAY_NOT_CONFIGURED", "Google Drive 연결 서비스가 준비되지 않았습니다.");
      }
      try {
        const file = await assetFor(env, route);
        if (!file || !allowedAsset(file) || file.capabilities?.canDownload === false) {
          return jsonResponse(404, "ASSET_NOT_FOUND", "요청한 자료 파일을 찾을 수 없습니다.");
        }
        const source = new URL(`${DRIVE_API}/${encodeURIComponent(file.id)}`);
        source.searchParams.set("alt", "media");
        source.searchParams.set("supportsAllDrives", "true");
        source.searchParams.set("key", env.GOOGLE_DRIVE_API_KEY);
        if (request.method === "HEAD") {
          const headers = gatewayHeaders(contentType(file));
          if (file.size) headers["content-length"] = String(file.size);
          if (file.md5Checksum) headers.etag = `"${file.md5Checksum}"`;
          return new Response(null, { status: 200, headers });
        }
        const downloaded = await fetcher(source, { headers: resourceHeader(file.id, file.resourceKey) });
        if (!downloaded.ok || !downloaded.body) throw Object.assign(new Error("Google Drive 파일을 내려받을 수 없습니다."), { status: downloaded.status });
        const headers = gatewayHeaders(contentType(file));
        const length = downloaded.headers.get("content-length") || (file.size ? String(file.size) : "");
        if (length) headers["content-length"] = length;
        if (file.md5Checksum) headers.etag = `"${file.md5Checksum}"`;
        return new Response(downloaded.body, { status: 200, headers });
      } catch (error) {
        const status = Number(error?.status);
        if (status === 403 || status === 404) return jsonResponse(404, "DRIVE_NOT_PUBLIC", "폴더와 모든 자료를 링크가 있는 모든 사용자에게 읽기 전용으로 공유했는지 확인하세요.");
        if (status === 409) return jsonResponse(409, "AMBIGUOUS_PATH", error.message);
        return jsonResponse(502, "DRIVE_UPSTREAM_FAILED", error instanceof Error ? error.message : "Google Drive 요청이 실패했습니다.");
      }
    },
  });
}

export default createGoogleDriveGateway();
