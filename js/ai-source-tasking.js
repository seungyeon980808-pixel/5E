export function distributeSourcesToTaskTabs(sources, actions = {}) {
  const items = Array.from(sources || []).filter(Boolean).map((source) => structuredClone(source));
  if (!items.length) return [];

  const taskIds = [];
  if (!actions.canUseActiveTask?.()) actions.createTask?.();

  items.forEach((source, index) => {
    if (index > 0) actions.createTask?.();
    actions.addSource?.(source);
    actions.applyPrompt?.(source.prompt || "");
    actions.captureTask?.();
    taskIds.push(actions.activeTaskId?.());
  });

  if (taskIds[0]) actions.activateTask?.(taskIds[0]);
  return taskIds.filter(Boolean);
}

const isStructuralReference = source => source?.referenceRole !== "STYLE_REFERENCE";

export function normalizeReferenceComposition(value, sources = []) {
  const available = Array.from(sources || []).filter(isStructuralReference).map(source => source?.id).filter(Boolean);
  const availableSet = new Set(available);
  const requested = Array.from(value?.sourceOrder || []).filter((id, index, order) => (
    availableSet.has(id) && order.indexOf(id) === index
  ));
  const sourceOrder = [...requested, ...available.filter(id => !requested.includes(id))];
  return {
    orientation: value?.orientation === "vertical" ? "vertical" : "horizontal",
    sourceOrder,
  };
}

export function moveReferenceInComposition(value, referenceId, direction, sources = []) {
  const composition = normalizeReferenceComposition(value, sources);
  const index = composition.sourceOrder.indexOf(referenceId);
  const offset = direction === "earlier" ? -1 : direction === "later" ? 1 : 0;
  const target = index + offset;
  if (index < 0 || target < 0 || target >= composition.sourceOrder.length) return composition;
  const sourceOrder = [...composition.sourceOrder];
  [sourceOrder[index], sourceOrder[target]] = [sourceOrder[target], sourceOrder[index]];
  return { ...composition, sourceOrder };
}

export function groupSourcesInTaskTab(sources, actions = {}, { prompt = "" } = {}) {
  const items = Array.from(sources || []).filter(Boolean).map(source => structuredClone(source));
  if (!items.length) return [];
  if (!actions.canUseActiveTask?.()) actions.createTask?.();
  for (const source of items) actions.addSource?.(source);
  const taskPrompt = prompt || items.find(source => source.prompt)?.prompt || "";
  actions.applyPrompt?.(taskPrompt);
  actions.captureTask?.();
  const taskId = actions.activeTaskId?.();
  if (taskId) actions.activateTask?.(taskId);
  return taskId ? [taskId] : [];
}
