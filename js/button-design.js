// Effects belong to workflow entries, never to arbitrary HTML buttons or overlays.
const CORE_IDS = new Set(['exam-library-open', 'ai-image-install-open', 'graph-tool-open', 'exam-send']);
const WORKFLOW_SURFACES = {
  'exam-library-open':'.unified-library-overlay',
  'ai-image-install-open':'#ai-image-panel',
  'graph-tool-open':'#graph-modal-overlay',
  'exam-send':'#exam-document-menu, #rhwp-exam-workspace',
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
      // Hwp's menu owns aria-expanded; its document view has a separate lifecycle.
      if (id !== 'exam-send' && button.getAttribute('aria-expanded') !== String(open)) button.setAttribute('aria-expanded', String(open));
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
    graph.innerHTML = '<svg class="search-trigger-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v14h14M6 13l3-5 3 3 4-7"/></svg><span>좌표/함수 생성</span>';
    ai.before(graph);
  }
  if (hub && !doc.getElementById('exam-pool-open')) {
    const examPool = doc.createElement('button');
    examPool.id = 'exam-pool-open'; examPool.type = 'button';
    examPool.className = 'object-search-trigger'; examPool.disabled = true;
    examPool.textContent = '5E_ExamPool'; examPool.title = '5E_ExamPool · 준비 중';
    hub.append(examPool);
  }
  const clickAnimations = new WeakMap();
  doc.addEventListener('click', event => {
    const button = event.target.closest?.('.ui-core-action');
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
