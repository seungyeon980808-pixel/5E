function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function imageFingerprint(image) {
  return JSON.stringify({ src: image.src, cutouts: image.cutouts || [] });
}

export function selectedCanvasImageSnapshot(value) {
  if (!value || !Array.isArray(value.selectedIds) || value.selectedIds.length !== 1
    || !Array.isArray(value.objects)) return null;
  const selectedId = value.selectedIds[0];
  const image = value.objects.find(object => object?.id === selectedId && object.type === 'image');
  if (!image) return null;
  const activePage = Array.isArray(value.pages)
    ? value.pages.find(page => page?.id === value.activePageId) || null
    : null;
  return Object.freeze({
    selectedId,
    activePageId: value.activePageId ?? null,
    pages: value.pages,
    activePage,
    image,
    imageCopy: clone(image),
    fingerprint: imageFingerprint(image),
  });
}

function snapshotIsCurrent(snapshot, value) {
  if (!value || value.pages !== snapshot.pages || value.activePageId !== snapshot.activePageId) return false;
  if (snapshot.activePage && value.pages?.find(page => page?.id === value.activePageId) !== snapshot.activePage) return false;
  if (!Array.isArray(value.selectedIds) || value.selectedIds.length !== 1 || value.selectedIds[0] !== snapshot.selectedId) return false;
  const image = value.objects?.find(object => object === snapshot.image && object.id === snapshot.selectedId);
  return Boolean(image && imageFingerprint(image) === snapshot.fingerprint);
}

export async function handSelectedCanvasImageToAi(state, { renderImage, openPanel, reportError = () => {} }) {
  const snapshot = selectedCanvasImageSnapshot(state?.get?.());
  if (!snapshot) {
    await openPanel();
    return Object.freeze({ status: 'empty' });
  }
  if (snapshot.image.aiTaskId) {
    await openPanel();
    return Object.freeze({ status: 'linked', taskId: snapshot.image.aiTaskId });
  }

  let stale = false;
  const unsubscribe = state.subscribe(value => {
    if (!snapshotIsCurrent(snapshot, value)) stale = true;
  });
  try {
    const dataUrl = await renderImage(snapshot.imageCopy);
    if (stale || !snapshotIsCurrent(snapshot, state.get())) return Object.freeze({ status: 'stale' });
    if (typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) {
      throw new Error('선택한 이미지의 보이는 픽셀을 준비하지 못했습니다.');
    }
    await openPanel({
      references: [{
        dataUrl,
        name: snapshot.image.name || '캔버스 이미지',
        sourceKind: 'canvas-selection',
        source: { objectId: snapshot.selectedId, pageId: snapshot.activePageId },
      }],
      startGeneration: false,
    });
    return Object.freeze({ status: 'opened' });
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)));
    return Object.freeze({ status: 'error' });
  } finally {
    unsubscribe?.();
  }
}
