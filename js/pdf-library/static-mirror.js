// 11-05: 「5E 제공」 공유 폴더를 받는 길을 빠른 주소(Cloudflare 정적 파일 5e-exam-pdf)로 먼저 돌린다.
// 드라이브 게이트웨이는 파일마다 경로를 찾느라 1~3초(색인 33MB는 5~6초) 걸렸다. 정적 주소는 0.2~0.5초.
// 같은 파일을 올려 두었으므로 remote-pack.js의 SHA-256 검사가 그대로 지켜 준다. 없거나 늦으면 게이트웨이로 넘어간다.
// 올리기: exam-pdf/build-site.mjs(색인 4개·기출 PDF) → wrangler deploy. 색인은 정적 파일 한도(25MB) 때문에 조각으로 올린다.
export const STATIC_MIRROR_BASE = "https://5e-exam-pdf.5e-desktop.workers.dev/v1/";
const PACK_FILES = new Set(["pack.json", "checksums.json", "catalog.json", "search-index.json"]);
const STALL_MS = 8000;

export function staticMirrorPath(relativePath) {
  if (PACK_FILES.has(relativePath)) return relativePath;
  return /^(기출문제|학력평가)\/.+\.pdf$/i.test(relativePath) && !relativePath.startsWith("기출문제/기출확장_국영수사탐/") ? relativePath : "";
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

async function withDeadline(fetcher, url, init) {
  const controller = new AbortController(), outer = init?.signal;
  const abort = () => controller.abort();
  outer?.addEventListener?.("abort", abort, { once: true });
  const timer = setTimeout(abort, STALL_MS);
  try {
    const response = await fetcher(url, { ...init, redirect: "follow", signal: controller.signal });
    return response.ok ? response : null;
  } finally { clearTimeout(timer); outer?.removeEventListener?.("abort", abort); }
}

// 조각으로 올린 큰 파일을 이어 붙인다(<이름>.parts.json = {parts:n} → <이름>.part0 …).
async function readParts(fetcher, url, init) {
  const head = await withDeadline(fetcher, `${url}.parts.json`, init);
  const parts = Number((await head?.json().catch(() => null))?.parts);
  if (!Number.isInteger(parts) || parts < 1 || parts > 16) return null;
  const chunks = await Promise.all(Array.from({ length: parts }, async (_, i) => {
    const response = await fetcher(`${url}.part${i}`, { ...init, redirect: "follow" });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  }));
  if (chunks.some((chunk) => !chunk)) return null;
  const bytes = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return new Response(bytes, { status: 200, headers: { "content-type": "application/json", "content-length": String(bytes.byteLength) } });
}

export function createStaticMirrorFetcher(gatewayRoot, { fetcher = globalThis.fetch, base = STATIC_MIRROR_BASE } = {}) {
  const root = String(gatewayRoot || "");
  return async function mirroredFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (root && typeof url === "string" && url.startsWith(root)) {
      let relativePath = "";
      try { relativePath = decodeURIComponent(new URL(url).pathname.slice(new URL(root).pathname.length)); } catch {}
      const mirror = relativePath && staticMirrorPath(relativePath);
      if (mirror) {
        try {
          const target = base + encodePath(mirror);
          const response = mirror === "search-index.json" ? await readParts(fetcher, target, init) : await withDeadline(fetcher, target, init);
          if (response) return response;
        } catch (error) { if (init?.signal?.aborted) throw error; }
      }
    }
    return fetcher(input, init);
  };
}
