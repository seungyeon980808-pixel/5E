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
  return { dataUrl: canvas.toDataURL('image/webp', 0.85), width: canvas.width, height: canvas.height };
}
