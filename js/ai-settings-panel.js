import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';

/** Compact choices delegate to the existing request and output controllers. */
export function initAISettingsPanel(panel, { signal } = {}) {
  const root = panel.querySelector('[data-ai-compact-settings]');
  if (!root) return { sync() {}, dispose() {} };
  let popup = null, helpButton = null, disposeEscape = null;
  const closeHelp = () => {
    disposeEscape?.(); disposeEscape = null;
    popup?.remove(); popup = null;
    helpButton?.setAttribute('aria-expanded', 'false');
    helpButton?.removeAttribute('aria-describedby'); helpButton = null;
  };
  const selectorFor = key => ({model:'[data-ai-model]', labels:'[data-ai-label-result]', verification:'[data-ai-label-verification]',
    background:'[data-ai-background-policy]', objects:'[data-ai-separation-mode]',
    arrows:'[data-ai-mark-arrows]', guides:'[data-ai-mark-leaders]', kind:'[data-ai-image-kind]'})[key];
  const controlFor = key => panel.querySelector(selectorFor(key));
  const valueFor = (button, control) => {
    if (!button.dataset.aiModelChoice) return button.dataset.aiSettingValue;
    const target = button.dataset.aiModelChoice === 'sol' ? 'gpt-6.1-sol' : 'gpt-6-luna';
    return [...control.options].find(option => option.value === target && !option.disabled)?.value ?? null;
  };
  const sync = () => {
    for (const group of root.querySelectorAll('[data-ai-setting-key]')) {
      const control = controlFor(group.dataset.aiSettingKey);
      if (!control) continue;
      for (const button of group.querySelectorAll('[data-ai-setting-value], [data-ai-model-choice]')) {
        const value = valueFor(button, control);
        const selected = value !== null && value === control.value;
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-on', selected);
        const disabled = control.disabled || value === null || panel.dataset.aiSharingMode === 'view'
          || (group.dataset.aiSettingKey === 'verification' && controlFor('labels')?.value !== 'restore-editable');
        if (button.disabled !== disabled) button.disabled = disabled;
        if (button.dataset.aiModelChoice) button.title = value === null ? '연결 서버의 모델 목록에 이 모델이 없습니다.' : '';
      }
    }
    const note = root.querySelector('[data-ai-settings-summary]');
    const summary = controlFor('labels')?.value === 'restore-editable'
      ? `Luna medium 라벨 복원 · ${controlFor('verification')?.value === 'draft-first' ? '편집 초안 먼저' : '자동 검수'}` : '라벨 없이 그림만 변환';
    if (note && note.textContent !== summary) note.textContent = summary;
  };
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-setting-value], [data-ai-model-choice]');
    if (button && !button.disabled) {
      const group = button.closest('[data-ai-setting-key]');
      const control = controlFor(group.dataset.aiSettingKey);
      const value = control && valueFor(button, control);
      if (!control || control.disabled || value === null || value === control.value) return;
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      return;
    }
    const help = event.target.closest('[data-ai-setting-help]');
    if (!help) return;
    const same = helpButton === help; closeHelp();
    if (same) return;
    helpButton = help; help.setAttribute('aria-expanded','true');
    popup = document.createElement('div'); popup.className = 'ai-setting-help-pop';
    popup.id = `ai-setting-help-${panel.id}`; popup.setAttribute('role','dialog');
    popup.setAttribute('aria-label', `${help.dataset.aiHelpTitle} 도움말`);
    popup.setAttribute('aria-modal', 'false');
    help.setAttribute('aria-describedby', popup.id);
    const title = document.createElement('strong'); title.textContent = help.dataset.aiHelpTitle;
    const text = document.createElement('p'); text.textContent = help.dataset.aiSettingHelp;
    popup.append(title, text); document.body.append(popup);
    disposeEscape = registerEscapeLayer(popup, closeHelp);
    const bounds = help.getBoundingClientRect();
    const width = Math.min(270, window.innerWidth - 16); popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8))}px`;
    popup.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - popup.offsetHeight - 8))}px`;
  }, { signal });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-ai-setting-help]') && !popup?.contains(event.target)) closeHelp();
  }, { signal });
  window.addEventListener('resize', closeHelp, { signal });
  window.addEventListener('scroll', closeHelp, { signal, capture: true });
  panel.addEventListener('change', sync, { signal });
  const observer = new MutationObserver(() => { sync(); if (panel.hidden) closeHelp(); });
  observer.observe(panel, { subtree:true, childList:true, attributes:true,
    attributeFilter:['disabled','hidden','data-ai-busy','data-ai-sharing-mode'] });
  signal?.addEventListener('abort', () => { observer.disconnect(); closeHelp(); }, { once:true });
  sync();
  return { sync, dispose() { observer.disconnect(); closeHelp(); } };
}

/** Known exam provenance wins over file names; uploaded images use the style workflow. */
export function sourceImageKind(source = {}) {
  const metadata = source.source || {};
  if (source.imageKind === 'exam' || metadata.imageKind === 'exam'
    || source.sourceKind === 'exam' || source.sourceKind === 'exam-library'
    || metadata.sourceKind === 'exam' || metadata.sourceKind === 'exam-library'
    || metadata.libraryKind === 'exam') return 'exam';
  return 'general';
}
