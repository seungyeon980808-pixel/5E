// 경과 시간 「00:00」(1.7.1 B13): 1초 setInterval로 글을 바꾸면 조판이 주 스레드를 붙잡는 동안 시계가 멈췄다가 한꺼번에 뛰었다.
// 진행 막대(11-13 밤)처럼 그래픽 처리 장치가 그리는 움직임으로 돌린다 — 자리마다 숫자 띠를 transform + steps()로 넘긴다.
// 화면 모양은 그대로(같은 글꼴·tabular-nums 숫자 네 자리와 「:」). 읽기 프로그램용 글(aria-label)은 주 스레드가 한가할 때 맞춘다.
const PLACES = [[600000, 10], [60000, 10], [10000, 6], [1000, 10]]; // 분 십의 자리 · 분 · 초 십의 자리 · 초 (한 칸 머무는 ms, 숫자 개수)

export const elapsedText = ms => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60) % 100).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function mountElapsedClock(el, started = performance.now()) {
  const doc = el.ownerDocument, now = () => performance.now() - started;
  const label = () => { const text = elapsedText(now()); el.setAttribute('aria-label', text); if ('dateTime' in el) el.dateTime = `PT${Math.floor(Math.max(0, now()) / 1000)}S`; return text; };
  if (typeof el.animate !== 'function') {
    const tick = () => { el.textContent = label(); };
    tick(); const id = setInterval(tick, 250);
    return { stop: () => clearInterval(id), text: () => elapsedText(now()) };
  }
  const box = doc.createElement('span'); box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'display:inline-flex;align-items:flex-end;line-height:1.2;white-space:nowrap';
  const anims = [];
  PLACES.forEach(([step, count], i) => {
    if (i === 2) { const colon = doc.createElement('span'); colon.textContent = ':'; box.append(colon); }
    const win = doc.createElement('span');
    win.style.cssText = 'display:inline-block;height:1.2em;overflow:hidden;vertical-align:bottom';
    const strip = doc.createElement('span');
    strip.style.cssText = 'display:block;will-change:transform';
    strip.innerHTML = Array.from({ length: count }, (_, d) => `<span style="display:block;height:1.2em">${d}</span>`).join('');
    win.append(strip); box.append(win);
    const a = strip.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }], { duration: step * count, iterations: Infinity, easing: `steps(${count}, end)` });
    // currentTime만 정하면 애니메이션이 「준비 중」으로 남아, 바로 뒤 주 스레드가 막히면 막힌 시간만큼 시계가 늦게 시작한다(검사로 확인).
    // 시작 시각(startTime)을 문서 시간축에 직접 박아 준비를 기다리지 않게 한다.
    const tl = doc.timeline?.currentTime; a.startTime = tl == null ? started : tl - Math.max(0, now()); anims.push(a);
  });
  el.replaceChildren(box);
  label(); const id = setInterval(label, 1000);
  return { stop: () => { clearInterval(id); anims.forEach(a => a.cancel()); }, text: () => elapsedText(now()), animations: anims };
}
