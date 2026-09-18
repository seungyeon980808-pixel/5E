import { previewStorage as localStorage } from './preview-storage.js?v=1.6.0-preview-labeler-0917-1111';
import {
  chooseTaskExportDestination,
  normalizeTaskExportMode,
  writeTaskExports,
} from './ai-task-export.js?v=1.6.0-preview-labeler-0917-1111';
import { restoreGenerationTiming } from './ai-generation-timing.js?v=1.6.0-preview-labeler-0917-1111';

const CANCELLABLE_TASK_STATES = new Set(['busy', 'running']);

export async function clearTaskWorkspaces({ tasks, confirm, cancel, remove }) {
  const targets = Array.isArray(tasks) ? [...tasks] : [];
  if (!targets.length || !await confirm(targets.length)) {
    return { confirmed: false, removedIds: [], retainedIds: targets.map(task => task.id) };
  }
  const removedIds = [];
  const retainedIds = [];
  for (const task of targets) {
    if (CANCELLABLE_TASK_STATES.has(task.workState)) {
      try {
        const outcome = await cancel(task);
        if (outcome?.acknowledged !== true) {
          retainedIds.push(task.id);
          continue;
        }
      } catch {
        retainedIds.push(task.id);
        continue;
      }
    }
    await remove(task);
    removedIds.push(task.id);
  }
  return { confirmed: true, removedIds, retainedIds };
}

export function recoverTaskWorkspaceSnapshot(value) {
  if (!value || !Array.isArray(value.tabs)) return null;
  const recovered = structuredClone(value);
  recovered.tabs = recovered.tabs.filter(tab => tab && typeof tab.id === 'string').map(tab => {
    const generated = Array.isArray(tab.generated) ? tab.generated : [];
    const selected = generated.some(item => item?.id === tab.selectedCandidateId)
      ? tab.selectedCandidateId : generated.at(-1)?.id || null;
    const wasRunning = tab.workState === 'busy';
    return {
      ...tab,
      attachments: Array.isArray(tab.attachments) ? tab.attachments : [],
      generated,
      selectedCandidateId: selected,
      workState: wasRunning ? 'interrupted' : (tab.workState || 'idle'),
      retryRequest: wasRunning ? (tab.inFlightRequest || tab.retryRequest || null) : (tab.retryRequest || null),
      inFlightRequest: wasRunning ? null : (tab.inFlightRequest || null),
      generationTiming: restoreGenerationTiming(tab.generationTiming, { interruptRunning: wasRunning }),
    };
  });
  if (!recovered.tabs.some(tab => tab.id === recovered.activeTaskTabId)) {
    recovered.activeTaskTabId = recovered.tabs[0]?.id || null;
  }
  return recovered;
}

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
  const captureAndQueue = ({ force = false, required = false } = {}) => {
    if (!dirty && !force) return queue;
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
        return { ok: true, error: null };
      } catch (error) {
        if (!outage) warn(error);
        outage = true;
        return { ok: false, error };
      }
    };
    const result = queue.then(write, write);
    queue = result.then(() => undefined);
    if (!required) return queue;
    return result.then(outcome => {
      if (!outcome.ok) throw outcome.error;
      return true;
    });
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
    checkpoint() {
      if (timer) clearTimer(timer);
      timer = null;
      return captureAndQueue({ force: true, required: true });
    },
    settled: () => queue,
  };
}

