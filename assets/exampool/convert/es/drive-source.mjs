const PUBLIC_BASE = 'https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1N46Woe4wIXs-PoUpVf0Uu4hPkSIUBqgX/public/';
const EXPANSION_BASE = 'https://5e-google-drive-gateway.5e-desktop.workers.dev/v1/google-drive/folders/1ckc6lPTmGobFNf8Zv0zMuwR5Gg3qykGo/public/';

export class DriveError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
  }
}

export function driveLink(path) {
  if (!path) return '';
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new DriveError('공개 시험지 경로가 올바르지 않습니다.');
  }
  if (segments[0] === '기출문제' && segments[1] === '기출확장_국영수사탐') {
    if (segments.length < 4) throw new DriveError('공개 시험지 경로가 올바르지 않습니다.');
    return EXPANSION_BASE + segments.slice(2).map(encodeURIComponent).join('/');
  }
  return PUBLIC_BASE + segments.map(encodeURIComponent).join('/');
}

// Reads a response body, aborting when no bytes arrive for stallMs (slow but moving downloads continue).
async function readWithStallGuard(url, stallMs) {
  const controller = new AbortController();
  let timer;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), stallMs); };
  arm();
  try {
    const response = await fetch(url, { credentials: 'omit', signal: controller.signal });
    if (!response.ok || !response.body) return { response, bytes: response.ok ? await response.arrayBuffer() : null };
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
      arm();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      length += value.byteLength;
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { response, bytes: bytes.buffer };
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadDriveFile(path) {
  const url = driveLink(path);
  if (!url) throw new DriveError('공개 시험지 경로가 없습니다.');
  // The public gateway sometimes never answers a request (measured: about 1 in 10 tries
  // stall, and leaving a page mid-download can stall the next ones). Each try gets a
  // deadline and a distinct URL so a stalled request is abandoned instead of joined.
  let lastError;
  for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const { response, bytes } = await readWithStallGuard(attempt ? `${url}?retry=${Date.now()}` : url, STALL_MS);
      if (!response.ok) {
        const error = new DriveError(response.status === 404
          ? '공유 폴더에서 이 시험지를 찾지 못했습니다.'
          : `공개 시험지를 불러오지 못했습니다 (HTTP ${response.status}).`, response.status);
        if (response.status < 500) throw error;
        lastError = error;
        continue;
      }
      return bytes;
    } catch (error) {
      if (error instanceof DriveError && error.status < 500) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof DriveError ? lastError
    : new DriveError('시험지 서버가 응답하지 않아 PDF를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

// Healthy downloads start within 1–8 s (max seen 7.5 s); 12 s without a byte marks a stall.
// Six tries cover the longest measured stall (four tries, 41 s) with room to spare.
const DOWNLOAD_ATTEMPTS = 6;
const STALL_MS = 12000;
