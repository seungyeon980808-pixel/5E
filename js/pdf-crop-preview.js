export function createCropPreview(root) {
  const preview = root.querySelector("[data-ai-pdf-crop-preview]");
  const canvas = preview?.querySelector("canvas");
  const label = preview?.querySelector("span");
  return {
    clear() { if (preview) preview.hidden = true; },
    show(image, box, name = "선택 영역") {
      if (!preview || !canvas || !box || !image?.naturalWidth || !image?.naturalHeight) return;
      const sx = Math.round(box.x * image.naturalWidth), sy = Math.round(box.y * image.naturalHeight);
      const sw = Math.max(1, Math.round(box.w * image.naturalWidth));
      const sh = Math.max(1, Math.round(box.h * image.naturalHeight));
      const scale = Math.min(220 / sw, 140 / sh, 2);
      canvas.width = Math.max(1, Math.round(sw * scale)); canvas.height = Math.max(1, Math.round(sh * scale));
      canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      if (label) label.textContent = `${name} 확대 미리보기`;
      preview.hidden = false;
    },
  };
}
