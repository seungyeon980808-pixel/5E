import { cropBoxToBounds } from "./cut-geometry.js";

export function contentBounds(data, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 8 || (data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248)) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return null;
  return { x0: left / width, y0: top / height, x1: (right + 1) / width, y1: (bottom + 1) / height };
}

export async function trimImageMargins(object) {
  const image = new Image();
  if (/^https?:/i.test(object.src)) image.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
    image.src = object.src;
  });
  const sr = object.srcRect || { x: 0, y: 0, w: 1, h: 1 };
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * sr.w));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * sr.h));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("이미지를 읽을 수 없습니다.");
  ctx.drawImage(image, sr.x * image.naturalWidth, sr.y * image.naturalHeight,
    sr.w * image.naturalWidth, sr.h * image.naturalHeight, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = contentBounds(pixels.data, canvas.width, canvas.height);
  return bounds ? cropBoxToBounds(object, bounds) : null;
}
