// 그림 화면(body>.app) 잠금은 「위를 덮은 칸이 지금 실제로 보이는지」만으로 정한다.
// 예전에는 출제 칸·조판 창·전환 줄이 저마다 잠금을 켜고 끄며 서로의 상태를 짐작해서, 전환 중 ✕(H1)나
// 「연결된 문서 그림 편집」 실패(H2) 뒤 아무 칸도 없는데 그림 화면이 잠긴 채 남았다(새로고침만 가능).
// 칸이 열리고 닫힐 때(hidden 속성)와 조판 창의 모달 상태(data-modal)가 바뀔 때마다 저절로 다시 계산한다.
const COVERING = ['exampool-sheet-workspace', 'exampool-workspace'];
const HWP = 'rhwp-exam-workspace';

// 조판 창은 원본 그림을 고치는 동안(editing)에는 떠 있어도 그림 화면을 잠그지 않으므로, 조판 창이 정한 data-modal을 따른다.
function hwpModal(doc) {
  const panel = doc.getElementById(HWP);
  return !!panel && !panel.hidden && panel.dataset.modal !== 'false';
}

export function coveringApp(doc = document) {
  if (COVERING.some(id => doc.getElementById(id)?.hidden === false)) return true;
  return hwpModal(doc);
}

export function syncAppLock(doc = document) {
  const app = doc.querySelector('body>.app');
  const footer = doc.querySelector('body>.app-footer');
  const locked = coveringApp(doc);
  if (app && app.inert !== locked) app.inert = locked;
  // 아래 막대는 조판 창만 잠근다(출제 칸은 아래 막대까지 덮고, 예전 문항 칸은 아래 막대를 남긴다).
  const footerLocked = hwpModal(doc);
  if (footer && footer.inert !== footerLocked) footer.inert = footerLocked;
  return locked;
}

let installed = false;
export function installAppLock(doc = document) {
  if (installed) return;
  installed = true;
  const watched = new Set([...COVERING, HWP]);
  new MutationObserver(records => {
    if (records.some(record => watched.has(record.target.id))) syncAppLock(doc);
  }).observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'data-modal'] });
  syncAppLock(doc);
}
