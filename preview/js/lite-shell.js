export function initLiteShell(state) {
  const root = document.documentElement;
  const app = document.querySelector('.app');
  const center = document.querySelector('.panel-center');
  const aiPanel = document.getElementById('ai-image-panel');
  const header = document.querySelector('.app-shell-header');
  const inspector = document.getElementById('inspector');
  if (!app || !center || !aiPanel || !header || !inspector || document.getElementById('lite-workspace')) return;

  const icon = (path) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const workspace = document.createElement('div');
  workspace.id = 'lite-workspace';

  const reference = document.createElement('aside');
  reference.id = 'lite-reference';
  reference.setAttribute('aria-label', '원본 이미지');
  reference.innerHTML = `
    <header class="lite-rail-head"><div><span class="lite-eyebrow">SOURCE</span><strong>원본</strong></div>
    </header>
    <div class="lite-reference-body">
      <div class="lite-reference-preview" data-lite-reference-preview>
        ${icon('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.2" cy="8" r="1.2"/><path d="m4.5 14 3.5-3.5 2.4 2.3 1.8-1.7 3.3 3.1"/>')}
        <strong>원본을 추가하세요</strong><span>파일, 붙여넣기 또는 자료 라이브러리를 사용할 수 있습니다.</span>
      </div>
      <div class="lite-source-actions">
        <button type="button" data-lite-source="file">${icon('<path d="M10 14V3m-3 3 3-3 3 3"/><path d="M4 11v5h12v-5"/>')}<span>파일</span></button>
        <button type="button" data-lite-source="clipboard">${icon('<rect x="5" y="4" width="10" height="13" rx="1.5"/><path d="M8 4V2.8h4V4M7.5 8h5M7.5 11h5"/>')}<span>붙여넣기</span></button>
        <button type="button" data-lite-source="library">${icon('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4"/>')}<span>자료</span></button>
      </div>
      <button type="button" id="lite-ai-open" class="lite-primary-button">AI 이미지 변환</button>
      <p class="lite-source-note">원본은 결과를 편집해도 그대로 보존됩니다.</p>
    </div>`;

  const context = document.createElement('aside');
  context.id = 'lite-context';
  context.setAttribute('aria-label', '현재 작업 안내와 속성');
  context.innerHTML = `
    <header class="lite-rail-head"><div><span class="lite-eyebrow">CONTEXT</span><strong>현재 작업</strong></div></header>
    <div class="lite-context-copy" data-lite-context-copy><strong>그림을 선택하세요</strong><p>원본을 변환하거나 아래 도구로 편집을 시작할 수 있습니다.</p></div>
    <div class="lite-inspector-slot"></div>`;

  const dock = document.createElement('div');
  dock.id = 'lite-dock';
  dock.setAttribute('aria-label', '편집 도구');
  const history = document.createElement('div');
  history.className = 'lite-dock-history';
  const tools = document.createElement('div');
  tools.className = 'lite-dock-tools';
  const graph = document.createElement('button');
  graph.id = 'lite-graph-open';
  graph.type = 'button';
  graph.className = 'lite-action-button';
  graph.innerHTML = `${icon('<path d="M4 16V4M4 10h12"/><path d="M6 14c2-5 4-7 7-8 1.2-.4 2.2-.7 3-.7"/>')}<span>좌표·함수</span>`;
  graph.addEventListener('click', () => document.getElementById('graph-tool-open')?.click());
  const save = document.createElement('button');
  save.id = 'lite-save';
  save.type = 'button';
  save.className = 'lite-primary-button';
  save.setAttribute('aria-label', '저장');
  save.innerHTML = `${icon('<path d="M4 3.5h10.5l1.5 1.6v11.4H4z"/><path d="M7 3.5v4h6v-4M7 13h6"/>')}<span>저장</span>`;
  save.addEventListener('click', () => document.getElementById('image-export')?.click());
  dock.append(tools, history, save);

  const workbenchTabs = document.createElement('div');
  workbenchTabs.className = 'lite-workbench-tabs';
  workbenchTabs.innerHTML = '<strong>작업대</strong>';
  aiPanel.querySelector('.ai-compare-heading')?.prepend(workbenchTabs);
  const canvasHeading = document.createElement('header');
  canvasHeading.className = 'lite-canvas-heading';
  canvasHeading.textContent = '수정본';
  center.prepend(canvasHeading);
  const sourceEmptyActions = document.createElement('div');
  sourceEmptyActions.className = 'lite-ai-empty-actions';
  sourceEmptyActions.innerHTML = `<strong>원본 이미지를 추가하세요</strong><div><button type="button" data-lite-ai-source="library">라이브러리</button><button type="button" data-lite-ai-source="file">파일</button><button type="button" data-lite-ai-source="clipboard">붙여넣기</button></div>`;
  aiPanel.querySelector('.ai-original-pane .ai-reference-section')?.append(sourceEmptyActions);
  const sourceHeaderActions = document.createElement('div');
  sourceHeaderActions.className = 'lite-source-header-actions';
  sourceHeaderActions.hidden = true;
  sourceHeaderActions.setAttribute('aria-label', '레퍼런스 이미지 추가');
  sourceHeaderActions.innerHTML = '<button type="button" data-lite-reference-source="library">라이브러리</button><button type="button" data-lite-reference-source="file">파일</button><button type="button" data-lite-reference-source="clipboard">붙여넣기</button>';
  aiPanel.querySelector('.ai-original-pane .ai-pane-head-controls')?.append(sourceHeaderActions);
  const referenceHeading = aiPanel.querySelector('.ai-original-pane .ai-pane-metadata > strong');
  const referenceHeadingText = referenceHeading?.textContent || '원본';

  const paneToggle = (name, label, path) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lite-pane-toggle';
    button.dataset.litePaneToggle = name;
    button.setAttribute('aria-label', `${label} 접기`);
    button.setAttribute('aria-expanded', 'true');
    button.innerHTML = icon(path);
    return button;
  };
  const workbenchToggle = paneToggle('workbench', '작업대', '<path d="M7 4H4v12h3M13 4h3v12h-3M10 3v14"/>');
  const referenceToggle = paneToggle('reference', '레퍼런스 이미지', '<path d="m12 5-5 5 5 5"/>');
  const inspectorToggle = paneToggle('inspector', '인스펙터', '<path d="m8 5 5 5-5 5"/>');
  aiPanel.querySelector('.ai-rail-heading')?.append(workbenchToggle);
  aiPanel.querySelector('.ai-original-pane .ai-pane-head-controls')?.append(referenceToggle);

  const inspectorModeTabs = document.createElement('nav');
  inspectorModeTabs.className = 'lite-inspector-mode-tabs';
  inspectorModeTabs.setAttribute('aria-label', '인스펙터 모드');
  inspectorModeTabs.innerHTML = '<button type="button" class="is-on" data-lite-inspector-tab="ai" aria-pressed="true">AI 변환</button><button type="button" data-lite-inspector-tab="edit" aria-pressed="false">간단 편집</button>';
  const editInspectorSlot = document.createElement('div');
  editInspectorSlot.className = 'lite-edit-inspector-slot';
  editInspectorSlot.hidden = true;
  const conversation = aiPanel.querySelector('.ai-conversation');
  conversation?.prepend(inspectorModeTabs);
  conversation?.querySelector('.ai-side-tabs')?.append(inspectorToggle);
  conversation?.append(editInspectorSlot);

  const segmentBindings = [];
  const addSegmentProxy = (panel, bindings, selector, choices) => {
    const select = panel.querySelector(selector);
    const row = select?.closest('.ai-output-processing-row');
    if (!select || !row) return;
    const group = document.createElement('div');
    group.className = 'lite-ai-segment-group';
    group.hidden = true;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', select.getAttribute('aria-label') || '변환 옵션');
    for (const [value, label] of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.liteAiOption = value;
      button.textContent = label;
      button.addEventListener('click', () => {
        if (select.disabled || select.value === value) return;
        select.value = value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      group.append(button);
    }
    row.append(group);
    const sync = () => {
      for (const button of group.querySelectorAll('[data-lite-ai-option]')) {
        const active = button.dataset.liteAiOption === select.value;
        button.classList.toggle('is-on', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = select.disabled;
      }
    };
    select.addEventListener('change', sync);
    bindings.push({ group, sync });
    sync();
  };
  addSegmentProxy(aiPanel, segmentBindings, '[data-ai-background-policy]', [['preserve', '유지'], ['connected', '제거']]);
  addSegmentProxy(aiPanel, segmentBindings, '[data-ai-separation-mode]', [['off', '안 함'], ['auto', '자동']]);
  addSegmentProxy(aiPanel, segmentBindings, '[data-ai-line-thickness]', [['0', '가늘게'], ['1', '보통'], ['2', '굵게']]);

  const resultEditorSlot = document.createElement('div');
  resultEditorSlot.className = 'lite-result-editor-slot';
  resultEditorSlot.hidden = true;
  aiPanel.querySelector('.ai-result-pane .ai-pane-head')?.after(resultEditorSlot);

  const restoreButtons = [];
  for (const [name, label] of [['workbench', '작업대'], ['reference', '레퍼런스 이미지'], ['inspector', '인스펙터']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lite-pane-restore';
    button.dataset.litePaneRestore = name;
    button.setAttribute('aria-label', `${label} 열기`);
    button.title = `${label} 열기`;
    button.innerHTML = name === 'inspector' ? icon('<path d="m8 5 5 5-5 5"/>') : icon('<path d="m12 5-5 5 5 5"/>');
    const destination = name === 'reference'
      ? aiPanel.querySelector('.ai-comparison-grid')
      : aiPanel.querySelector('.ai-workspace');
    destination?.append(button);
    restoreButtons.push(button);
  }

  const panelEnhancements = new Map();
  panelEnhancements.set(aiPanel, {
    panel: aiPanel,
    sourceEmptyActions,
    sourceHeaderActions,
    referenceHeading,
    referenceHeadingText,
    inspectorModeTabs,
    editInspectorSlot,
    resultEditorSlot,
    segmentBindings,
    restoreButtons,
    wired: true,
  });

  const moves = [];
  const move = (element, destination, before = null) => {
    if (!element) return;
    const marker = document.createComment(`lite-origin:${element.id || element.className}`);
    element.before(marker);
    moves.push({ element, marker });
    destination.insertBefore(element, before);
  };
  app.append(workspace);
  workspace.append(reference, context);
  const dockToolBindings = [];

  const mountDockTools = () => {
    if (dockToolBindings.length) return;
    document.querySelectorAll('#tool-list .tool-btn[data-lite-label]').forEach((original) => {
      const proxy = original.cloneNode(true);
      proxy.removeAttribute('id');
      const sync = () => {
        proxy.className = original.className;
        proxy.disabled = original.disabled;
        const pressed = original.getAttribute('aria-pressed');
        if (pressed === null) proxy.removeAttribute('aria-pressed');
        else proxy.setAttribute('aria-pressed', pressed);
      };
      proxy.addEventListener('click', () => {
        original.click();
        queueMicrotask(sync);
      });
      const observer = new MutationObserver(sync);
      observer.observe(original, { attributes: true, attributeFilter: ['class', 'disabled', 'aria-pressed'] });
      dockToolBindings.push({ proxy, observer });
      tools.append(proxy);
      sync();
    });
    tools.append(graph);
  };

  const unmountDockTools = () => {
    dockToolBindings.splice(0).forEach(({ proxy, observer }) => {
      observer.disconnect();
      proxy.remove();
    });
  };

  const enterLite = () => {
    if (moves.length) return;
    if (referenceHeading) referenceHeading.textContent = '레퍼런스';
    sourceHeaderActions.hidden = false;
    segmentBindings.forEach(({ group, sync }) => { group.hidden = false; sync(); });
    const sourceMenuShell = aiPanel.querySelector('.ai-source-menu-shell');
    if (sourceMenuShell) sourceMenuShell.hidden = true;
    move(header, app, workspace);
    header.querySelector('.toolbar-canvas')?.append(dock);
    move(aiPanel.querySelector('.ai-source-menu-shell'), aiPanel.querySelector('.ai-original-pane .ai-pane-head-controls'));
    move(aiPanel.querySelector('.ai-annotation-toolbar'), aiPanel.querySelector('.ai-result-pane .ai-pane-head-controls'));
    move(center, resultEditorSlot);
    move(inspector, editInspectorSlot);
    move(document.getElementById('undo-btn'), history);
    move(document.getElementById('redo-btn'), history);
    mountDockTools();
  };
  const exitLite = () => {
    unmountDockTools();
    for (const enhancement of panelEnhancements.values()) {
      enhancement.sourceHeaderActions.hidden = true;
      enhancement.segmentBindings.forEach(({ group }) => { group.hidden = true; });
      const sourceMenuShell = enhancement.panel.querySelector('.ai-source-menu-shell');
      if (sourceMenuShell) sourceMenuShell.hidden = false;
      if (enhancement.referenceHeading) enhancement.referenceHeading.textContent = enhancement.referenceHeadingText;
      enhancement.panel.querySelector('.ai-workbench')?.setAttribute('aria-modal', 'true');
    }
    moves.splice(0).reverse().forEach(({ element, marker }) => marker.replaceWith(element));
    root.classList.remove('lite-workbench-collapsed', 'lite-reference-collapsed', 'lite-context-collapsed');
    delete root.dataset.liteResultMode;
    delete root.dataset.liteInspectorMode;
    app.append(dock);
  };

  let saved = null;
  const preview = reference.querySelector('[data-lite-reference-preview]');
  const contextCopy = context.querySelector('[data-lite-context-copy]');
  const emptyReferenceMarkup = preview.innerHTML;
  const activeAiPanel = () => document.getElementById('ai-image-panel');
  const proAcceptLabel = aiPanel.querySelector('[data-ai-insert-selected]')?.textContent || '페이지에 넣고 닫기';
  const syncResultEmpty = () => {
    if (root.dataset.mode !== 'lite') return;
    activeAiPanel()?.querySelectorAll('.ai-result-pane [data-ai-empty]').forEach((empty) => {
      if (empty.querySelector('strong')?.textContent === '변환 결과 대기') return;
      empty.innerHTML = `${icon('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.2" cy="8" r="1.2"/><path d="m4.5 14 3.5-3.5 2.4 2.3 1.8-1.7 3.3 3.1"/>')}<strong>변환 결과 대기</strong><span>변환하면 결과가 여기에 표시됩니다.</span>`;
    });
  };
  const syncReference = () => {
    const panel = activeAiPanel();
    const source = panel?.querySelector('[data-ai-attachment-list] img');
    panel?.classList.toggle('lite-has-source', !!source?.src);
    if (!source?.src) {
      if (!preview.dataset.src) return;
      delete preview.dataset.src;
      preview.innerHTML = emptyReferenceMarkup;
      reference.classList.remove('has-source');
      return;
    }
    if (preview.dataset.src === source.src) return;
    preview.dataset.src = source.src;
    preview.replaceChildren();
    const image = document.createElement('img');
    image.src = source.src;
    image.alt = source.alt || 'AI 변환 원본';
    const name = document.createElement('span');
    name.textContent = source.alt || '현재 원본';
    preview.append(image, name);
    reference.classList.add('has-source');
  };

  const syncContext = () => {
    const mode = root.dataset.liteInspector;
    const selected = state.get().selectedIds?.length || 0;
    const copy = mode === 'text'
      ? ['텍스트 편집', '글자 크기와 굵기를 조절합니다.']
      : mode === 'line'
        ? ['선 편집', '선 굵기와 선 종류를 조절합니다.']
        : selected
          ? ['오브젝트 선택됨', '이동하거나 회전한 뒤 결과를 저장하세요.']
          : ['그림을 선택하세요', '원본을 변환하거나 도구로 편집하세요.'];
    contextCopy.innerHTML = `<strong>${copy[0]}</strong><p>${copy[1]}</p>`;
  };

  const collapsedClass = {
    workbench: 'lite-workbench-collapsed',
    reference: 'lite-reference-collapsed',
    inspector: 'lite-context-collapsed',
  };
  const syncPaneControls = () => {
    for (const [name, className] of Object.entries(collapsedClass)) {
      const collapsed = root.classList.contains(className);
      for (const toggle of document.querySelectorAll(`[data-lite-pane-toggle="${name}"]`)) {
        const label = name === 'workbench' ? '작업대' : name === 'reference' ? '레퍼런스 이미지' : '인스펙터';
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', `${label} ${collapsed ? '열기' : '접기'}`);
      }
    }
  };
  const setPaneCollapsed = (name, collapsed) => {
    const className = collapsedClass[name];
    if (!className || root.dataset.mode !== 'lite') return;
    root.classList.toggle(className, collapsed);
    syncPaneControls();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };
  aiPanel.querySelectorAll('[data-lite-pane-toggle]').forEach((button) => {
    button.addEventListener('click', () => setPaneCollapsed(button.dataset.litePaneToggle, true));
  });
  restoreButtons.forEach((button) => {
    button.addEventListener('click', () => setPaneCollapsed(button.dataset.litePaneRestore, false));
  });
  const narrowLayout = window.matchMedia('(max-width: 767px)');
  const syncResponsivePanes = () => {
    if (!narrowLayout.matches || root.dataset.mode !== 'lite') return;
    for (const className of Object.values(collapsedClass)) root.classList.remove(className);
    syncPaneControls();
  };
  narrowLayout.addEventListener?.('change', syncResponsivePanes);

  const setInspectorMode = (mode) => {
    const next = mode === 'edit' ? 'edit' : 'ai';
    root.dataset.liteInspectorMode = next;
    for (const enhancement of panelEnhancements.values()) {
      enhancement.editInspectorSlot.hidden = next !== 'edit' || enhancement.panel !== activeAiPanel();
      for (const button of enhancement.inspectorModeTabs.querySelectorAll('[data-lite-inspector-tab]')) {
        const active = button.dataset.liteInspectorTab === next;
        button.classList.toggle('is-on', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }
  };
  inspectorModeTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lite-inspector-tab]');
    if (button) setInspectorMode(button.dataset.liteInspectorTab);
  });

  const setResultMode = (mode) => {
    const next = mode === 'edit' ? 'edit' : 'ai';
    root.dataset.liteResultMode = next;
    for (const enhancement of panelEnhancements.values()) {
      enhancement.resultEditorSlot.hidden = next !== 'edit' || enhancement.panel !== activeAiPanel();
    }
    if (next === 'edit') {
      setInspectorMode('edit');
      requestAnimationFrame(() => {
        fitLiteCanvas();
        document.getElementById('canvas')?.focus();
      });
    }
  };

  const wirePanelEnhancement = (enhancement) => {
    if (enhancement.wired) return enhancement;
    enhancement.wired = true;
    const { panel, sourceEmptyActions: emptyActions, sourceHeaderActions: headerActions } = enhancement;
    panel.querySelectorAll('[data-lite-pane-toggle]').forEach((button) => {
      button.addEventListener('click', () => setPaneCollapsed(button.dataset.litePaneToggle, true));
    });
    enhancement.restoreButtons.forEach((button) => {
      button.addEventListener('click', () => setPaneCollapsed(button.dataset.litePaneRestore, false));
    });
    enhancement.inspectorModeTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lite-inspector-tab]');
      if (button) setInspectorMode(button.dataset.liteInspectorTab);
    });
    for (const actions of [emptyActions, headerActions]) {
      actions.querySelector('[data-lite-ai-source="library"], [data-lite-reference-source="library"]')?.addEventListener('click', () => panel.querySelector('[data-ai-reference-search]')?.click());
      actions.querySelector('[data-lite-ai-source="file"], [data-lite-reference-source="file"]')?.addEventListener('click', () => panel.querySelector('[data-ai-source-file]')?.click());
      actions.querySelector('[data-lite-ai-source="clipboard"], [data-lite-reference-source="clipboard"]')?.addEventListener('click', () => panel.querySelector('[data-ai-source-action="clipboard"]')?.click());
    }
    return enhancement;
  };

  const createPanelEnhancement = (panel) => {
    const existing = panelEnhancements.get(panel);
    if (existing) return wirePanelEnhancement(existing);

    const localSourceEmptyActions = document.createElement('div');
    localSourceEmptyActions.className = 'lite-ai-empty-actions';
    localSourceEmptyActions.innerHTML = '<strong>원본 이미지를 추가하세요</strong><div><button type="button" data-lite-ai-source="library">라이브러리</button><button type="button" data-lite-ai-source="file">파일</button><button type="button" data-lite-ai-source="clipboard">붙여넣기</button></div>';
    panel.querySelector('.ai-original-pane .ai-reference-section')?.append(localSourceEmptyActions);

    const localSourceHeaderActions = document.createElement('div');
    localSourceHeaderActions.className = 'lite-source-header-actions';
    localSourceHeaderActions.hidden = true;
    localSourceHeaderActions.setAttribute('aria-label', '레퍼런스 이미지 추가');
    localSourceHeaderActions.innerHTML = '<button type="button" data-lite-reference-source="library">라이브러리</button><button type="button" data-lite-reference-source="file">파일</button><button type="button" data-lite-reference-source="clipboard">붙여넣기</button>';
    panel.querySelector('.ai-original-pane .ai-pane-head-controls')?.append(localSourceHeaderActions);

    const localWorkbenchToggle = paneToggle('workbench', '작업대', '<path d="M7 4H4v12h3M13 4h3v12h-3M10 3v14"/>');
    const localReferenceToggle = paneToggle('reference', '레퍼런스 이미지', '<path d="m12 5-5 5 5 5"/>');
    const localInspectorToggle = paneToggle('inspector', '인스펙터', '<path d="m8 5 5 5-5 5"/>');
    panel.querySelector('.ai-rail-heading')?.append(localWorkbenchToggle);
    panel.querySelector('.ai-original-pane .ai-pane-head-controls')?.append(localReferenceToggle);

    const localInspectorTabs = document.createElement('nav');
    localInspectorTabs.className = 'lite-inspector-mode-tabs';
    localInspectorTabs.setAttribute('aria-label', '인스펙터 모드');
    localInspectorTabs.innerHTML = '<button type="button" class="is-on" data-lite-inspector-tab="ai" aria-pressed="true">AI 변환</button><button type="button" data-lite-inspector-tab="edit" aria-pressed="false">간단 편집</button>';
    const localEditInspectorSlot = document.createElement('div');
    localEditInspectorSlot.className = 'lite-edit-inspector-slot';
    localEditInspectorSlot.hidden = true;
    const localConversation = panel.querySelector('.ai-conversation');
    localConversation?.prepend(localInspectorTabs);
    localConversation?.querySelector('.ai-side-tabs')?.append(localInspectorToggle);
    localConversation?.append(localEditInspectorSlot);

    const localSegmentBindings = [];
    addSegmentProxy(panel, localSegmentBindings, '[data-ai-background-policy]', [['preserve', '유지'], ['connected', '제거']]);
    addSegmentProxy(panel, localSegmentBindings, '[data-ai-separation-mode]', [['off', '안 함'], ['auto', '자동']]);
    addSegmentProxy(panel, localSegmentBindings, '[data-ai-line-thickness]', [['0', '가늘게'], ['1', '보통'], ['2', '굵게']]);

    const localResultEditorSlot = document.createElement('div');
    localResultEditorSlot.className = 'lite-result-editor-slot';
    localResultEditorSlot.hidden = true;
    panel.querySelector('.ai-result-pane .ai-pane-head')?.after(localResultEditorSlot);

    const localRestoreButtons = [];
    for (const [name, label] of [['workbench', '작업대'], ['reference', '레퍼런스 이미지'], ['inspector', '인스펙터']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lite-pane-restore';
      button.dataset.litePaneRestore = name;
      button.setAttribute('aria-label', `${label} 열기`);
      button.title = `${label} 열기`;
      button.innerHTML = name === 'inspector' ? icon('<path d="m8 5 5 5-5 5"/>') : icon('<path d="m12 5-5 5 5 5"/>');
      const destination = name === 'reference' ? panel.querySelector('.ai-comparison-grid') : panel.querySelector('.ai-workspace');
      destination?.append(button);
      localRestoreButtons.push(button);
    }

    const localReferenceHeading = panel.querySelector('.ai-original-pane .ai-pane-metadata > strong');
    const enhancement = {
      panel,
      sourceEmptyActions: localSourceEmptyActions,
      sourceHeaderActions: localSourceHeaderActions,
      referenceHeading: localReferenceHeading,
      referenceHeadingText: localReferenceHeading?.textContent || '원본',
      inspectorModeTabs: localInspectorTabs,
      editInspectorSlot: localEditInspectorSlot,
      resultEditorSlot: localResultEditorSlot,
      segmentBindings: localSegmentBindings,
      restoreButtons: localRestoreButtons,
    };
    panelEnhancements.set(panel, enhancement);
    return wirePanelEnhancement(enhancement);
  };

  const mountPanelEnhancement = (panel) => {
    const enhancement = createPanelEnhancement(panel);
    if (enhancement.referenceHeading) enhancement.referenceHeading.textContent = '레퍼런스';
    enhancement.sourceHeaderActions.hidden = false;
    enhancement.segmentBindings.forEach(({ group, sync }) => { group.hidden = false; sync(); });
    const sourceMenuShell = panel.querySelector('.ai-source-menu-shell');
    if (sourceMenuShell) {
      sourceMenuShell.hidden = true;
      const target = panel.querySelector('.ai-original-pane .ai-pane-head-controls');
      if (target && sourceMenuShell.parentElement !== target) move(sourceMenuShell, target);
    }
    const annotationToolbar = panel.querySelector('.ai-annotation-toolbar');
    const annotationTarget = panel.querySelector('.ai-result-pane .ai-pane-head-controls');
    if (annotationToolbar && annotationTarget && annotationToolbar.parentElement !== annotationTarget) move(annotationToolbar, annotationTarget);
    panel.querySelector('.ai-workbench')?.setAttribute('aria-modal', 'false');
    enhancement.resultEditorSlot.append(center);
    enhancement.editInspectorSlot.append(inspector);
    setResultMode(root.dataset.liteResultMode);
    setInspectorMode(root.dataset.liteInspectorMode);
    syncPaneControls();
    syncResultEmpty();
    return enhancement;
  };

  const ensureActivePanelEnhanced = () => {
    const panel = activeAiPanel();
    if (!panel || root.dataset.mode !== 'lite') return null;
    return mountPanelEnhancement(panel);
  };
  window.addEventListener('5e:lite-result-edit', () => setResultMode('edit'));
  window.addEventListener('5e:ai-task-change', (event) => {
    if (root.dataset.mode !== 'lite') return;
    queueMicrotask(() => {
      const enhancement = panelEnhancements.get(activeAiPanel());
      enhancement?.segmentBindings.forEach(({ sync }) => sync());
    });
    const taskId = event.detail?.taskId;
    const hasAcceptedResult = Boolean(taskId && state.get().objects.some((object) => object.aiTaskId === taskId));
    setResultMode(hasAcceptedResult ? 'edit' : 'ai');
    if (hasAcceptedResult) {
      const owner = state.get().objects.find((object) => object.aiTaskId === taskId);
      if (owner) state.update((next) => { next.selectedIds = [owner.id]; });
    }
  });
  window.addEventListener('5e:ai-workspace-activate', (event) => {
    if (root.dataset.mode !== 'lite') return;
    const panel = event.detail?.panel;
    if (!(panel instanceof HTMLElement)) return;
    mountPanelEnhancement(panel);
    syncAiMode();
    syncReference();
  });

  const fitLiteCanvas = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (root.dataset.mode !== 'lite') return;
      const rect = document.getElementById('canvas').getBoundingClientRect();
      const artboard = state.get().artboard;
      const scale = Math.min(rect.width / (artboard.w * 1.16), rect.height / (artboard.h * 1.16));
      if (!(scale > 0)) return;
      state.update(next => {
        const w = rect.width / scale, h = rect.height / scale;
        next.viewBox = { x: -w / 2, y: -h / 2, w, h };
      });
    }));
  };
  let aiWasOpen = false;
  let editorImageIds = '';
  const imageIds = () => state.get().objects.filter(item => item.type === 'image').map(item => item.id).join(',');
  let initiallyFitted = false;
  const syncAiMode = () => {
    const panel = activeAiPanel();
    const open = panel && !panel.hidden && root.dataset.mode === 'lite';
    root.toggleAttribute('data-lite-ai-open', open);
    if (open && !aiWasOpen) editorImageIds = imageIds();
    if (!open && aiWasOpen && imageIds() !== editorImageIds) fitLiteCanvas();
    aiWasOpen = open;
    const acceptButton = panel?.querySelector('[data-ai-insert-selected]');
    if (open) {
      if (acceptButton && acceptButton.textContent !== '결과 사용') acceptButton.textContent = '결과 사용';
      const activeLayout = panel.querySelector('[data-ai-layout-mode][aria-pressed="true"]');
      if (!panel.dataset.litePreviousLayout && activeLayout) panel.dataset.litePreviousLayout = activeLayout.dataset.aiLayoutMode;
      const comparison = panel.querySelector('[data-ai-layout-mode="side-by-side"]');
      if (comparison?.getAttribute('aria-pressed') !== 'true') comparison?.click();
      syncReference();
    } else if (acceptButton) {
      if (acceptButton.textContent !== proAcceptLabel) acceptButton.textContent = proAcceptLabel;
      if (root.dataset.mode !== 'lite' && panel.dataset.litePreviousLayout) {
        panel.querySelector(`[data-ai-layout-mode="${panel.dataset.litePreviousLayout}"]`)?.click();
        delete panel.dataset.litePreviousLayout;
      }
    }
  };

  sourceEmptyActions.querySelector('[data-lite-ai-source="library"]').addEventListener('click', () => aiPanel.querySelector('[data-ai-reference-search]')?.click());
  sourceEmptyActions.querySelector('[data-lite-ai-source="file"]').addEventListener('click', () => document.getElementById('ai-image-file-input')?.click());
  sourceEmptyActions.querySelector('[data-lite-ai-source="clipboard"]').addEventListener('click', () => aiPanel.querySelector('[data-ai-source-action="clipboard"]')?.click());
  sourceHeaderActions.querySelector('[data-lite-reference-source="library"]').addEventListener('click', () => aiPanel.querySelector('[data-ai-reference-search]')?.click());
  sourceHeaderActions.querySelector('[data-lite-reference-source="file"]').addEventListener('click', () => document.getElementById('ai-image-file-input')?.click());
  sourceHeaderActions.querySelector('[data-lite-reference-source="clipboard"]').addEventListener('click', () => aiPanel.querySelector('[data-ai-source-action="clipboard"]')?.click());
  const openAiWorkspace = () => new Promise((resolve) => {
    window.addEventListener('5e:lite-ai-opened', resolve, { once: true });
    window.dispatchEvent(new Event('5e:lite-ai-open'));
  });
  reference.querySelector('#lite-ai-open').addEventListener('click', () => { void openAiWorkspace(); });
  reference.querySelector('[data-lite-source="file"]').addEventListener('click', () => {
    void openAiWorkspace();
    document.getElementById('ai-image-file-input')?.click();
  });
  reference.querySelector('[data-lite-source="clipboard"]').addEventListener('click', () => {
    void openAiWorkspace();
    activeAiPanel()?.querySelector('[data-ai-source-action="clipboard"]')?.click();
  });
  reference.querySelector('[data-lite-source="library"]').addEventListener('click', async () => {
    await openAiWorkspace();
    activeAiPanel()?.querySelector('[data-ai-reference-search]')?.click();
  });

  async function exitFullscreen() {
    try {
      const native = window.fiveEDesktop?.fullscreen;
      if (native) {
        if (await native.get()) await native.toggle();
      } else if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
      }
    } catch (error) { console.error('Unable to exit fullscreen for Lite', error); }
  }

  function syncMode() {
    const lite = root.dataset.mode === 'lite';
    if (lite && !saved) {
      const aiOpen = !aiPanel.hidden;
      enterLite();
      if (!initiallyFitted) { initiallyFitted = true; fitLiteCanvas(); }
      saved = { theme: root.getAttribute('data-theme'), grid: { ...state.get().grid }, aiOpen };
      root.setAttribute('data-theme', 'light');
      aiPanel.querySelector('.ai-workbench')?.setAttribute('aria-modal', 'false');
      root.dataset.liteResultMode = 'ai';
      setInspectorMode('ai');
      syncPaneControls();
      syncResponsivePanes();
      state.update((next) => { next.grid.visible = false; });
      void exitFullscreen();
      void openAiWorkspace();
    } else if (!lite && saved) {
      const previous = saved;
      saved = null;
      exitLite();
      aiPanel.hidden = !previous.aiOpen;
      aiPanel.querySelector('.ai-workbench')?.setAttribute('aria-modal', 'true');
      if (previous.theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', previous.theme);
      state.update((next) => { next.grid = { ...previous.grid }; });
      document.getElementById('grid-btn')?.classList.toggle('is-active', previous.grid.visible);
      document.getElementById('grid-btn')?.setAttribute('aria-pressed', String(previous.grid.visible));
      const gridDetail = document.getElementById('grid-detail');
      if (gridDetail) gridDetail.hidden = !previous.grid.visible;
    }
    syncAiMode();
    syncResultEmpty();
    window.dispatchEvent(new Event('resize'));
  }

  new MutationObserver(() => { syncAiMode(); syncReference(); }).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'src', 'id'],
  });
  state.subscribe((snapshot) => {
    if (saved && root.dataset.mode === 'lite' && snapshot.grid.visible) state.update((next) => { next.grid.visible = false; });
    syncContext();
  });
  window.addEventListener('5e:view-mode-change', syncMode);
  window.addEventListener('5e:lite-ai-opened', () => {
    ensureActivePanelEnhanced();
    syncAiMode();
    syncResultEmpty();
  });
  syncMode();
  syncReference();
  syncResultEmpty();
  syncContext();
}
