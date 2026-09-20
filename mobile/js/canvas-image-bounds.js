import { createStore } from "./store.js?v=1.4.0";

export function constrainImageToArtboard(image, artboard) {
  if (image.type !== "image" || image.locked || !(image.w > 0 && image.h > 0)) return;
  const angle = (image.rotation || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
  let width = image.w * c + image.h * s;
  let height = image.w * s + image.h * c;
  let cx = image.x + image.w / 2, cy = image.y + image.h / 2;
  const scale = Math.min(1, artboard.w / width, artboard.h / height);
  image.w *= scale; image.h *= scale;
  width *= scale; height *= scale;
  cx = Math.max(-artboard.w / 2 + width / 2, Math.min(artboard.w / 2 - width / 2, cx));
  cy = Math.max(-artboard.h / 2 + height / 2, Math.min(artboard.h / 2 - height / 2, cy));
  image.x = cx - image.w / 2; image.y = cy - image.h / 2;
}

const geometry = image => [image.x, image.y, image.w, image.h, image.rotation].join(",");

export function createCanvasStore(initial) {
  const store = createStore(initial);
  return { ...store, update(updater) {
    store.update(s => {
      const enabled = s.constrainImagesToArtboard;
      const previous = enabled ? new Map(s.objects.filter(o => o.type === "image").map(o => [o.id, geometry(o)])) : null;
      const undoCount = s.undoStack.length, redoCount = s.redoStack.length;
      const objects = s.objects, pages = s.pages, page = s.activePageId;
      updater(s);
      // Restoring history or changing pages must retain the recorded geometry.
      const restoringRedo = s.objects !== objects && s.redoStack.length < redoCount && s.undoStack.length > undoCount;
      if (s.pages !== pages || restoringRedo || !enabled || !s.constrainImagesToArtboard || s.undoStack.length < undoCount || page !== s.activePageId) return;
      for (const image of s.objects) {
        if (image.type === "image" && previous.get(image.id) !== geometry(image)) constrainImageToArtboard(image, s.artboard);
      }
    });
  } };
}
