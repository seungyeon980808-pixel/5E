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
// getAnimations()는 스타일 계산을 강제한다. 칸마다 getAnimations({subtree:true})를 부르면서 그 사이에 data-loading-* 속성을 쓰면
// 칸 수만큼 화면 전체 스타일을 다시 계산했다(11-05 실측: 라이브러리 검색 결과 수천 개에서 한 번에 12초 멈춤).
// 이제 (1) 속성을 먼저 다 쓰고 (2) 문서 전체 애니메이션을 한 번만 읽어 (3) 바뀐 칸에 속한 것만 멈추고 다시 켠다.
// 상태가 바뀌었거나 안이 바뀐 칸만 훑는 규칙은 그대로다.
function refresh(all = false) {
  let lights = 0;
  const work = [];
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
    work.push([node, entry, running]);
  }
  if (!work.length || typeof document.getAnimations !== 'function') return;
  for (const animation of document.getAnimations()) {
    const target = animation.effect?.target;
    if (!target) continue;
    for (const [node, entry, running] of work) {
      if (node !== target && !node.contains(target)) continue;
      // A completed source only has a bounded crossfade left. Let it finish
      // even under a paused grid so its promise can release the visual layers.
      const active = running || target.closest?.('[data-loading-phase="settling"]');
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
