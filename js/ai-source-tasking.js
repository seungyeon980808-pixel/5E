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
