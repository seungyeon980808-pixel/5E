import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';

/** Compact choices delegate to the existing request and output controllers. */
export function initAISettingsPanel(panel, { signal, canChoose = () => true } = {}) {
  const roots = [...panel.querySelectorAll('[data-ai-compact-settings], [data-ai-legacy-result-settings]')];
  const root = roots.find(node => node.hasAttribute('data-ai-compact-settings'));
  if (!root) return { sync() {}, dispose() {} };
  let popup = null, helpButton = null, disposeEscape = null;
  const closeHelp = () => {
    disposeEscape?.(); disposeEscape = null;
    popup?.remove(); popup = null;
    helpButton?.setAttribute('aria-expanded', 'false');
    helpButton?.removeAttribute('aria-describedby'); helpButton = null;
  };
  // 11-11: 객체 분리를 켜면 배경 제거를 자동으로 켜고 그 쌍을 잠근다. 끄면 이전 값으로 돌려놓는다.
  let backgroundBeforeObjects = null;
  const syncBackgroundForObjects = objectsValue => {
    const background = controlFor('background');
    if (!background) return;
    if (objectsValue !== 'off') {
      if (backgroundBeforeObjects === null) backgroundBeforeObjects = background.value;
      if (background.value !== 'connected') { background.value = 'connected'; background.dispatchEvent(new Event('change', { bubbles: true })); }
    } else if (backgroundBeforeObjects !== null) {
      const restore = backgroundBeforeObjects;
      backgroundBeforeObjects = null;
      if (background.value !== restore) { background.value = restore; background.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  };
  const objectsOn = () => ['auto', 'grid', 'manual'].includes(controlFor('objects')?.value);
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
    for (const group of roots.flatMap(node => [...node.querySelectorAll('[data-ai-setting-key]')])) {
      const control = controlFor(group.dataset.aiSettingKey);
      if (!control) continue;
      for (const button of group.querySelectorAll('[data-ai-setting-value], [data-ai-model-choice]')) {
        const value = valueFor(button, control);
        const selected = value !== null && value === control.value;
        if (button.hasAttribute('data-ai-legacy-pro-choice')) {
          const nextHidden = document.documentElement.dataset.mode === 'lite';
          if (button.hidden !== nextHidden) button.hidden = nextHidden;
        }
        button.setAttribute('aria-pressed', String(selected));
        button.classList.toggle('is-on', selected);
        const forcedByObjects = group.dataset.aiSettingKey === 'background' && objectsOn();
        group.closest?.('.ai-setting-row')?.classList?.toggle('is-forced', forcedByObjects);
        const disabled = control.disabled || value === null || !canChoose(group.dataset.aiSettingKey, value) || panel.dataset.aiSharingMode === 'view'
          || forcedByObjects
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
  for (const settingsRoot of roots) settingsRoot.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-setting-value], [data-ai-model-choice]');
    if (button && !button.disabled) {
      const group = button.closest('[data-ai-setting-key]');
      const control = controlFor(group.dataset.aiSettingKey);
      const value = control && valueFor(button, control);
      if (!control || control.disabled || value === null || !canChoose(group.dataset.aiSettingKey, value)
        || ![...control.options].some(option => option.value === value && !option.disabled && !option.hidden)) return;
      // Repeating a legacy choice retries a failed real transform; source choices
      // keep their original no-op behavior. This never invokes generation.
      if (value === control.value && !settingsRoot.hasAttribute('data-ai-legacy-result-settings')) return;
      // 11-11: 객체 분리를 켜기 직전의 배경 값을 먼저 기억한다(켜는 순간 앱이 배경을 바꾸므로).
      if (group.dataset.aiSettingKey === 'objects' && value !== 'off' && backgroundBeforeObjects === null) backgroundBeforeObjects = controlFor('background')?.value ?? null;
      control.value = value;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      if (group.dataset.aiSettingKey === 'objects') syncBackgroundForObjects(value);
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

// 11-09 사용자 결정: 출처를 아는 그림은 자동으로 정한다. 기출(5E_hwp 시험지 그림·라이브러리 기출·학평)은 'exam',
// 라이브러리 교과서는 'general'(화면 이름 「교과서」). 모르는 외부 그림(파일·붙여넣기·캡처·모바일)은 ''로 두고
// 사람이 그 자리에서 고른다(「출처를 골라 주세요」).
const EXAM_SOURCE_KINDS = new Set(['exam', 'exam-library', 'exam-figure', 'hakpyeong', 'kice', 'past-exams']);
const TEXTBOOK_SOURCE_KINDS = new Set(['textbook', 'textbooks']);
const LIBRARY_SOURCE_KINDS = new Set(['unified-library', 'pdf-library', 'pdf-crop']);
const EXAM_TITLE = /기출|수능|모의평가|평가원|학력평가|학평|전국연합|대학수학능력/;
const TEXTBOOK_TITLE = /교과서/;
export function sourceImageKind(source = {}) {
  const metadata = source.source || {};
  if (source.imageKind === 'exam' || metadata.imageKind === 'exam') return 'exam';
  if (source.imageKind === 'general' || metadata.imageKind === 'general') return 'general';
  const kinds = [source.sourceKind, metadata.sourceKind, metadata.libraryKind, metadata.packKind, metadata.category].filter(Boolean).map(String);
  if (kinds.some(kind => EXAM_SOURCE_KINDS.has(kind))) return 'exam';
  if (kinds.some(kind => TEXTBOOK_SOURCE_KINDS.has(kind))) return 'general';
  // 라이브러리 PDF는 문서 이름·위치로 안다(예: 교과서_중2.pdf, 학력평가/…, 2024학년도 6월 모의평가).
  if (LIBRARY_SOURCE_KINDS.has(String(source.sourceKind || ''))) {
    const title = [metadata.documentTitle, metadata.displayName, metadata.locator, metadata.title, metadata.fileName, source.name].filter(Boolean).join(' ');
    if (EXAM_TITLE.test(title)) return 'exam';
    if (TEXTBOOK_TITLE.test(title)) return 'general';
  }
  return '';
}
