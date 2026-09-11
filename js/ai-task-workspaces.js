export function createTaskBridge(base, clientScope) {
  if (!base) return undefined;
  const bridge = { ...base };
  for (const method of ['status', 'start', 'stop', 'models', 'account', 'login', 'send', 'interrupt']) {
    if (typeof base[method] === 'function') bridge[method] = (payload = {}) => base[method]({ ...payload, clientScope });
  }
  for (const method of ['onEvent', 'onState', 'onLog']) {
    if (typeof base[method] === 'function') bridge[method] = callback => base[method](event => {
      if ((event.clientScope || '') === clientScope) callback(event);
    });
  }
  return bridge;
}

export function createTaskPersistence({
  store,
  capture,
  snapshot,
  warn,
  delayMs = 350,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let dirty = false;
  let outage = false;
  let queue = Promise.resolve();
  const captureAndQueue = () => {
    if (!dirty) return queue;
    dirty = false;
    let value;
    let captureError;
    try {
      capture();
      value = structuredClone(snapshot());
    } catch (error) {
      captureError = error;
    }
    const write = async () => {
      try {
        if (captureError) throw captureError;
        if (!store) throw new Error('IndexedDB unavailable');
        await store.put(value);
        outage = false;
      } catch (error) {
        if (!outage) warn(error);
        outage = true;
      }
    };
    queue = queue.then(write, write);
    return queue;
  };
  const flush = () => {
    if (timer) clearTimer(timer);
    timer = null;
    return captureAndQueue();
  };
  return {
    schedule() {
      dirty = true;
      if (timer) clearTimer(timer);
      timer = setTimer(() => { timer = null; void captureAndQueue(); }, delayMs);
    },
    flush,
    settled: () => queue,
  };
}

export function createTaskWorkspaces(state, initialize, setupWorkbench) {
  const original = document.getElementById('ai-image-panel');
  if (!original) return;
  const template = original.cloneNode(true);
  delete template.dataset.aiWorkbenchReady;
  const entries = [];
  const registryKey = '5e.aiParallelWorkspaces.v1';
  let active;
  let restored = false;
  const selectionKey = '5e.aiActiveTask.v1';
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch { window.alert('작업 목록 저장에 실패했습니다. 현재 작업을 저장하기 전에는 새로고침하지 마세요.'); }
  }
  const saveRegistry = () => store(registryKey, entries.map(e => e.scope).filter(Boolean));
  function saveSelection() {
    if (restored && active?.controller) store(selectionKey, {scope: active.scope, taskId: active.controller.activeTask()});
  }
  function activate(entry) {
    for (const item of entries) {
      item.panel.hidden = item !== entry;
      item.panel.id = item === entry ? 'ai-image-panel' : `ai-workspace-${item.scope || 'legacy'}`;
    }
    active = entry;
    renderNavigation();
    saveSelection();
  }
  function renderNavigation() {
    for (const owner of entries) {
      const list = owner.panel.querySelector('[data-ai-tab-list]');
      list.replaceChildren();
      for (const entry of entries) {
        for (const source of entry.tabs || []) {
          const button = source.cloneNode(true);
          const selected = entry === active && source.getAttribute('aria-selected') === 'true';
          button.classList.toggle('is-on', selected);
          button.setAttribute('aria-selected', String(selected));
          button.disabled = !entry.ready;
          button.title = source.textContent.replace('×', '').trim();
          button.dataset.aiWorkspaceLink = entry.scope || 'legacy';
          if (entry.panel.dataset.aiBusy === 'true' && source.getAttribute('aria-selected') === 'true') {
            button.querySelector('span').textContent += ' · 변환 중';
          }
          button.onclick = () => {
            if (entry.panel.dataset.aiBusy === 'true' && source.getAttribute('aria-selected') !== 'true') return;
            activate(entry);
            source.onclick?.();
            saveSelection();
          };
          const close = button.querySelector('i');
          if (close) close.onclick = event => {
            event.stopPropagation();
            activate(entry);
            source.querySelector('i')?.onclick?.(event);
            saveSelection();
          };
          list.append(button);
        }
      }
    }
  }
  function add(scope, show = true) {
    const panel = scope ? template.cloneNode(true) : original;
    if (scope) {
      panel.id = `ai-workspace-${scope}`;
      for (const element of panel.querySelectorAll('[id]')) {
        const oldId = element.id; element.id = `${oldId}-${scope}`;
        for (const label of panel.querySelectorAll(`[for="${oldId}"]`)) label.htmlFor = element.id;
        for (const labelled of panel.querySelectorAll(`[aria-labelledby="${oldId}"]`)) labelled.setAttribute('aria-labelledby', element.id);
      }
      panel.hidden = true; original.parentElement.append(panel);
    }
    const entry = { scope, panel, controller: null, tabs: [], ready: false };
    entries.push(entry);
    entry.controller = initialize(state, {
      panel, clientScope: scope, desktop: createTaskBridge(window.fiveEDesktop, scope),
      newWorkspace: () => { const next = add(crypto.randomUUID()); saveRegistry(); return next.scope; },
      workspaceEmpty: () => {
        const next = entries.find(item => item !== entry && item.tabs.length) || add(crypto.randomUUID());
        activate(next);
        saveRegistry();

      },
      navigationChanged: tabs => {
        if (tabs) entry.tabs = tabs;
        renderNavigation();
        saveSelection();
      },
    });
    setupWorkbench(panel);
    entry.controller.ready.then(() => { entry.ready = true; if (show) activate(entry); else renderNavigation(); });
    return entry;
  }
  active = add('', false);
  try {
    const saved = JSON.parse(localStorage.getItem(registryKey) || '[]');
    for (const scope of saved) if (typeof scope === 'string' && /^[a-f0-9-]{36}$/.test(scope)) add(scope, false);
  } catch { /* The original workspace remains available if the registry is unreadable. */ }
  const ready = Promise.all(entries.map(e => e.controller.ready)).then(() => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(selectionKey) || 'null'); } catch {}
    const target = entries.find(e => e.scope === saved?.scope && e.controller.ownsTask(saved?.taskId));
    if (target) {
      active = target;
      target.controller.selectTask(saved.taskId);
    }
    if (!active.tabs.length) active = entries.find(e => e.tabs.length) || add(crypto.randomUUID(), false);
    restored = true;
    saveRegistry();
    renderNavigation();
  });
  renderNavigation();
  return {
    open: async options => {
      await ready;
      const selected = state.get().objects.find(o => state.get().selectedIds?.includes(o.id) && o.aiTaskId);
      const hasReference = options?.reference || options?.references?.length;
      const owner = !hasReference && entries.find(e => e.controller.ownsTask(selected?.aiTaskId));
      activate(owner || active);
      return active.controller.open(options);
    },
    close: () => active.controller.close(),
    attachReference: (...args) => active.controller.attachReference(...args),
  };
}
