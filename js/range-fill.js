/* ===== RANGE FILL =====
 * 슬라이더(input[type=range])의 채운 부분을 그리기 위한 CSS 변수(--ds-range-p)를 맞춘다.
 *
 * WebKit은 채운 부분(progress)을 따로 꾸밀 수 없어서, 트랙 그라데이션의 경계를
 * 이 변수로 옮긴다. 값은 읽기만 하고 바꾸지 않는다 — 기능 배선은 그대로다.
 * data-range-readout="fraction"이 붙은 슬라이더는 바로 뒤 <output>에 "3/10"을 쓴다.
 *
 * 코드가 value를 직접 넣는 경우(설정 불러오기 등)는 이벤트가 없으므로,
 * 화면에 새로 나타날 때(hidden 해제·노드 추가)와 클릭 뒤에 다시 맞춘다.
 */

function syncRange(input) {
  const min = input.min === '' ? 0 : Number(input.min);
  const max = input.max === '' ? 100 : Number(input.max);
  const value = Number(input.value);
  const p = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const fill = `${Math.min(100, Math.max(0, p))}%`;
  // 같은 값을 다시 넣어도 스타일을 다시 계산하므로(화면이 바뀔 때마다 모든 슬라이더를 훑음) 바뀔 때만 넣는다.
  if (input.style.getPropertyValue('--ds-range-p') !== fill) input.style.setProperty('--ds-range-p', fill);
  if (input.dataset.rangeReadout === 'fraction') {
    const out = input.nextElementSibling;
    if (out && out.tagName === 'OUTPUT') out.textContent = `${input.value}/${input.max || 100}`;
  }
}

function syncAll(root = document) {
  for (const input of root.querySelectorAll('input[type="range"]')) syncRange(input);
}

function initRangeFill(root = document) {
  const onEvent = (e) => { if (e.target?.matches?.('input[type="range"]')) syncRange(e.target); };
  root.addEventListener('input', onEvent, true);
  root.addEventListener('change', onEvent, true);
  // 화면이 자주 바뀌어도(캔버스 편집 등) 한 프레임에 한 번만 훑는다
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncAll(); });
  };
  root.addEventListener('click', schedule, true);
  // 화면 어디서든 노드가 바뀔 때마다(라이브러리 목록 스크롤로 그림 칸이 바뀌는 등) 문서 전체 슬라이더를 다시 찾지 않도록,
  // 슬라이더가 들어 있을 수 있는 변화(추가된 노드 안에 슬라이더, 또는 hidden이 바뀐 요소 안에 슬라이더)일 때만 다시 맞춘다.
  const touchesRange = records => records.some(r => r.type === 'attributes'
    ? r.target.nodeType === 1 && (r.target.matches?.('input[type="range"]') || r.target.querySelector?.('input[type="range"]'))
    : [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('input[type="range"]') || n.querySelector?.('input[type="range"]'))));
  new MutationObserver(records => { if (touchesRange(records)) schedule(); }).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'],
  });
  syncAll();
}

export { initRangeFill, syncRange };
