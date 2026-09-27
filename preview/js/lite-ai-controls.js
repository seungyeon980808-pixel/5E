// Small controls for the separate Lite AI dialog. Pro keeps its native controls.
export function initLiteAiControls() {
  const root = document.documentElement;
  const panels = new Map();
  const enhance = panel => {
    if (panels.has(panel)) return panels.get(panel);
    const bindings = [];
    for (const [selector, choices] of [
      ['[data-ai-background-policy]', [['preserve','유지'],['connected','제거']]],
      ['[data-ai-line-thickness]', [['0','가늘게'],['1','보통'],['2','굵게']]],
      ['[data-ai-separation-mode]', [['off','안 함'],['auto','자동']]],
    ]) {
      const select = panel.querySelector(selector);
      if (!select) continue;
      const group = document.createElement('div');
      group.className = 'lite-ai-segment-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', select.getAttribute('aria-label') || '변환 옵션');
      for (const [value, label] of choices) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label;
        button.dataset.value = value;
        button.addEventListener('click', () => {
          if (select.disabled || select.value === value) return;
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        group.append(button);
      }
      select.after(group);
      const sync = () => {
        for (const button of group.children) {
          const value = String(button.dataset.value === select.value);
          if (button.getAttribute('aria-pressed') !== value) button.setAttribute('aria-pressed', value);
          if (button.disabled !== select.disabled) button.disabled = select.disabled;
        }
      };
      select.addEventListener('change', sync);
      bindings.push(sync);
    }
    const sources = document.createElement('div');
    sources.className = 'lite-ai-source-actions';
    for (const [label, target] of [['라이브러리','[data-ai-reference-search]'],['파일','[data-ai-source-file]'],['붙여넣기','[data-ai-source-action="clipboard"]']]) {
      const button = document.createElement('button');
      button.type = 'button';button.textContent = label;
      button.addEventListener('click', () => panel.querySelector(target)?.click());
      sources.append(button);
    }
    panel.querySelector('.ai-original-pane .ai-pane-head')?.append(sources);
    panels.set(panel, bindings);
    return bindings;
  };
  const sync = () => {
    const panel = document.getElementById('ai-image-panel');
    if (!panel || root.dataset.mode !== 'lite') return;
    const bindings = enhance(panel);
    bindings.forEach(update => update());
    if (panel.hidden) return;
    const comparison = panel.querySelector('[data-ai-layout-mode="side-by-side"]');
    if (comparison?.getAttribute('aria-pressed') !== 'true') comparison?.click();
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, {subtree:true,childList:true,attributes:true,attributeFilter:['hidden','id','disabled']});
  window.addEventListener('5e:view-mode-change',sync);
  window.addEventListener('5e:ai-task-change',sync);
  sync();
}
