// One observer and one visibility listener for all loading frames.
const frames = new Map();
let observer;
let listening = false;
let refreshFrame = 0;
function scheduleRefresh() {
  // Hidden documents may suspend animation frames entirely. Newly created
  // motion must still pause in the same mutation delivery.
  if (document.hidden) { refresh(); return; }
  if (refreshFrame) return;
  // Every card observes its own children. A rendered batch must scan the
  // shared frames once, rather than once per card's mutation callback.
  refreshFrame = requestAnimationFrame(() => { refreshFrame = 0; refresh(); });
}
function refresh() {
  let lights = 0;
  for (const [node, entry] of frames) {
    for (const animation of entry.paused) {
      if (animation.playState === 'idle' || animation.playState === 'finished') entry.paused.delete(animation);
    }
    const running = entry.visible && !document.hidden;
    node.dataset.loadingMotion = running ? 'running' : 'paused';
    node.dataset.loadingSheen = running && lights++ < 4 ? 'on' : 'off';
    for (const animation of node.getAnimations({ subtree: true })) {
      if (!running && animation.playState === 'running') { animation.pause(); entry.paused.add(animation); }
      else if (running && entry.paused.delete(animation) && animation.playState === 'paused') animation.play();
    }
  }
}
export function trackLoadingMotion(node) {
  if (!listening) { document.addEventListener('visibilitychange', refresh); listening = true; }
  observer ||= typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const item of entries) { const entry = frames.get(item.target); if (entry) entry.visible = item.isIntersecting; }
    refresh();
  }) : null;
  const entry = { visible: false, paused: new Set() };
  frames.set(node, entry);
  const mutations = new MutationObserver(scheduleRefresh);
  mutations.observe(node, { childList: true, subtree: true });
  if (observer) observer.observe(node); else entry.visible = true;
  refresh();
  return () => {
    mutations.disconnect(); observer?.unobserve(node); frames.delete(node); entry.paused.clear();
    if (!frames.size) { cancelAnimationFrame(refreshFrame); refreshFrame = 0; }
  };
}
