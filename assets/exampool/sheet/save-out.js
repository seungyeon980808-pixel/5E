// 11-11 사용자: 설치판에서는 파일이 정해진 폴더(~/Documents/5E/출제)에 날짜_시간 이름으로 차곡차곡 쌓여야 한다.
// 웹(브라우저)에서는 예전처럼 내려받기. HWPX는 설치판이면 저장한 뒤 바로 한글로 연다.
export function desktopFiles() {
  try { return window.parent?.fiveEDesktop?.examFiles || window.fiveEDesktop?.examFiles || null; } catch { return null; }
}
function browserDownload(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const toBytes = bytes => bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes)
  : ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new TextEncoder().encode(String(bytes));
// 돌려줌: {desktop:true, path, name, opened} 또는 {desktop:false, name}
export async function saveOut(bytes, name, mime = 'application/octet-stream', { open = false } = {}) {
  const files = desktopFiles(), ext = (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  if (!files || !ext) { browserDownload(bytes, name, mime); return { desktop: false, name }; }
  const saved = await files.save({ name, ext, bytes: toBytes(bytes) });
  let opened = false;
  if (open) { try { await files.open(saved.path); opened = true; } catch { opened = false; } }
  return { desktop: true, path: saved.path, name: saved.name, opened };
}
// 상태 줄 문장: 설치판은 어디에 저장했는지, 한글로 열었는지까지.
export function savedText(result, what) {
  if (!result.desktop) return `${what}을(를) 내려받았습니다.`;
  const where = result.path.split(/[\\/]/).slice(-2).join('/');
  return `${what} 저장 · 문서/5E/출제/${where}${result.opened ? ' · 한글로 열었습니다' : ''}`;
}
