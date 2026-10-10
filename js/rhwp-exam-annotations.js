import { copyExamData } from './rhwp-exam-links.js?v=1.7.0-four-session-integration';

const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const point = value => record(value) && Number.isFinite(value.x) && Number.isFinite(value.y);

export class AnnotationConflictError extends Error {
  constructor(ids = []) {
    super('원래 5E 탭의 라벨이 바뀌었습니다. 그림 편집을 다시 열어주세요.');
    this.name = 'AnnotationConflictError';
    this.code = 'ANNOTATION_CONFLICT';
    this.ids = [...new Set(ids)];
  }
}

// Return the actual active page; callers wanting a detached snapshot use
// annotationsFor. Never silently edit the first page of a multi-page source.
export function getAnnotationPage(source) {
  if (!record(source)) throw new Error('그림 원본 페이지가 없습니다.');
  if (Array.isArray(source.pages)) {
    const pages = source.activePageId == null && source.pages.length === 1
      ? source.pages : source.pages.filter(page => page?.id === source.activePageId);
    if (pages.length !== 1 || !record(pages[0]) || !Array.isArray(pages[0].objects)) {
      throw new Error('그림 원본의 활성 페이지를 찾지 못했습니다.');
    }
    return pages[0];
  }
  if (!Array.isArray(source.objects)) throw new Error('그림 원본 페이지가 없습니다.');
  return source;
}

function validateLabels(labels) {
  if (!Array.isArray(labels) || labels.length > 10000) throw new Error('라벨 목록 형식이 올바르지 않습니다.');
  const ids = new Set();
  for (const label of labels) {
    if (!record(label) || label.type !== 'labeler' || typeof label.id !== 'string' || !label.id.length || label.id.length > 200 || ids.has(label.id)) {
      throw new Error('라벨에는 중복되지 않는 ID와 labeler 형식이 필요합니다.');
    }
    ids.add(label.id);
    if (!point(label.p1) || !point(label.p2) || ['p3','elbow'].some(key => label[key] != null && !point(label[key]))) {
      throw new Error('라벨 지시선의 위치가 올바르지 않습니다.');
    }
    if (label.text !== undefined && typeof label.text !== 'string') throw new Error('라벨 텍스트 형식이 올바르지 않습니다.');
    if (label.labelSize !== undefined && (!Number.isFinite(label.labelSize) || label.labelSize <= 0)) throw new Error('라벨 글자 크기가 올바르지 않습니다.');
    validateData(label);
  }
  return labels;
}

