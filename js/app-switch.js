// 5E 세 프로그램 전환(시안 41, 10-20 승인): 맨 위 줄 로고 「5E_단어」 옆에 나머지 두 프로그램 이름(exam · image · hwp)을 두고,
// 누르면 지금 프로그램을 닫고 그 프로그램을 연다. 지금은 세 프로그램이 한 페이지 안에서 열리므로(그림 화면 위 덧창)
// 각 프로그램의 원래 열기·닫기 단추를 그대로 눌러 전환한다 — 저장·확인 창 같은 원래 동작을 거치게.
export const APPS = [
  ['exam', '출제 — 문항 만들기'],
  ['image', '그림 — 과학 그림·그래프'],
  ['hwp', '조판 — 시험지 인쇄 전 마무리'],
];

export function appSwitchHtml(current) {
  return APPS.filter(([key]) => key !== current)
    .map(([key, title]) => `<button type="button" class="app-switch-btn" data-app-switch="${key}" title="${title}">${key}</button>`).join('');
}

function currentApp(doc = document) {
  if (doc.getElementById('rhwp-exam-workspace')?.hidden === false) return 'hwp';
  if (doc.getElementById('exampool-sheet-workspace')?.hidden === false) return 'exam';
  return 'image';
}

// 그림 화면(맨 바깥 문서)에서 한 번만 연결한다. 출제(ExamPool) 칸은 iframe이라 postMessage로 부탁한다.
export function initAppSwitch(doc = document) {
  if (doc.documentElement.dataset.appSwitchReady) return;
  doc.documentElement.dataset.appSwitchReady = 'on';
  const go = async target => {
    const from = currentApp(doc);
    if (!target || target === from) return;
    if (from === 'hwp') doc.querySelector('#rhwp-exam-workspace [data-exam-action="close"]')?.click();
    if (from === 'exam') doc.defaultView.dispatchEvent(new CustomEvent('5e:exampool-close'));
    // 닫히기를 기다린다(조판은 저장을 마친 뒤 닫힘). 2초 안에 안 닫히면(저장 확인 창 등) 그대로 둔다.
    for (let waited = 0; from !== 'image' && currentApp(doc) === from && waited < 2000; waited += 50) await new Promise(resolve => setTimeout(resolve, 50));
    if (from !== 'image' && currentApp(doc) === from) return;
    if (target === 'exam') doc.getElementById('exam-pool-open')?.click();
    if (target === 'hwp') doc.querySelector('[data-exam-document-open]')?.click();
  };
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-app-switch]');
    if (!button) return;
    event.preventDefault();
    void go(button.dataset.appSwitch);
  });
  doc.defaultView.addEventListener('message', event => {
    if (event.origin !== doc.defaultView.location.origin || event.data?.channel !== '5e-app-switch') return;
    void go(event.data.app);
  });
}
