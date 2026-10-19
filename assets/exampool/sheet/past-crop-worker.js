// 기출 카드 그림 자르기를 화면 밖(작업자 스레드)에서 한다: 그림 읽기·픽셀 훑기·PNG 만들기가 목록 스크롤·입력을 막지 않게.
import { pastCropRect } from './past-crop.js';
self.onmessage = async ({ data: { id, url } }) => {
  try {
    const res = await fetch(url, { mode: 'cors' }); if (!res.ok) throw Error(String(res.status));
    const bmp = await createImageBitmap(await res.blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const r = pastCropRect(g.getImageData(0, 0, c.width, c.height));
    if (!r) { bmp.close(); self.postMessage({ id, blob: null }); return; }
    const out = new OffscreenCanvas(r.width, r.height); out.getContext('2d').drawImage(bmp, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height); bmp.close();
    self.postMessage({ id, blob: await out.convertToBlob({ type: 'image/png' }) });
  } catch (e) { self.postMessage({ id, error: String(e?.message || e) }); }
};
