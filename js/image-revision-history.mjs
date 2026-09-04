function copyItem(item) {
  return { ...item };
}

export function activeImageRevision(history) {
  const items = history || [];
  return items.findLast((item) => item.active === true) || items.at(-1) || null;
}

export function appendImageRevision(history, item) {
  const items = [...(history || [])];
  items.forEach((entry) => { entry.active = false; });
  return [...items, { ...item, active: true }];
}

export function activateImageRevision(history, id) {
  const items = history || [];
  if (!items.some((item) => item.id === id)) throw new Error(`이미지 버전을 찾을 수 없습니다: ${id}`);
  return items.map((item) => ({ ...item, active: item.id === id }));
}

export function revisionComparison(history) {
  const items = history || [];
  const after = activeImageRevision(items);
  if (!after) return { before: null, after: null };
  const activeIndex = items.findIndex((item) => item.id === after.id);
  const before = activeIndex > 0 ? items[activeIndex - 1] : items.find((item) => item.id !== after.id) || null;
  return { before, after };
}

export function beginImageRevision(history, input) {
  return {
    history: (history || []).map(copyItem),
    input: String(input || ""),
    activeId: activeImageRevision(history)?.id || null,
  };
}

export function finishImageRevision(pending, outcome) {
  const history = (pending?.history || []).map(copyItem);
  if (outcome?.status === "complete" && outcome.item) {
    const completed = appendImageRevision(history, outcome.item);
    return {
      status: "complete",
      history: completed,
      input: pending.input,
      active: activeImageRevision(completed),
    };
  }
  return {
    status: outcome?.status || "failed",
    error: outcome?.error || null,
    history,
    input: pending?.input || "",
    active: activeImageRevision(history),
  };
}
