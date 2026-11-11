// Effects belong to workflow entries, never to arbitrary HTML buttons or overlays.
const CORE_IDS = new Set(['exam-library-open', 'ai-image-install-open', 'graph-tool-open']);
const WORKFLOW_SURFACES = {
  'exam-library-open':'.unified-library-overlay',
  'ai-image-install-open':'#ai-image-panel',
  'graph-tool-open':'#graph-modal-overlay',
};

export function initButtonDesign(doc = document) {
  if (doc.documentElement.dataset.buttonDesignReady === 'true') return;
  doc.documentElement.dataset.buttonDesignReady = 'true';
  const decorate = root => {
    const selector = [...CORE_IDS].map(id => `#${id}`).join(',');
    const buttons = root.matches?.(selector) ? [root] : [];
    buttons.push(...root.querySelectorAll?.(selector) || []);
    for (const button of buttons) {
      button.classList.add('ui-core-action');
    }
  };
  const syncOpenStates = () => {
    for (const [id, selector] of Object.entries(WORKFLOW_SURFACES)) {
      const button = doc.getElementById(id);
      if (!button) continue;
      // These known surfaces use only IDs and one class. Resolve them directly
      // instead of rescanning all retained workspaces for every DOM mutation.
      const surfaces = selector.split(',').flatMap(value => {
        const token = value.trim();
        return token.startsWith('#') ? [doc.getElementById(token.slice(1))].filter(Boolean)
          : [...doc.getElementsByClassName(token.slice(1))];
      });
      const open = surfaces.some(surface => !surface.hidden);
      if (button.dataset.workflowOpen !== String(open)) button.dataset.workflowOpen = String(open);
      // 「한글에 넣기」는 메뉴가 없는 바로 실행 단추라 aria-expanded를 달지 않는다(10-20 입구 통일).
      // 「그래프」는 11-07부터 세 갈래 메뉴의 열림을 aria-expanded로 알린다(js/graph-entry-menu.js).
      if (id !== 'exam-send' && id !== 'graph-tool-open' && button.getAttribute('aria-expanded') !== String(open)) button.setAttribute('aria-expanded', String(open));
    }
  };
  decorate(doc.body);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) decorate(node);
    syncOpenStates();
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes:true, attributeFilter:['hidden'] });
  syncOpenStates();
  const graph = doc.getElementById('graph-tool-open');
  const hub = doc.querySelector('.image-workflow-hub');
  const ai = doc.getElementById('ai-image-install-open');
  if (graph && hub && ai) {
    graph.classList.remove('advanced-tool-btn');
    graph.classList.add('object-search-trigger');
    // 10-24 시안 20: 좌표축 + 곡선 아이콘. 11-07(시안 graph-hub-1107 G1): 이름 「그래프」 — 올리거나 누르면 세 갈래.
    graph.innerHTML = '<svg class="search-trigger-ico ds-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 4v16h16"/><path d="M6 16c2.3-6.2 4.5-8 6.4-5.3s3.1 .9 4.4-3.2"/><path d="M19.5 2.5v4M17.5 4.5h4"/></svg><span class="search-trigger-label">AI 그래프</span>';
    // 11-11: 이름 「AI 그래프」(AI 이미지와 짝), 아이콘에 같은 반짝임 표시.
    graph.title = 'AI 그래프 · 직접 만들기 · 사진에서 복원 · AI와 대화로 만들기'; graph.setAttribute('aria-label', 'AI 그래프');
    ai.before(graph);
  }
  // 11-11: ⇧⌘L(윈도우 Ctrl+Shift+L) = 라이브러리. AI 창이 열려 있으면 AI 창이 처리한다(라이브러리에서 불러오기).
  if (hub && !doc.documentElement.dataset.libraryShortcut) {
    doc.documentElement.dataset.libraryShortcut = 'on';
    doc.addEventListener('keydown', event => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return;
      if (event.code !== 'KeyL' && event.key?.toLowerCase() !== 'l') return;
      const ai = doc.getElementById('ai-image-panel');
      if (ai && !ai.hidden) return;
      const library = doc.getElementById('exam-library-open');
      if (!library || library.disabled || library.offsetParent === null) return;
      event.preventDefault(); library.click();
    });
    const library = doc.getElementById('exam-library-open');
    if (library) library.title = `라이브러리 (${/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⇧⌘L' : 'Ctrl+Shift+L'})`;
  }
  if (hub && !doc.getElementById('exam-pool-open')) {
    const examPool = doc.createElement('button');
    examPool.id = 'exam-pool-open'; examPool.type = 'button';
    examPool.className = 'object-search-trigger'; examPool.disabled = true;
    examPool.textContent = '5E_ExamPool'; examPool.title = '5E_exam · 준비 중';
    hub.append(examPool);
  }
  const clickAnimations = new WeakMap();
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('.ui-core-action');
    // 그라파이트(Pro)에서는 누를 때 커지는 장식 효과를 쓰지 않는다.
    if (doc.documentElement.dataset.mode !== 'lite') return;
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true'
      || doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clickAnimations.get(button)?.cancel();
    clickAnimations.set(button, button.animate([
      { scale:'1' }, { scale:'1.03', offset:.4 }, { scale:'1' },
    ], { duration:200, easing:'cubic-bezier(.2,.8,.2,1)' }));
  }, true);
  // Only the hovered core action revolves; idle and hidden controls do no loop work.
  doc.addEventListener('visibilitychange', () => {
    doc.documentElement.dataset.uiMotionPaused = String(doc.hidden);
  });
}
