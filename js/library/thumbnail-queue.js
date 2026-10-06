// Share a small concurrency budget across searches; discard queued work when results change.
export function createThumbnailQueue(limit = 3) {
  let active = 0;
  const pending = [];
  const drain = () => {
    while (active < limit && pending.length) {
      const { task, resolve, reject } = pending.shift();
      active += 1;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; drain(); });
    }
  };
  return {
    enqueue(task) {
      return new Promise((resolve, reject) => { pending.push({ task, resolve, reject }); drain(); });
    },
    clear() { pending.splice(0).forEach(item => item.resolve()); },
  };
}