function validateData(value, parents = new Set(), depth = 0) {
  if (value == null || ['string','boolean','undefined'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if ((!record(value) && !Array.isArray(value)) || depth > 32 || parents.has(value)) throw new Error('라벨 데이터 형식이 올바르지 않습니다.');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('라벨 데이터 형식이 올바르지 않습니다.');
  parents.add(value);
  for (const item of Object.values(value)) validateData(item, parents, depth + 1);
  parents.delete(value);
}

export function validateAnnotationPatch(baseline, edited) {
  validateLabels(baseline);
  validateLabels(edited);
  return true;
}

export function annotationsFor(source) {
  return copyExamData(validateLabels(getAnnotationPage(source).objects.filter(object => object?.type === 'labeler')));
}

// Object property insertion order is not meaningful; label array order is.
// Undefined optional fields are equivalent to their serialized absence.
function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value,index) => equal(value,b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a).filter(key => a[key] !== undefined), other = Object.keys(b).filter(key => b[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(b,key) && equal(a[key],b[key]));
}

export function annotationSnapshotsEqual(a, b) {
  validateAnnotationPatch(a,b);
  return equal(a,b);
}

function assertObjectIds(page) {
  const ids = new Set();
  for (const object of page.objects) {
    if (!record(object) || typeof object.id !== 'string' || !object.id || ids.has(object.id)) throw new Error('그림 객체 ID가 없거나 중복되었습니다.');
    ids.add(object.id);
  }
}

// The baseline is the complete label snapshot read before editing. Any live
// label change invalidates this transaction, including additions/deletions.
// Non-label objects remain in their original relative order and are untouched.
export function mergeAnnotationPatch(source, baseline, edited) {
  validateAnnotationPatch(baseline,edited);
  const page = getAnnotationPage(source), current = annotationsFor(page);
  assertObjectIds(page);
  if (!equal(current,baseline)) {
    const before = new Map(baseline.map(label => [label.id,label])), now = new Map(current.map(label => [label.id,label]));
    const ids = [...new Set([...before.keys(),...now.keys()])].filter(id => !equal(before.get(id),now.get(id)));
    throw new AnnotationConflictError(ids.length ? ids : current.map(label => label.id));
  }
  const nonLabelIds = new Set(page.objects.filter(object => object.type !== 'labeler').map(object => object.id));
  const collisions = edited.filter(label => nonLabelIds.has(label.id)).map(label => label.id);
  if (collisions.length) throw new AnnotationConflictError(collisions);
  const merged = copyExamData(source), target = getAnnotationPage(merged), labels = copyExamData(edited);
  const originalIds = new Set(current.map(label => label.id)), editedIds = new Set(labels.map(label => label.id));
  let index = 0, remaining = current.filter(label => editedIds.has(label.id)).length;
  target.objects = target.objects.flatMap(object => {
    if (object.type !== 'labeler') return [object];
    if (!editedIds.has(object.id)) return [];
    // Surviving labels retain their slots among nonlabels. New labels use their
    // edited neighbours as anchors; explicit reordering still follows edited.
    const slot = [];
    while (index < labels.length) {
      const label = labels[index++];slot.push(label);
      if (originalIds.has(label.id)) break;
    }
    if (--remaining === 0) {
      slot.push(...labels.slice(index));
      index = labels.length;
    }
    return slot;
  });
  target.objects.push(...labels.slice(index));
  return merged;
}

// Native document undo/redo changes only IDs affected by that revision.
// Disjoint annotation drafts and every non-annotation draft survive. A changed
// ID must still match either the previous commit or the already-applied next
// commit; a third value is a conflict, never an invitation to overwrite.
export function mergeAnnotationRevision(page, previousSource, nextSource) {
  const current = annotationsFor(page), previous = Array.isArray(previousSource) ? previousSource : annotationsFor(previousSource), next = Array.isArray(nextSource) ? nextSource : annotationsFor(nextSource);
  validateAnnotationPatch(previous,next);
  const before = new Map(previous.map(label => [label.id,label])), after = new Map(next.map(label => [label.id,label])), live = new Map(current.map(label => [label.id,label]));
  const changed = [...new Set([...before.keys(),...after.keys()])].filter(id => !equal(before.get(id),after.get(id)));
  const conflicts = changed.filter(id => !equal(live.get(id),before.get(id)) && !equal(live.get(id),after.get(id)));
  if (conflicts.length) throw new AnnotationConflictError(conflicts);
  const previousOrder = previous.filter(label => after.has(label.id)).map(label => label.id), nextOrder = next.filter(label => before.has(label.id)).map(label => label.id);
  const liveOrder = current.filter(label => before.has(label.id) && after.has(label.id)).map(label => label.id);
  if (!equal(previousOrder,nextOrder) && !equal(liveOrder,previousOrder) && !equal(liveOrder,nextOrder)) throw new AnnotationConflictError(nextOrder);
  const changedIds = new Set(changed);
  const edited = current.flatMap(label => changedIds.has(label.id) ? after.has(label.id) ? [after.get(label.id)] : [] : [label]);
  for (let index = 0; index < next.length; index++) {
    const label = next[index];
    if (!changedIds.has(label.id) || live.has(label.id)) continue;
    // Insert immediately after the nearest committed predecessor, before any
    // draft-only labels following it. If none survives, use the next anchor.
    let at = -1;
    for (let previous = index - 1; previous >= 0 && at < 0; previous--) {
      const anchor = edited.findIndex(item => item.id === next[previous].id);
      if (anchor >= 0) at = anchor + 1;
    }
    for (let following = index + 1; following < next.length && at < 0; following++) at = edited.findIndex(item => item.id === next[following].id);
    edited.splice(at < 0 ? 0 : at,0,label);
  }
  if (!equal(previousOrder,nextOrder)) {
    const labels = new Map(edited.map(label => [label.id,label]));
    const ordered = next.filter(label => labels.has(label.id)).map(label => labels.get(label.id));
    let index = 0;
    for (let at = 0; at < edited.length; at++) if (after.has(edited[at].id)) edited[at] = ordered[index++];
  }
  return mergeAnnotationPatch(page,current,edited);
}
