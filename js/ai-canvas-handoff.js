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

function compositionObjects(value) {
  const selected = new Set(value.selectedIds || []);
  return (value.objects || []).filter(object => object && (!selected.size || selected.has(object.id))
    && (object.type === 'image' || object.exportable !== false)
    && !(value.layers || []).some(layer => layer.id === (object.layerId ?? 1) && layer.visible === false));
}

function compositionFingerprint(value) {
  return JSON.stringify({objects:compositionObjects(value), selectedIds:value.selectedIds || [],
    artboard:value.artboard, layers:value.layers || []});
}

export function canvasCompositionSnapshot(value) {
  if (!value || !Array.isArray(value.objects)) return null;
  const objects = compositionObjects(value);
  if (!objects.length) return null;
  return Object.freeze({
    activePageId:value.activePageId ?? null, pages:value.pages,
    activePage:value.pages?.find(page => page?.id === value.activePageId),
    objects:value.objects, fingerprint:compositionFingerprint(value),
    objectIds:objects.map(object => object.id),
    stateCopy:{objects:clone(objects), artboard:clone(value.artboard), layers:clone(value.layers || [])},
  });
}

function compositionIsCurrent(snapshot, value) {
  return value?.pages === snapshot.pages && value.activePageId === snapshot.activePageId
    && value.pages?.find(page => page?.id === value.activePageId) === snapshot.activePage
    && value.objects === snapshot.objects && compositionFingerprint(value) === snapshot.fingerprint;
}

async function handCompositionToAi(state, {renderComposition, openPanel, reportError}) {
  const snapshot = canvasCompositionSnapshot(state.get());
  if (!snapshot) { await openPanel(); return Object.freeze({status:'empty'}); }
  let stale = false;
  const unsubscribe = state.subscribe(value => { if (!compositionIsCurrent(snapshot,value)) stale = true; });
  try {
    if (typeof renderComposition !== 'function') throw new Error('캔버스 조합을 이미지로 준비할 수 없습니다.');
    const dataUrl = await renderComposition(snapshot.stateCopy);
    if (stale || !compositionIsCurrent(snapshot,state.get())) return Object.freeze({status:'stale'});
    if (typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) throw new Error('캔버스 조합의 보이는 픽셀을 준비하지 못했습니다.');
    await openPanel({references:[{dataUrl,name:'캔버스 조합',sourceKind:'canvas-composition',
      source:{pageId:snapshot.activePageId,objectIds:[...snapshot.objectIds]}}],startGeneration:false});
    return Object.freeze({status:'opened'});
  } catch (error) {
    reportError(error instanceof Error ? error : new Error(String(error)));
    return Object.freeze({status:'error'});
  } finally { unsubscribe?.(); }
}

export async function handSelectedCanvasImageToAi(state, { renderImage, renderComposition, openPanel, reportError = () => {} }) {
  const snapshot = selectedCanvasImageSnapshot(state?.get?.());
  if (!snapshot) {
    return handCompositionToAi(state,{renderComposition,openPanel,reportError});
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
