// Shared appearance follows existing button semantics; no click handlers are replaced.
const CORE_IDS = new Set(['exam-library-open', 'ai-image-install-open', 'graph-tool-open', 'exam-send']);
const COMPACT = '.gm-step-btns, .stepper-btns, .color-swatches, .settings-gray-presets';
const TILES = '.ai-task-tab-select, .page-tab, .object-tile, .personal-object-tile, .unilib-result-card, .exam-figure';

export function initButtonDesign(doc = document) {
  if (doc.documentElement.dataset.buttonDesignReady === 'true') return;
  doc.documentElement.dataset.buttonDesignReady = 'true';
  const decorate = root => {
    const selector = 'button, a.ai-action-motion';
    const buttons = root.matches?.(selector) ? [root] : [];
    buttons.push(...root.querySelectorAll?.(selector) || []);
    for (const button of buttons) {
      if (button.classList.contains('ui-button')) continue;
      button.classList.add('ui-button');
      if (button.closest(COMPACT) || button.matches('[data-step], .gm-step-btn, .step-btn, .ai-setting-help, .ai-zoom-help')) button.dataset.uiKind = 'compact';
      else if (button.matches(TILES) || button.querySelector('img')) button.dataset.uiKind = 'tile';
      else if (button.matches('[role^="menuitem"], .file-menu-item, .tool-section-header')) button.dataset.uiKind = 'menu';
      if (CORE_IDS.has(button.id)) button.classList.add('ui-core-action');
    }
  };
  decorate(doc.body);
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) decorate(node);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const graph = doc.getElementById('graph-tool-open');
  const hub = doc.querySelector('.image-workflow-hub');
  const ai = doc.getElementById('ai-image-install-open');
  if (graph && hub && ai) {
    graph.classList.add('object-search-trigger');
    graph.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v14h14M6 13l3-5 3 3 4-7"/></svg><span>좌표/함수 생성</span>';
    ai.after(graph);
  }
  // Only the hovered core action revolves; idle and hidden controls do no loop work.
  doc.addEventListener('visibilitychange', () => {
    doc.documentElement.dataset.uiMotionPaused = String(doc.hidden);
  });
}