export function createTaskWorkspaces(state, initialize, setupWorkbench, { freshStart = false } = {}) {
  const original = document.getElementById('ai-image-panel');
  if (!original) return;
  const template = original.cloneNode(true);
  delete template.dataset.aiWorkbenchReady;
  const entries = [];
  const registryKey = '5e.aiParallelWorkspaces.v1';
  let active;
  let restored = false;
  let collectiveExportInProgress = false;
  let clearing = false;
  const selectionKey = '5e.aiActiveTask.v1';
  async function exportCollection(mode) {
    if (collectiveExportInProgress) {
      throw new Error('다른 작업 결과를 저장 중입니다. 완료 후 다시 시도해 주세요.');
    }
    collectiveExportInProgress = true;
    try {
      const normalizedMode = normalizeTaskExportMode(mode);
      const count = entries.reduce((total, entry) => total + (entry.controller?.exportCount?.(normalizedMode) || 0), 0);
      if (!count) throw new Error('저장할 생성 결과가 없습니다.');
      const destination = await chooseTaskExportDestination({
        desktopBatchOutput: window.fiveEDesktop?.batchOutput,
        confirmDownloads: message => window.confirm(message),
      });
      if (!destination) return { status: 'cancelled', count: 0, files: [] };
      const groups = await Promise.all(entries.map(entry => entry.controller.exportResults(normalizedMode)));
      return await writeTaskExports(destination, groups.flat());
    } finally {
      collectiveExportInProgress = false;
    }
  }
  async function clearCollection(confirm) {
    if (clearing) return;
    clearing = true;
    try {
      await Promise.all(entries.map(entry => entry.controller.ready));
      const targets = entries.filter(entry => entry.tabs.length);
      const count = targets.reduce((sum, entry) => sum + entry.tabs.length, 0);
      if (!count || !await confirm(count)) return { confirmed: false, removedIds: [], retainedIds: [] };
      const result = { confirmed: true, removedIds: [], retainedIds: [] };
      for (const entry of targets) {
        const cleared = await entry.controller.clearTasks(async () => true);
        result.removedIds.push(...cleared.removedIds);
        result.retainedIds.push(...cleared.retainedIds);
      }
      activate(entries.find(entry => entry.tabs.length) || active);
      saveRegistry();
      return result;
    } finally {
      clearing = false;
    }
  }
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
      const focusedRow = document.activeElement?.closest?.('.ai-task-tab');
      const focusedKey = list.contains?.(focusedRow)
        ? `${focusedRow.dataset.aiWorkspaceLink || ''}:${focusedRow.dataset.tabId || ''}` : null;
      list.replaceChildren();
      for (const entry of entries) {
        for (const source of entry.tabs || []) {
          const button = source.cloneNode(true);
          const selected = entry === active && source.getAttribute('aria-selected') === 'true';
          button.classList.toggle('is-on', selected);
          button.setAttribute('aria-selected', String(selected));
          button.setAttribute('tabindex', selected ? '0' : '-1');
          button.disabled = !entry.ready;
          button.setAttribute('aria-disabled', String(!entry.ready));
          button.title = source.title || source.textContent.replace('×', '').trim();
          button.dataset.aiWorkspaceLink = entry.scope || 'legacy';
          if (entry.panel.dataset.aiBusy === 'true' && source.getAttribute('aria-selected') === 'true') {
            const timing = button.querySelector('.ai-task-tab-time');
            if (timing) timing.textContent = '변환 중';
          }
          button.onclick = () => {
            if (entry.panel.dataset.aiBusy === 'true' && source.getAttribute('aria-selected') !== 'true') return;
            activate(entry);
            source.onclick?.();
            saveSelection();
          };
          button.onkeydown = event => {
            if (event.target !== button) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              button.onclick();
              return;
            }
            const rows = [...list.children].filter(row => !row.disabled);
            const index = rows.indexOf(button);
            let next = null;
            if (event.key === 'Home') next = rows[0];
            else if (event.key === 'End') next = rows.at(-1);
            else if (event.key === 'ArrowRight') next = rows[(index + 1) % rows.length];
            else if (event.key === 'ArrowLeft') next = rows[(index - 1 + rows.length) % rows.length];
            if (!next) return;
            event.preventDefault();
            for (const row of rows) row.setAttribute('tabindex', row === next ? '0' : '-1');
            next.focus();
          };
          const close = button.querySelector('.ai-task-delete');
          if (close) close.onclick = event => {
            event.stopPropagation();
            activate(entry);
            source.querySelector('.ai-task-delete')?.onclick?.(event);
            saveSelection();
          };
          list.append(button);
        }
      }
      if (focusedKey) {
        const restored = [...list.children].find(row =>
          `${row.dataset.aiWorkspaceLink || ''}:${row.dataset.tabId || ''}` === focusedKey);
        if (restored) {
          for (const row of list.children) row.setAttribute('tabindex', row === restored ? '0' : '-1');
          restored.focus();
        }
      }
    }
  }
  function add(scope, show = true) {
    const panel = entries.length ? template.cloneNode(true) : original;
    if (panel !== original) {
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
      panel, clientScope: scope, desktop: createTaskBridge(window.fiveEDesktop || window.fiveEWebAI, scope),
      exportCollection, clearCollection,
      newWorkspace: () => { const next = add(crypto.randomUUID()); saveRegistry(); return next.scope; },
      workspaceEmpty: () => {
        const next = entries.find(item => item !== entry && item.tabs.length);
        if (!clearing) activate(next || entry);
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
  const primaryKey = '5e.aiPrimaryWorkspace.v1';
  let primaryScope = '';
  if (freshStart) {
    primaryScope = crypto.randomUUID();
    store(primaryKey, primaryScope);
    store(selectionKey, null);
  } else {
    try {
      const savedPrimary = JSON.parse(localStorage.getItem(primaryKey) || 'null');
      if (typeof savedPrimary === 'string' && /^[a-f0-9-]{36}$/.test(savedPrimary)) primaryScope = savedPrimary;
    } catch { /* Existing installations use the legacy workspace. */ }
  }
  active = add(primaryScope, false);
  try {
    const saved = freshStart ? [] : JSON.parse(localStorage.getItem(registryKey) || '[]');
    for (const scope of saved) if (typeof scope === 'string' && /^[a-f0-9-]{36}$/.test(scope) && scope !== primaryScope) add(scope, false);
  } catch { /* The original workspace remains available if the registry is unreadable. */ }
  const ready = Promise.all(entries.map(e => e.controller.ready)).then(() => {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(selectionKey) || 'null'); } catch {}
    const target = entries.find(e => e.scope === saved?.scope && e.controller.ownsTask(saved?.taskId));
    if (target) {
      active = target;
      target.controller.selectTask(saved.taskId);
    }
    if (!active.tabs.length) active = entries.find(e => e.tabs.length) || active;
    restored = true;
    saveRegistry();
    renderNavigation();
  });
  renderNavigation();
  const independentReferences = references => {
    if (!Array.isArray(references) || references.length < 1) {
      throw new Error('독립 AI 작업에 참고 이미지가 필요합니다.');
    }
    return references.map((reference, index) => {
      if (!reference || typeof reference !== 'object' || typeof reference.dataUrl !== 'string'
        || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(reference.dataUrl)) {
        throw new Error(`${index + 1}번째 참고 이미지의 스냅샷이 올바르지 않습니다.`);
      }
      return {
        dataUrl: reference.dataUrl,
        src: reference.dataUrl,
        name: String(reference.name || `PDF 선택 영역 ${index + 1}`),
        sourceKind: String(reference.sourceKind || 'auto'),
        source: reference.source === undefined ? null : structuredClone(reference.source),
      };
    });
  };
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
    openIndependentReferences: async ({ references, prompt = '', startGeneration = false, placement = 'separate', groups = null } = {}) => {
      await ready;
      const snapshots = independentReferences(references);
      const groupedSnapshots = Array.isArray(groups)
        ? groups.map((indices, groupIndex) => {
          if (!Array.isArray(indices) || indices.length < 1) throw new Error(`${groupIndex + 1}번째 AI 작업대가 비어 있습니다.`);
          if (indices.length > 10) throw new Error(`${groupIndex + 1}번째 AI 작업대는 참고 이미지를 최대 10개까지 받을 수 있습니다.`);
          if (new Set(indices).size !== indices.length) throw new Error(`${groupIndex + 1}번째 AI 작업대에 같은 참고 이미지가 중복되었습니다.`);
          return indices.map((index) => {
            if (!Number.isInteger(index) || index < 0 || index >= snapshots.length) throw new Error(`${groupIndex + 1}번째 AI 작업대의 자료 번호가 올바르지 않습니다.`);
            return snapshots[index];
          });
        })
        : placement === 'together' ? [snapshots] : snapshots.map(snapshot => [snapshot]);
      if (!groupedSnapshots.length) throw new Error('열 AI 작업대가 없습니다.');
      if (placement === 'together' && snapshots.length > 10) throw new Error('한 AI 작업대는 참고 이미지를 최대 10개까지 받을 수 있습니다.');
      const created = groupedSnapshots.map(() => add(crypto.randomUUID(), false));
      saveRegistry();
      await Promise.all(created.map(entry => entry.controller.ready));
      await Promise.all(created.map((entry, index) => entry.controller.open({
        references: groupedSnapshots[index],
        placement: groupedSnapshots[index].length > 1 ? 'together' : 'separate',
        reveal: false,
        prompt,
        startGeneration: startGeneration === true,
      })));
      activate(created.at(-1));
      return created.map((entry, index) => ({ scope: entry.scope, name: groupedSnapshots[index][0].name }));
    },
    checkpointForClose: async () => {
      const snapshots = await Promise.all(entries.map((entry) => entry.controller.checkpointForClose()));
      return {
        recovered: snapshots.every((snapshot) => snapshot.recovered),
        hasWork: snapshots.some((snapshot) => snapshot.hasWork),
      };
    },
  };
}
