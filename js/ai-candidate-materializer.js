import { snapshotImageItem } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';

// Both canvas output and RHWP sources use this transaction. Preview pixels are
// never the source of a graph, and preparation never mutates the live page.
export function createCandidateMaterializer(state, services) {
  function validate(candidate) {
    const snapshot = snapshotImageItem(candidate);
    if (snapshot.graphResult) services.validateWorkbenchGraph(snapshot.graphResult);
    else if (!snapshot.data) throw new Error('삽입할 생성 이미지가 없습니다.');
    return snapshot;
  }
  async function materializeCandidate(candidate, options) {
    const {taskId,replaceId,isCurrent} = options;
    const snapshot = validate(candidate);
    if (typeof taskId !== 'string' || !taskId.trim() || typeof snapshot.id !== 'string' || !snapshot.id.trim()) {
      throw new Error('편집 원본의 작업과 후보를 확인할 수 없습니다.');
    }
    const initial = state.get(), pageId = initial.activePageId;
    const page = initial.pages.find(record => record.id === pageId);
    const target = replaceId ? initial.objects.find(object => object.id === replaceId) : null;
    if (replaceId && (!target || target.aiTaskId !== taskId || !target.aiCandidateId
      || !['image','coordplane'].includes(target.type) || target.editableAssetRegionId
      || target.locked || target.positionLocked
      || target.imageSelectionLocked && !target.aiLabelEditingBackground)) {
      throw new Error('이 작업이 소유한 편집 원본만 교체할 수 있습니다.');
    }
    const owned = target ? initial.objects.filter(object => object === target
      || object.aiTaskId === taskId && object.aiCandidateId === target.aiCandidateId
        && (target.type === 'image' ? object.aiAutoLabel === true && object.aiParentImageId === target.id
          : object.type === 'funcgraph' && object.planeId === target.id)) : [];
    if (owned.some(object => object.locked || object.positionLocked)) {
      throw new Error('잠긴 객체를 포함한 편집 원본은 교체할 수 없습니다.');
    }
    const ownedIds = new Set(owned.map(object => object.id));
    const fingerprints = owned.map(object => JSON.stringify(object));
    const candidateFingerprint = JSON.stringify(snapshot);
    const linkFingerprint = JSON.stringify(page?.meta?.examLink);
    let invalidated = false;
    const contextMatches = value => value.activePageId === pageId
      && value.pages.find(record => record.id === pageId) === page
      && JSON.stringify(page?.meta?.examLink) === linkFingerprint
      && (!isCurrent || isCurrent())
      && JSON.stringify(snapshotImageItem(candidate)) === candidateFingerprint
      && owned.every((object,index) => value.objects.find(item => item.id === object.id) === object
        && JSON.stringify(object) === fingerprints[index]);
    const assertCurrent = () => {
      if (invalidated || !contextMatches(state.get())) throw new Error('준비 중 원본 페이지·작업 또는 후보가 변경되었습니다.');
    };
    assertCurrent();
    const unsubscribe = state.subscribe?.(value => {
      try { if (!contextMatches(value)) invalidated = true; }
      catch { invalidated = true; }
    });
    try {
      const draft = {...initial,objects:[],groups:[],selectedIds:[],undoStack:[],redoStack:[]};
      const staging = {get:() => draft,update:fn => fn(draft)};
      let result;
      if (snapshot.graphResult) {
        result = services.insertWorkbenchGraph(staging,snapshot.graphResult,{taskId,candidateId:snapshot.id});
      } else if (target?.type === 'image') {
        const prepared = await services.prepareImageCandidateRevision(target,snapshot.data,{
          aiTaskId:taskId,aiCandidateId:snapshot.id,editableLabelPlan:snapshot.labelPlan,
        });
        draft.objects = [prepared.image,...prepared.labels.map(label => ({...label,layerId:target.layerId}))];
        draft.selectedIds = prepared.image.imageSelectionLocked ? prepared.labels.map(label => label.id) : draft.objects.map(object => object.id);
        result = {imageId:prepared.image.id,ids:draft.objects.map(object => object.id)};
      } else {
        const imageId = await services.insertImageFromSrc(staging,snapshot.data,{
          preserveBytes:true,centerArtboard:true,aiTaskId:taskId,aiCandidateId:snapshot.id,
          editableLabelPlan:snapshot.labelPlan,sourceMetadata:snapshot.source,
        });
        result = {imageId,ids:draft.objects.map(object => object.id)};
      }
      assertCurrent();
      if (!draft.objects.length || new Set(draft.objects.map(object => object.id)).size !== draft.objects.length
        || draft.objects.some(object => initial.objects.some(current => current.id === object.id && !ownedIds.has(current.id)))) {
        throw new Error('편집 원본의 객체 식별자가 충돌합니다.');
      }
      state.update(value => {
        assertCurrent();
        value.undoStack.push(structuredClone(value.objects));
        if (value.undoStack.length > 60) value.undoStack.splice(0,value.undoStack.length-60);
        value.redoStack = [];
        const insertion = target ? value.objects.indexOf(target) : value.objects.length;
        const remaining = value.objects.filter(object => !ownedIds.has(object.id));
        remaining.splice(Math.min(insertion,remaining.length),0,...draft.objects);
        value.objects = remaining;
        value.selectedIds = [...draft.selectedIds];
        value.targetedId = null;
        value.activeTool = 'V';
        services.rebuildGroups(value);
      });
      return result;
    } finally {
      unsubscribe?.();
    }
  }
  materializeCandidate.validate = validate;
  return materializeCandidate;
}
