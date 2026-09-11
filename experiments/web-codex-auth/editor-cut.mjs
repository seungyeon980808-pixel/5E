function announceCut(message) {
  let notice = document.querySelector('[data-editor-cut-status]');
  if (!notice) {
    notice = document.createElement('div');
    notice.dataset.editorCutStatus = '';
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10000;padding:12px 18px;border-radius:8px;background:var(--bg-panel);color:var(--text-primary);max-width:90vw;font-size:13px;pointer-events:none';
    document.body.append(notice);
  }
  notice.textContent = message;
  notice.hidden = false;
  clearTimeout(notice.hideTimer);
  notice.hideTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}
async function selectionPng(snapshot, objects) {
  if (objects.length === 1 && objects[0].type === 'image' && objects[0].src) {
    const response = await fetch(objects[0].src);
    if (!response.ok) throw new Error('이미지를 읽을 수 없습니다.');
    const blob = await response.blob();
    if (blob.type === 'image/png') return blob;
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      return await canvasPng(canvas);
    } finally { bitmap.close(); }
  }
  const exporter = await import('/editor/js/svg-export.js?v=1.4.0');
  const exportState = { ...snapshot, objects: objects.map(object => ({ ...object, exportable: true })) };
  const bounds = exporter.getContentBounds(exportState, {}, 0.5);
  if (!bounds) throw new Error('선택 영역을 이미지로 만들 수 없습니다.');
  await exporter.ensureEmbeddedFonts();
  const { canvas } = await exporter.rasterizeExportCanvas(exportState, { bounds, dpi: 300 });
  return canvasPng(canvas);
}
function canvasPng(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 변환 실패')), 'image/png'));
}
export function createCutHandler({ state, setClipboard, notify = announceCut }) {
  let pending = false;
  return async function cutSelection() {
    if (pending) return;
    const snapshot = JSON.parse(JSON.stringify(state.get()));
    const objects = snapshot.objects.filter(object => snapshot.selectedIds.includes(object.id) && !object.locked);
    if (!objects.length) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      notify('클립보드에 접근할 수 없어 잘라내지 않았습니다.'); return;
    }
    pending = true;
    try {
      const png = selectionPng(snapshot, objects);
      void png.catch(() => {});
      // Start write in the key event's activation, before PNG conversion resolves.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      const current = state.get();
      if (current.activePageId !== snapshot.activePageId ||
          JSON.stringify(current.objects) !== JSON.stringify(snapshot.objects) ||
          JSON.stringify(current.selectedIds) !== JSON.stringify(snapshot.selectedIds) ||
          document.querySelector('.modal-overlay:not([hidden]), dialog[open]')) {
        notify('클립보드에 복사했습니다. 작업 화면이 변경되어 원본은 유지했습니다.'); return;
      }
      const ids = new Set(objects.map(object => object.id));
      setClipboard(objects);
      state.update(next => {
        next.undoStack.push(snapshot.objects);
        next.redoStack = [];
        next.objects = next.objects.filter(object => !ids.has(object.id));
        next.selectedIds = next.selectedIds.filter(id => !ids.has(id));
      });
      notify('잘라냈습니다. 다른 캔버스나 이미지 변형 창에서 붙여넣을 수 있습니다.');
    } catch {
      notify('클립보드에 저장하지 못해 잘라내지 않았습니다. 다시 시도해 주세요.');
    } finally { pending = false; }
  };
}
