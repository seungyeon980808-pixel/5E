const EMPTY_EDITOR_SCENE = Object.freeze({ objects: Object.freeze([]) });

function requireId(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  return value;
}

function immutableDescriptor(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return Object.freeze({ ...value });
}

function cloneEditorValue(value) {
  if (Array.isArray(value)) return value.map(cloneEditorValue);
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneEditorValue(entry)]));
}

function replaceItem(state, workItemId, update) {
  let found = false;
  const workItems = state.workItems.map((item) => {
    if (item.id !== workItemId) return item;
    found = true;
    return update(item);
  });
  return found ? { ...state, workItems } : state;
}

function findItem(state, workItemId) {
  return state.workItems.find((item) => item.id === workItemId) || null;
}

function matchesPending(item, token) {
  const pending = item?.pendingOperation;
  return item?.operation === "running"
    && pending !== null
    && pending.workItemId === token?.workItemId
    && pending.candidateId === token?.candidateId
    && pending.epoch === token?.epoch;
}

function transitionResult(state, applied) {
  return { state, status: applied ? "applied" : "ignored" };
}

export function createLiteWorkflowState() {
  return { workItems: [], activeWorkItemId: null };
}

export function createLiteWorkItem({ id, original, candidate = null }) {
  const itemId = requireId(id, "work item id");
  const initialCandidate = candidate === null
    ? null
    : immutableDescriptor({ ...candidate, id: requireId(candidate.id, "candidate id") }, "candidate");
  return {
    id: itemId,
    original: immutableDescriptor(original, "original"),
    candidates: initialCandidate ? [initialCandidate] : [],
    activeCandidateId: initialCandidate?.id || null,
    epoch: 0,
    operation: initialCandidate ? (initialCandidate.reviewRequired ? "review" : "ready") : "idle",
    pendingOperation: null,
    lastError: null,
    editorCandidateId: initialCandidate?.id || null,
    editorScene: EMPTY_EDITOR_SCENE,
    undoStack: [],
    redoStack: [],
    selection: [],
    selectedForExport: false,
    lastSave: null,
  };
}

export function addWorkItem(state, workItem) {
  if (findItem(state, workItem.id)) throw new Error(`Duplicate Lite work item: ${workItem.id}`);
  return {
    ...state,
    workItems: [...state.workItems, workItem],
    activeWorkItemId: state.activeWorkItemId || workItem.id,
  };
}

export function activateWorkItem(state, workItemId) {
  requireId(workItemId, "work item id");
  if (!findItem(state, workItemId)) throw new Error(`Unknown Lite work item: ${workItemId}`);
  return state.activeWorkItemId === workItemId ? state : { ...state, activeWorkItemId: workItemId };
}

export function startOperation(state, { workItemId, candidateId }) {
  requireId(workItemId, "work item id");
  requireId(candidateId, "candidate id");
  const current = findItem(state, workItemId);
  if (!current) throw new Error(`Unknown Lite work item: ${workItemId}`);
  const token = Object.freeze({ workItemId, candidateId, epoch: current.epoch + 1 });
  return {
    token,
    state: replaceItem(state, workItemId, (item) => ({
      ...item,
      epoch: token.epoch,
      operation: "running",
      pendingOperation: token,
      lastError: null,
    })),
  };
}

export function completeOperation(state, token, candidate) {
  const current = findItem(state, token?.workItemId);
  if (!matchesPending(current, token) || candidate?.id !== token.candidateId) {
    return transitionResult(state, false);
  }
  const committed = immutableDescriptor(candidate, "candidate");
  const existingIndex = current.candidates.findIndex((entry) => entry.id === committed.id);
  const candidates = existingIndex < 0
    ? [...current.candidates, committed]
    : current.candidates.map((entry, index) => index === existingIndex ? committed : entry);
  const preserveEditor = current.activeCandidateId === committed.id
    && current.editorCandidateId === committed.id;
  const next = replaceItem(state, current.id, (item) => ({
    ...item,
    candidates,
    activeCandidateId: committed.id,
    operation: committed.reviewRequired ? "review" : "ready",
    pendingOperation: null,
    lastError: null,
    editorCandidateId: committed.id,
    editorScene: preserveEditor ? item.editorScene : EMPTY_EDITOR_SCENE,
    undoStack: preserveEditor ? item.undoStack : [],
    redoStack: preserveEditor ? item.redoStack : [],
    selection: preserveEditor ? item.selection : [],
    lastSave: preserveEditor ? item.lastSave : null,
  }));
  return transitionResult(next, true);
}

export function failOperation(state, token, error) {
  const current = findItem(state, token?.workItemId);
  if (!matchesPending(current, token)) return transitionResult(state, false);
  const next = replaceItem(state, current.id, (item) => ({
    ...item,
    operation: "failed",
    pendingOperation: null,
    lastError: error && typeof error === "object" ? Object.freeze({ ...error }) : { message: String(error) },
  }));
  return transitionResult(next, true);
}

export function cancelOperation(state, token) {
  const current = findItem(state, token?.workItemId);
  if (!matchesPending(current, token)) return transitionResult(state, false);
  const next = replaceItem(state, current.id, (item) => ({
    ...item,
    epoch: item.epoch + 1,
    operation: "cancelling",
    pendingOperation: null,
    lastError: null,
  }));
  return transitionResult(next, true);
}

export function updateEditorSnapshot(state, {
  workItemId, candidateId, editorScene,
  undoStack = [], redoStack = [], selection = [],
}) {
  const current = findItem(state, workItemId);
  if (!current || current.activeCandidateId !== candidateId) return state;
  return replaceItem(state, workItemId, (item) => ({
    ...item,
    editorCandidateId: candidateId,
    editorScene: cloneEditorValue(editorScene || EMPTY_EDITOR_SCENE),
    undoStack: cloneEditorValue(undoStack),
    redoStack: cloneEditorValue(redoStack),
    selection: cloneEditorValue(selection),
  }));
}

export function setExportSelected(state, { workItemId, selected }) {
  return replaceItem(state, workItemId, (item) => ({
    ...item,
    selectedForExport: selected === true,
  }));
}

export function recordCompletedSave(state, { workItemId, candidateId, receipt }) {
  const current = findItem(state, workItemId);
  const isWriterReceipt = receipt?.status === "stored"
    && receipt.completed === true
    && typeof receipt.writerId === "string"
    && receipt.writerId.length > 0;
  if (!current || current.activeCandidateId !== candidateId || !isWriterReceipt) {
    return transitionResult(state, false);
  }
  const next = replaceItem(state, workItemId, (item) => ({
    ...item,
    lastSave: Object.freeze({ ...receipt, candidateId }),
  }));
  return transitionResult(next, true);
}

export function serializeLiteWorkflowState(state) {
  return {
    activeWorkItemId: state.activeWorkItemId,
    workItems: state.workItems.map((item) => ({
      ...item,
      candidates: [...item.candidates],
      undoStack: [...item.undoStack],
      redoStack: [...item.redoStack],
      selection: [...item.selection],
    })),
  };
}

export function restoreLiteWorkflowState(snapshot) {
  const restored = serializeLiteWorkflowState(snapshot);
  restored.workItems = restored.workItems.map((item) => {
    if (item.operation !== "running" && item.operation !== "cancelling") return item;
    return {
      ...item,
      operation: "interrupted",
      pendingOperation: null,
      lastError: Object.freeze({ code: "interrupted" }),
    };
  });
  if (!restored.workItems.some((item) => item.id === restored.activeWorkItemId)) {
    restored.activeWorkItemId = restored.workItems[0]?.id || null;
  }
  return restored;
}
