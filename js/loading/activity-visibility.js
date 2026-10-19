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
// getAnimations({subtree:true})는 스타일 계산을 강제한다. 결과 칸 전체(grid)도 등록되므로, 스크롤·카드 하나 바뀔 때마다
// 모든 칸을 훑으면 목록이 끊긴다(바쁜 컴퓨터에서 스크롤 프레임 절반 이상 50ms 초과). 상태가 바뀌었거나 안이 바뀐 칸만 훑는다.
function refresh(all = false) {
  let lights = 0;
  for (const [node, entry] of frames) {
    for (const animation of entry.paused) {
      if (animation.playState === 'idle' || animation.playState === 'finished') entry.paused.delete(animation);
    }
    const running = entry.visible && !document.hidden;
    // 같은 값을 다시 쓰면 속성이 바뀐 것으로 쳐서 스타일을 다시 계산한다 — 바뀔 때만 쓴다.
    const motion = running ? 'running' : 'paused', sheen = running && lights++ < 4 ? 'on' : 'off';
    if (node.dataset.loadingMotion !== motion) node.dataset.loadingMotion = motion;
    if (node.dataset.loadingSheen !== sheen) node.dataset.loadingSheen = sheen;
    if (!all && !entry.dirty && entry.running === running) continue;
    entry.dirty = false; entry.running = running;
    for (const animation of node.getAnimations({ subtree: true })) {
      // A completed source only has a bounded crossfade left. Let it finish
      // even under a paused grid so its promise can release the visual layers.
      const settling = animation.effect?.target?.closest?.('[data-loading-phase="settling"]');
      const active = running || settling;
      if (!active && animation.playState === 'running') { animation.pause(); entry.paused.add(animation); }
      else if (active && entry.paused.delete(animation) && animation.playState === 'paused') animation.play();
    }
  }
}
export function trackLoadingMotion(node) {
  if (!listening) { document.addEventListener('visibilitychange', () => refresh(true)); listening = true; }
  observer ||= typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const item of entries) { const entry = frames.get(item.target); if (entry) entry.visible = item.isIntersecting; }
    refresh();
  }) : null;
  const entry = { visible: false, paused: new Set(), dirty: true, running: undefined };
  frames.set(node, entry);
  const mutations = new MutationObserver(() => { entry.dirty = true; scheduleRefresh(); });
  mutations.observe(node, { childList: true, subtree: true });
  if (observer) observer.observe(node); else entry.visible = true;
  refresh();
  return () => {
    mutations.disconnect(); observer?.unobserve(node); frames.delete(node); entry.paused.clear();
    if (!frames.size) { cancelAnimationFrame(refreshFrame); refreshFrame = 0; }
  };
}
