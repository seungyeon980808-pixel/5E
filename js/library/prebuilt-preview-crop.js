const pageImages = new Map();

function loadPageImage(url) {
  let pending = pageImages.get(url);
  if (!pending) {
    pending = (async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    })();
    pageImages.set(url, pending);
    pending.catch(() => { if (pageImages.get(url) === pending) pageImages.delete(url); });
    if (pageImages.size > 24) pageImages.delete(pageImages.keys().next().value);
  }
  return pending;
}

export async function cropPrebuiltPreview(url, rect, thumbnail = false) {
  const image = await loadPageImage(url);
  const [x, y, width, height] = rect;
  const pixelWidth = width * image.naturalWidth;
  const pixelHeight = height * image.naturalHeight;
  const scale = thumbnail ? Math.min(1, 320 / Math.max(pixelWidth, pixelHeight)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(pixelWidth * scale));
  canvas.height = Math.max(1, Math.round(pixelHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('미리보기 이미지를 표시할 수 없습니다.');
  context.drawImage(image, x * image.naturalWidth, y * image.naturalHeight, pixelWidth, pixelHeight, 0, 0, canvas.width, canvas.height);
  // toDataURL은 그림 압축을 이 창에서 멈춘 채로 해 목록을 넘길 때마다 스크롤이 끊겼다. toBlob(압축은 따로)로 받아 같은 data: 주소로 돌려준다.
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
  const dataUrl = blob ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }) : canvas.toDataURL('image/webp', 0.85);
  return { dataUrl, width: canvas.width, height: canvas.height };
}
