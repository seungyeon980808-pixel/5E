// Preserve generated PNG bytes. Never redraw, quantize, or remove backgrounds.
export async function resolveGeneratedRaster(src, { whitePng = false, transform, fetcher = globalThis.fetch } = {}) {
  if (!src) throw new Error("생성 이미지가 없습니다.");
  if (!whitePng) {
    if (typeof transform !== "function") throw new Error("기존 이미지 처리기가 없습니다.");
    return transform(src);
  }
  let data = src;
  if (/^https?:\/\//i.test(src)) {
    const response = await fetcher(src);
    if (!response.ok) throw new Error("생성 PNG 원본을 내려받지 못했습니다.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    data = `data:image/png;base64,${btoa(binary)}`;
  }
  if (!/^data:image\/png;base64,/i.test(data)) throw new Error("생성 결과가 PNG가 아닙니다. 원본 형식을 확인해 주세요.");
  let header;
  try { header = atob(data.split(",")[1]).slice(0, 8); } catch { throw new Error("PNG 데이터가 올바르지 않습니다."); }
  if (header !== "\x89PNG\r\n\x1a\n") throw new Error("PNG 파일 서명이 올바르지 않습니다.");
  return data;
}
