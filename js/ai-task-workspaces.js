import { validateWorkspaceCandidates } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';
import { createWorkspaceBatch, createWorkspaceSelection } from './ai-workspace-batch.js?v=1.7.0-four-session-integration';
import { createBatchStore } from './ai-batch-store.js?v=1.7.0-four-session-integration';
import {
  chooseTaskExportDestination,
  normalizeTaskExportMode,
  writeTaskExports,
} from './ai-task-export.js?v=1.7.0-four-session-integration';
import { restoreGenerationTiming } from './ai-generation-timing.js?v=1.7.0-four-session-integration';
import { idbGet, idbSet } from './idb-store.js?v=1.7.0-four-session-integration';
import { createTaskContextMenu, copyTaskImage } from './ai-task-context-menu.js?v=1.7.0-four-session-integration';

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
  validateWorkspaceCandidates(value);
  const recovered = structuredClone(value);
  recovered.tabs = recovered.tabs.filter(tab => tab && typeof tab.id === 'string').map(tab => {
    const generated = Array.isArray(tab.generated) ? tab.generated : [];
    const selected = generated.some(item => item?.id === tab.selectedCandidateId)
      ? tab.selectedCandidateId : generated.at(-1)?.id || null;
    const wasRunning = tab.workState === 'busy';
    return {
      ...tab,
      conversionKind: ['image','graph'].includes(tab.conversionKind) ? tab.conversionKind : generated.some(item=>item.graphResult) ? 'graph' : 'image',
      attachments: Array.isArray(tab.attachments) ? tab.attachments : [],
      generated,
      selectedCandidateId: selected,
      workState: wasRunning ? 'interrupted' : (tab.workState || 'idle'),
      retryRequest: (tab.inFlightRequest?.snapshot?.runInput?.workspaceBatchJobId || tab.retryRequest?.snapshot?.runInput?.workspaceBatchJobId) ? null : wasRunning ? (tab.inFlightRequest || tab.retryRequest || null) : (tab.retryRequest || null),
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
    if (typeof base[method] === 'function') bridge[method] = callback => {
      let active = callback;
      const unsubscribe = base[method](event => {
        if ((event.clientScope || '') === clientScope) active?.(event);
      });
      return () => {
        active = null;
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    };
  }
  if (typeof base.onAiCloseTaskShortcut === 'function') bridge.onAiCloseTaskShortcut = callback => {
    let active = callback;
    const unsubscribe = base.onAiCloseTaskShortcut(() => active?.());
    return () => {
      active = null;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  };
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
  let pendingReplacements = 0;
  let timerEpoch = 0;
  const cancelTimer = () => {
    timerEpoch += 1;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const readSnapshot = () => {
    capture();
    return structuredClone(snapshot());
  };
  const queueWrite = (read, { required = false, apply } = {}) => {
    const write = async () => {
      try {
        const value = read();
        if (!store) throw new Error('IndexedDB unavailable');
        await store.put(value);
        apply?.();
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
  const captureAndQueue = ({ force = false, required = false } = {}) => {
    if (!dirty && !force) return queue;
    dirty = false;
    // A replacement owns both the persisted snapshot and its controller install.
    // Captures requested during that transaction must read the installed owner.
    if (pendingReplacements) return queueWrite(readSnapshot, { required });
    let value;
    let captureError;
    try {
      value = readSnapshot();
    } catch (error) {
      captureError = error;
    }
    return queueWrite(() => {
      if (captureError) throw captureError;
      return value;
    }, { required });
  };
  const flush = () => {
    cancelTimer();
    return captureAndQueue();
  };
  return {
    schedule() {
      dirty = true;
      cancelTimer();
      const epoch = timerEpoch;
      timer = setTimer(() => {
        if (epoch !== timerEpoch) return;
        timer = null;
        void captureAndQueue();
      }, delayMs);
    },
    flush,
    checkpoint() {
      cancelTimer();
      return captureAndQueue({ force: true, required: true });
    },
    replace(value, apply) {
      const replacement = structuredClone(value);
      cancelTimer();
      dirty = false;
      pendingReplacements += 1;
      return queueWrite(() => replacement, { required: true, apply })
        .finally(() => { pendingReplacements -= 1; });
    },
    dispose() {
      cancelTimer();
      dirty = false;
    },
    settled: () => queue,
  };
}

export function createTaskWorkspaces(state, initialize, setupWorkbench, { freshStart = false, serviceCap = 10, materializeCandidate } = {}) {
  const original = document.getElementById('ai-image-panel');
  if (!original) return;
  const template = original.cloneNode(true);
  delete template.dataset.aiWorkbenchReady;
  const entries = [];
  const registryKey = '5e.aiParallelWorkspaces.v1';
  const transfersKey = '5e.aiTaskTransfers.v1';
  const readTransfers = () => {
    try { const value = JSON.parse(localStorage.getItem(transfersKey) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const writeTransfers = records => localStorage.setItem(transfersKey, JSON.stringify(records));
  let active;
  let restored = false;
  let collectiveExportInProgress = false;
  let clearing = false;
  let selectionSequence = 0;
  const pendingSelections = new Map();
  const selectionKey = '5e.aiActiveTask.v1';
  const workflowSelections = new Map();
  const workflowKind = () => active?.panel.dataset.aiWorkflow === 'graph' ? 'graph' : 'image';
  const selectionFor = (kind = workflowKind()) => {
    if (!workflowSelections.has(kind)) workflowSelections.set(kind,createWorkspaceSelection());
    return workflowSelections.get(kind);
  };
  const selectedTasks = {values:()=>selectionFor().values(),select:(...args)=>selectionFor().select(...args),clear:()=>selectionFor().clear()};
  const taskKind = (entry,id) => entry.controller?.taskWorkflow?.(id) || entry.panel.dataset.aiWorkflow || 'image';
  const workflowRows = (kind = workflowKind()) => entries.flatMap(entry=>(entry.tabs || []).filter(row=>taskKind(entry,row.dataset.tabId)===kind).map(row=>({entry,row})));
  let workspaceBatch, batchReady = false, batchTimer = null, batchDisposed = false, batchLaunching = false;
  let batchDisposal;
  let batchJobs = [], batchIssue = '', preparedLaunch = null;
  const ownerKey = owner => JSON.stringify([owner?.scope?.sessionId, owner?.scope?.workspaceId, owner?.taskId]);
  const ownerFor = (entry, id) => entry.controller?.batchOwner(id) || {scope:{sessionId:'5e',workspaceId:entry.scope||'main'},taskId:id};
  const resolveOwner = owner => entries.find(entry => entry.controller?.ownsBatchOwner(owner));
  const batchError = error => { batchIssue = error?.message || String(error); renderNavigation(); };
  function renderBatchControls() {
    if (!active) return;
    let controls = active.panel.querySelector('[data-ai-workspace-batch]');
    if (!controls) {
      controls = document.createElement('div'); controls.dataset.aiWorkspaceBatch = '';
      active.panel.querySelector('[data-ai-tabs]').append(controls);
    }
    let count=active.panel.querySelector('[data-ai-selection-count]');
    if(!count){count=document.createElement('output');count.dataset.aiSelectionCount='';active.panel.querySelector('[data-ai-tabs]').prepend(count);}
    count.textContent = `${selectedTasks.values().length}개 선택`;
    active.controller?.refreshTaskSelection?.();
    const total = workflowRows().length;
    const selectAll = active.panel.querySelector('[data-ai-tab-select-all]');
    if (selectAll) {
      const allSelected = total > 0 && selectedTasks.values().length === total;
      selectAll.disabled = !restored || clearing || !total || active.panel.dataset.aiSharingMode === 'view';
      selectAll.setAttribute('aria-pressed', String(allSelected));
      selectAll.classList.toggle('is-on', allSelected);
    }
    controls.hidden = !batchIssue;
    const renderKey=JSON.stringify([batchIssue]);
    if(controls.dataset.renderKey===renderKey)return;
    controls.dataset.renderKey=renderKey;controls.replaceChildren();
    if (batchIssue) { const error = document.createElement('p'); error.setAttribute('role','alert'); error.textContent = batchIssue; controls.append(error); }
  }
  async function refreshBatch() {
    if (!workspaceBatch || batchDisposed) return;
    batchJobs = await workspaceBatch.list(); renderNavigation();
    clearTimeout(batchTimer);
    if (batchJobs.some(job=>['running','queued'].includes(job.state))) batchTimer=setTimeout(()=>{void refreshBatch().catch(batchError);},250);
  }
  function launchSelected() {
    if (selectedTasks.values().length < 2) {
      const owner=ownerFor(active,active.controller.activeTask());
      if(batchJobs.some(job=>['running','queued'].includes(job.state)&&ownerKey(job.sourceSnapshot.owner)===ownerKey(owner))){batchError(new Error('이 작업은 대기열에서 실행 중입니다. 취소 후 새 요청을 시작하세요.'));return true;}
      return false;
    }
    if (!batchReady) { batchError(new Error('작업 대기열을 복원하고 있습니다. 잠시 후 다시 실행하세요.')); return true; }
    if (batchLaunching || preparedLaunch) return true;
    batchIssue='';
    const chosen=selectedTasks.values();
    const captures=chosen.map(owner=>{
      const entry=resolveOwner(owner);
      try{return entry.controller.captureBatchTask(owner.taskId);}catch(error){return {...owner,snapshot:{captureError:error.message}};}
    });
    const report=workspaceBatch.prepare(captures);
    if (!report.eligible) { batchIssue=report.issues.map(issue=>`${captures[issue.index]?.snapshot?.title || chosen[issue.index].taskId}: ${captures[issue.index]?.snapshot?.captureError || issue.reason}`).join('\n');renderNavigation();return true; }
    preparedLaunch=report;batchLaunching=true;
    void workspaceBatch.launch(report).then(refreshBatch).catch(batchError).finally(()=>{batchLaunching=false;});
    return true;
  }

  async function exportCollection(mode) {
    if (collectiveExportInProgress) {
      throw new Error('다른 작업 결과를 저장 중입니다. 완료 후 다시 시도해 주세요.');
    }
    collectiveExportInProgress = true;
    try {
      const normalizedMode = normalizeTaskExportMode(mode);
      const kind = workflowKind();
      const count = entries.reduce((total, entry) => total + (entry.controller?.exportCount?.(normalizedMode,kind) || 0), 0);
      if (!count) throw new Error('저장할 생성 결과가 없습니다.');
      const destination = await chooseTaskExportDestination({
        desktopBatchOutput: window.fiveEDesktop?.batchOutput,
        confirmDownloads: message => window.confirm(message),
      });
      if (!destination) return { status: 'cancelled', count: 0, files: [] };
      const groups = await Promise.all(entries.map(entry => entry.controller.exportResults(normalizedMode,kind)));
      return await writeTaskExports(destination, groups.flat());
    } finally {
      collectiveExportInProgress = false;
    }
  }
  async function selectCollection() {
    if (clearing || active?.panel.dataset.aiSharingMode === 'view') return;
    await Promise.all(entries.map(entry => entry.controller.ready));
    if (clearing || active?.panel.dataset.aiSharingMode === 'view') return;
    selectedTasks.clear();
    for (const {entry,row} of workflowRows()) {
      selectedTasks.select(ownerFor(entry, row.dataset.tabId), { toggle: true });
    }
    preparedLaunch = null;
    renderNavigation();
  }
  async function clearCollection(confirm) {
    if (clearing) return;
    clearing = true;
    try {
      await Promise.all(entries.map(entry => entry.controller.ready));
      const kind=workflowKind();
      const rows = workflowRows(kind);
      const targets = [...new Set(rows.map(({entry})=>entry))];
      const count = rows.length;
      if (!count || !await confirm(count)) return { confirmed: false, removedIds: [], retainedIds: [] };
      const result = { confirmed: true, removedIds: [], retainedIds: [] };
      for (const entry of targets) {
        const cleared = await entry.controller.clearTasks(async () => true,rows.filter(row=>row.entry===entry).map(({row})=>row.dataset.tabId));
        result.removedIds.push(...cleared.removedIds);
        result.retainedIds.push(...cleared.retainedIds);
      }
      await navigateWorkflow(kind);
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
  const saveRegistry = () => store(registryKey, entries.filter(e => e.panel !== original).map(e => e.scope).filter(Boolean));
  function saveSelection() {
    if (restored && active?.controller) store(selectionKey, {scope: active.scope, taskId: active.controller.activeTask()});
  }
  function activate(entry, { reveal = true } = {}) {
    if (!entry || entry.disposed || !entries.includes(entry)) return;
    const switchingVisible = reveal && active !== entry && active
      && !active.panel.hidden && !active.panel.inert;
    for (const item of entries) {
      item.panel.id = item === entry ? 'ai-image-panel' : `ai-workspace-${item.scope || 'legacy'}`;
      if (item.controller.setWorkbenchVisible) item.controller.setWorkbenchVisible(reveal && item === entry, { animate: !switchingVisible });
      else item.panel.hidden = !reveal || item !== entry;
    }
    active = entry;
    window.dispatchEvent(new CustomEvent('5e:ai-workspace-activate', { detail: { panel: entry.panel, scope: entry.scope } }));
    renderNavigation();
    saveSelection();
  }
  let workflowNavigation = Promise.resolve();
  const workflowTargets = new Map();
  function navigateWorkflow(kind) {
    const next = workflowNavigation.catch(()=>{}).then(async () => {
      await ready;
      const preferred = workflowTargets.get(kind);
      let entry = preferred && entries.includes(preferred) && !preferred.disposed
        && (preferred.controller.workflowTask?.(kind) || (!preferred.tabs.length && preferred.panel.dataset.aiWorkflow === kind && !entries.some(item=>item.controller.workflowTask?.(kind)))) ? preferred
        : [...entries].reverse().find(item => item.controller.workflowTask?.(kind))
          || entries.find(item => !item.tabs.length && item.panel.dataset.aiWorkflow === kind);
      if (!entry) {
        if (entries.length === 1 && active.controller.setEmptyWorkflow(kind)) entry = active;
        else {
          entry = add(crypto.randomUUID(),false);
          await entry.controller.ready;
          entry.controller.setEmptyWorkflow(kind,{discardEmptyTask:true});
          saveRegistry();
        }
      }
      const id = entry.controller.workflowTask?.(kind);
      if (id) entry = await selectWorkspaceTask(entry,id) || entry;
      else activate(entry);
      workflowTargets.set(kind,entry);
      await entry.controller.open({reveal:true});
    });
    workflowNavigation = next;
    return next;
  }
  const taskMenu = createTaskContextMenu({
    copy: ({entry,taskId}) => {
      const item = entry.controller.taskImage(taskId);
      if (!item?.data) throw new Error('복사할 이미지가 없습니다.');
      return copyTaskImage(item.data);
    },
    send: async ({entry,taskId},kind) => {
      if (entry.disposed || !entry.controller.ownsTask(taskId) || entry.panel.dataset.aiSharingMode === 'view') return;
      const image = entry.controller.taskImage(taskId);
      if (!image?.data) throw new Error('보낼 이미지가 없습니다.');
      const target = add(crypto.randomUUID(),false);
      await target.controller.ready;
      await target.controller.open({references:[{dataUrl:image.data,name:image.name,sourceKind:'workbench',source:image.source}],conversionKind:kind,reveal:false});
      await target.controller.checkpointForClose();saveRegistry();activate(target);
      workflowTargets.set(kind,target);
    },
    duplicate: async ({entry,taskId}) => {
      if(entry.disposed || !entry.controller.ownsTask(taskId) || entry.panel.dataset.aiSharingMode==='view') return;
      const kind=taskKind(entry,taskId),image=entry.controller.taskImage(taskId);
      if(!image?.data) throw new Error('추가할 이미지가 없습니다.');
      const target=add(crypto.randomUUID(),false);
      try {
        await target.controller.ready;
        await target.controller.open({references:[{dataUrl:image.data,name:image.name,sourceKind:'workbench',source:image.source}],conversionKind:kind,reveal:false});
        await target.controller.checkpointForClose();saveRegistry();activate(target);workflowTargets.set(kind,target);
      } catch(error) {target.tabs=[];disposeEntry(target);throw error;}
    },
    remove: async ({entry,taskId}) => {
      if (entry.disposed || !entry.controller.ownsTask(taskId)) return;
      const owner=ownerFor(entry,taskId);
      if(batchJobs.some(job=>['running','queued'].includes(job.state)&&ownerKey(job.sourceSnapshot.owner)===ownerKey(owner))) return;
      activate(entry);await entry.controller.deleteTask(taskId);saveSelection();
    },
    onError: batchError,
  });
  function disposeEntry(entry) {
    if (!entry || entries.length <= 1 || entry.tabs.length || entry.panel.dataset.aiBusy === 'true') return false;
    // Retain the visible empty workspace so deleting its last task cannot
    // navigate to the other conversion workflow.
    if (active === entry && restored) return false;
    const reveal = entries.some(item=>!item.panel.hidden && !item.panel.inert);
    const index = entries.indexOf(entry);
    if (index < 0) return false;
    entry.disposed = true;
    entries.splice(index, 1);
    entry.panel.removeEventListener('input',entry.batchInputChanged);entry.panel.removeEventListener('change',entry.batchInputChanged);
    entry.controller?.dispose?.();
    entry.panel.aiWorkbench?.dispose?.();
    if (entry.panel !== original) entry.panel.remove();
    else entry.panel.id = `ai-workspace-${entry.scope || 'legacy'}`;
    if (active === entry) active = entries.find(item => item.tabs.length) || entries[0];
    activate(active,{reveal});
    saveRegistry();
    return true;
  }
  async function selectWorkspaceTask(entry, taskId, reveal = true) {
    const sourceExists = () => !entry.disposed && entries.includes(entry) && entry.controller.ownsTask(taskId);
    if (!sourceExists()) return;
    const sequence = reveal ? ++selectionSequence : selectionSequence;
    if (entry.controller.activeTask() === taskId || !entry.controller.snapshotTask) {
      if (reveal) { activate(entry); entry.controller.selectTask(taskId); saveSelection(); }
      return entry;
    }
    const key = `${entry.scope}:${taskId}`;
    let pending = pendingSelections.get(key);
    if (!pending) {
      pending = (async () => {
        const snapshot = await entry.controller.snapshotTask(taskId);
        if (!sourceExists()) throw new DOMException('삭제된 작업입니다.', 'AbortError');
        if(!reveal && batchDisposed)throw new Error('작업 대기열이 종료되었습니다.');
        const target = add(crypto.randomUUID(), false);
        try {
          await target.controller.importTaskSnapshot(snapshot, entry.panel.dataset.aiSharingMode);
          if (!sourceExists()) throw new DOMException('삭제된 작업입니다.', 'AbortError');
          if(!reveal && batchDisposed)throw new Error('작업 대기열이 종료되었습니다.');
          const transfer = { taskId, from: entry.scope, to: target.scope };
          writeTransfers([...readTransfers(), transfer]);
          // Register the durable destination before removing the source. A restart can finish this receipt.
          localStorage.setItem(registryKey, JSON.stringify(entries.filter(item => item.panel !== original).map(item => item.scope).filter(Boolean)));
          await entry.controller.removeTransferredTask(taskId);
          writeTransfers(readTransfers().filter(record => record.to !== target.scope));
          return target;
        } catch (error) {
          target.tabs = [];
          disposeEntry(target);
          writeTransfers(readTransfers().filter(record => record.to !== target.scope));
          throw error;
        }
      })();
      pendingSelections.set(key, pending);
    }
    try {
      const target = await pending;
      if (target.disposed || !target.controller.ownsTask(taskId)) return;
      if (reveal && sequence === selectionSequence) { activate(target); saveSelection(); }
      return target;
    } catch (error) {
      if (!reveal) throw error;
      if (!sourceExists()) return;
      window.alert(`작업을 열지 못했습니다. 원래 작업은 유지됩니다: ${error.message}`);
    } finally {
      pendingSelections.delete(key);
    }
  }
  function renderNavigation() {
    // Hidden workspaces retain their cards; only the visible navigation needs reconciliation.
    if(restored) for(const [kind,selection] of workflowSelections)for(const selected of selection.values()) {
      const entry=resolveOwner(selected);
      if(!entry || taskKind(entry,selected.taskId)!==kind)selection.select(selected,{toggle:true});
    }
    const owner = active;
    if (!owner || owner.disposed) return;
    const list = owner.panel.querySelector('[data-ai-tab-list]');
    if (!list) return;
    const retainedAddTask = list.querySelector(':scope > .ai-task-add');
    const existing = new Map([...list.querySelectorAll(':scope > .ai-task-tab[data-ai-workspace-link]')]
      .map(row => [`${row.dataset.aiWorkspaceLink}:${row.dataset.tabId}`, row]));
    const retained = new Set();
    let position = 0;
    for (const entry of entries) {
      for (const source of entry.tabs || []) {
        const taskId = source.dataset.tabId;
        if(taskKind(entry,taskId)!==workflowKind())continue;
        const key = `${entry.scope || 'legacy'}:${taskId}`;
        const batchOwner=ownerFor(entry,taskId);
        const batchSelected=selectedTasks.values().some(owner=>ownerKey(owner)===ownerKey(batchOwner));
        let row = existing.get(key);
        if (!row) {
          row = source.cloneNode(true);
          row.dataset.aiWorkspaceLink = entry.scope || 'legacy';
        }
        retained.add(row);
        const select = row.querySelector('.ai-task-tab-select');
        const sourceSelect = source.querySelector('.ai-task-tab-select');
        const selected = entry === active && entry.controller?.activeTask() === taskId;
        row.classList.toggle('is-on', selected);
        row.classList.toggle('is-batch-selected', batchSelected);
        row.dataset.aiBatchSelected=String(batchSelected);
        row.dataset.workState = source.dataset.workState || 'idle';
        row.title = source.title || source.textContent.replace('×', '').trim();
        const job = batchJobs.find(candidate => ownerKey(candidate.sourceSnapshot?.owner) === ownerKey(batchOwner)
          && ['queued', 'running', 'failed'].includes(candidate.state));
        row.dataset.aiGenerationActive = String(job?.state === 'running' || row.dataset.workState === 'busy');
        if (job) row.dataset.aiWorkspaceJob = job.id;
        else delete row.dataset.aiWorkspaceJob;
        for (const selector of ['.ai-task-tab-title', '.ai-task-tab-time']) {
          const next = selector === '.ai-task-tab-time' && job?.state === 'queued'
            ? '실행 대기' : source.querySelector(selector)?.textContent || '';
          const node = row.querySelector(selector);
          if (node && node.textContent !== next) node.textContent = next;
        }
        const oldIcon = row.querySelector('.ai-task-tab-status');
        const newIcon = source.querySelector('.ai-task-tab-status');
        if (oldIcon?.outerHTML !== newIcon?.outerHTML) {
          oldIcon?.remove();
          if (newIcon) row.prepend(newIcon.cloneNode(true));
        }
        if (select) {
          select.disabled = !entry.ready;
          select.setAttribute('aria-pressed', String(selected));
          select.setAttribute('aria-label', sourceSelect?.getAttribute('aria-label') || row.title);
          select.onclick = event => {
            const toggle=event.metaKey || event.ctrlKey;
            selectedTasks.select(batchOwner,{toggle}); preparedLaunch=null;
            if (toggle) renderNavigation(); else void selectWorkspaceTask(entry,taskId);
          };
          select.oncontextmenu = null;
          select.onkeydown = event => {
            if (event.key===' ' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); selectedTasks.select(batchOwner,{toggle:true});preparedLaunch=null;renderNavigation();return; }
            if (!['Home', 'End', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
            const controls = [...list.querySelectorAll(':scope > .ai-task-tab .ai-task-tab-select:not(:disabled)')];
            const index = controls.indexOf(select);
            const next = event.key === 'Home' ? controls[0] : event.key === 'End' ? controls.at(-1)
              : controls[(index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : controls.length - 1)) % controls.length];
            if (next) { event.preventDefault(); next.focus(); }
          };
        }
        const openTaskMenu = event => taskMenu.open(event,{entry,taskId},{
          canCopy:!!entry.controller.taskImage(taskId)?.data,
          readOnly:entry.panel.dataset.aiSharingMode==='view',
          running:row.dataset.aiGenerationActive==='true' || job?.state==='queued',
        });
        row.oncontextmenu = openTaskMenu;
        row.onkeydown = event => {
          if (event.key==='ContextMenu' || (event.shiftKey&&event.key==='F10')) openTaskMenu(event);
          if (event.key==='Delete' && event.target===select) {event.preventDefault();event.stopPropagation();void taskMenuDelete();}
        };
        const taskMenuDelete=async()=>{if(!job || !['running','queued'].includes(job.state)){activate(entry);await entry.controller.deleteTask(taskId);}};
        let jobAction = row.querySelector('.ai-task-job-action');
        if (job) {
          if (!jobAction) {
            jobAction = document.createElement('button');
            jobAction.type = 'button';
            jobAction.className = 'ai-task-job-action';
            row.append(jobAction);
          }
          const action = job.state === 'failed' ? 'retry' : 'cancel';
          jobAction.dataset.aiWorkspaceJobAction = action;
          jobAction.textContent = action === 'retry' ? '↻' : '■';
          jobAction.setAttribute('aria-label', `${source.querySelector('.ai-task-tab-title')?.textContent || taskId} ${action === 'retry' ? '다시 시도' : '변환 취소'}`);
          jobAction.title = action === 'retry' ? '변환 다시 시도' : '변환 취소';
          jobAction.onclick = async event => {
            event.stopPropagation();
            jobAction.disabled = true;
            try { await workspaceBatch[action](job.id); }
            catch (error) { batchError(error); }
            finally { await refreshBatch(); }
          };
        } else jobAction?.remove();
        if (list.children[position] !== row) list.insertBefore(row, list.children[position] || null);
        position += 1;
      }
    }
    for (const child of [...list.children]) if (!retained.has(child) && child !== retainedAddTask) child.remove();
    if (retainedAddTask && list.lastElementChild !== retainedAddTask) list.append(retainedAddTask);
    renderBatchControls();
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
    const entry = { scope, panel, controller: null, tabs: [], ready: false, disposed: false };
    entries.push(entry);
    entry.controller = initialize(state, {
      materializeCandidate,
      panel, clientScope: scope, desktop: createTaskBridge(window.fiveEDesktop || window.fiveEWebAI, scope),
      resumeAfterLogin: async ({ signal } = {}) => {
        if (signal?.aborted || entry.disposed) throw new DOMException('로그인이 취소되었습니다.', 'AbortError');
        activate(entry);
        await entry.controller.open({ reveal: true });
      },
      exportCollection, clearCollection, selectCollection, launchSelected, selectedTaskCount: () => selectedTasks.values().length, cancelWorkspaceJob: context=>workspaceBatch.cancel(context.jobId).then(refreshBatch).catch(batchError),
      newWorkspace: () => {
        const kind=workflowKind(),next=add(crypto.randomUUID(),false);
        void next.controller.ready.then(()=>{next.controller.setEmptyWorkflow(kind);saveRegistry();activate(next);workflowTargets.set(kind,next);});
        return next.scope;
      },
      switchWorkflow: navigateWorkflow,
      workspaceEmpty: () => {
        if (disposeEntry(entry)) return;
        const kind=entry.panel.dataset.aiWorkflow;
        const next = entries.find(item => item !== entry && item.controller.workflowTask?.(kind));
        workflowTargets.set(kind,next || entry);
        if (!clearing) activate(next || entry);
        saveRegistry();
      },
      navigationChanged: tabs => {
        if (entry.disposed || !entries.includes(entry)) return;
        if (tabs) entry.tabs = tabs;
        renderNavigation();
        saveSelection();
      },
    });
    entry.batchInputChanged=()=>{preparedLaunch=null;};
    panel.addEventListener('input',entry.batchInputChanged);
    panel.addEventListener('change',entry.batchInputChanged);
    setupWorkbench(panel);
    entry.controller.ready.then(() => {
      if (entry.disposed || !entries.includes(entry)) return;
      entry.ready = true;
      if (show) activate(entry); else renderNavigation();
    }, () => {
      if (!entry.disposed && entries.includes(entry)) renderNavigation();
    });
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
  const initialEntry = active;
  let initialReferenceTargetAvailable = true;
  try {
    const saved = freshStart ? [] : JSON.parse(localStorage.getItem(registryKey) || '[]');
    for (const scope of saved) if (typeof scope === 'string' && /^[a-f0-9-]{36}$/.test(scope) && scope !== primaryScope) add(scope, false);
  } catch { /* The original workspace remains available if the registry is unreadable. */ }
  const ready = Promise.all(entries.map(e => e.controller.ready)).then(async () => {
    for (const transfer of readTransfers()) {
      const source = entries.find(entry => entry.scope === transfer.from);
      const destination = entries.find(entry => entry.scope === transfer.to);
      if (!destination?.controller.ownsTask(transfer.taskId)) continue;
      if (source?.controller.ownsTask(transfer.taskId)) await source.controller.removeTransferredTask(transfer.taskId);
      writeTransfers(readTransfers().filter(record => record.to !== transfer.to));
    }
    for (const entry of [...entries]) {
      if (entry.panel !== original && !entry.tabs.length) disposeEntry(entry);
    }
    let saved;
    try { saved = JSON.parse(localStorage.getItem(selectionKey) || 'null'); } catch {}
    const target = entries.find(e => e.scope === saved?.scope && e.controller.ownsTask(saved?.taskId));
    if (target) {
      active = target;
      target.controller.selectTask(saved.taskId);
    }
    if (!active.tabs.length) active = entries.find(e => e.tabs.length) || active;
    restored = true;
    if(active.controller.activeTask())selectedTasks.select(ownerFor(active,active.controller.activeTask()));
    const store=createBatchStore({read:key=>idbGet(`ai-workspace-batch:${key}`),write:(key,value)=>idbSet(`ai-workspace-batch:${key}`,value)});
    workspaceBatch=createWorkspaceBatch({store,serviceCap,scope:{sessionId:'5e',workspaceId:`workspace-selection:${primaryScope||'main'}`},
      preflight: entry=>resolveOwner(entry)?.controller.preflightBatch(entry) || (!resolveOwner(entry)?'원래 작업을 찾을 수 없습니다.':null),
      runner:{start:async(context,emit)=>{
        const source=resolveOwner(context.owner);
        if (!source) throw new Error('원래 작업을 찾을 수 없습니다.');
        const target=await selectWorkspaceTask(source,context.owner.taskId,false);
        if (context.signal.aborted) throw new Error('작업이 취소되었습니다.');
        return target.controller.runBatch(context,async event=>{const result=await emit(event);void refreshBatch().catch(batchError);return result;});
      },interrupt:context=>resolveOwner(context.owner)?.controller.interruptBatch(context)},
      commit:(context,result)=>{
        const target=resolveOwner(context.owner);if(!target)throw new Error('원래 작업을 찾을 수 없습니다.');
        return target.controller.commitBatch(context,result);
      },onError:batchError});
    try { await workspaceBatch.recover();batchReady=true;await refreshBatch(); } catch(error){batchError(error);}
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
        referenceRole: reference.referenceRole,
        ...(reference.sourceTextCandidates ? {sourceTextCandidates:structuredClone(reference.sourceTextCandidates)} : {}),
      };
    });
  };
  return {
    examTaskNames: () => entries.flatMap(entry => entry.controller?.examTaskNames?.() || []),
    renameExamTask: (link,name) => {for (const entry of entries) entry.controller?.renameExamTask?.(link,name);},
    activeExamTask: () => ({scope:active.scope || '',taskId:active.controller.activeTask()}),
    captureExamTask: async (taskId = null, scope = null) => {
      await ready;
      const entry = taskId ? entries.find(entry => (scope === null || (entry.scope || '') === scope) && entry.controller.ownsTask(taskId)) : active;
      if (!entry) return null;
      const id = taskId || entry.controller.activeTask();
      if (!id) return null;
      const snapshot = await entry.controller.examTaskSnapshot(id);
      return {scope:entry.scope || '',taskId:id,snapshot};
    },
    restoreExamTask: async (context, {candidateId = null} = {}) => {
      await ready;
      validateWorkspaceCandidates(context?.snapshot);
      if (context.snapshot.tabs.length !== 1 || context.snapshot.tabs[0].id !== context.taskId) throw new TypeError("Invalid exam task context");
      const link = context.snapshot.tabs[0].examLink;
      let entry = [...entries].reverse().find(entry => {
        if (!entry.controller.ownsTask(context.taskId)) return false;
        const current = entry.controller.examTaskLink(context.taskId);
        return link ? current?.tabId === link.tabId && current.assetId === link.assetId : (entry.scope || '') === context.scope;
      });
      if (!entry) {
        entry = add(crypto.randomUUID(), false);
        await entry.controller.importSharingSnapshot(structuredClone(context.snapshot), null);
        saveRegistry();
      }
      activate(entry);
      await entry.controller.open({taskId:context.taskId,candidateId});
      return {scope:entry.scope || '',taskId:context.taskId,snapshot:await entry.controller.examTaskSnapshot(context.taskId)};
    },
    workspaceBatchState: () => structuredClone(batchJobs),
    dispose: () => batchDisposal ||= (async()=>{ batchDisposed=true;taskMenu.dispose();clearTimeout(batchTimer);await workspaceBatch?.dispose();for(const entry of entries){entry.panel.removeEventListener('input',entry.batchInputChanged);entry.panel.removeEventListener('change',entry.batchInputChanged);entry.controller.dispose();} })(),
    sharingHasViewOnly: () => entries.some(entry => entry.panel.dataset.aiSharingMode === 'view'),
    sharingSnapshot: async () => {
      await ready;
      return { workspaces: await Promise.all(entries.map(entry => entry.controller.sharingSnapshot())), activeWorkspace: entries.indexOf(active) };
    },
    restoreProjectSnapshot: async document => {
      await ready;
      if (!Array.isArray(document?.workspaces) || document.workspaces.some(snapshot=>!recoverTaskWorkspaceSnapshot(snapshot))) throw new Error('AI 작업 원본이 올바르지 않습니다.');
      const restored=[];
      for (const snapshot of document.workspaces) {
        if (!snapshot.tabs.length) continue;
        // Import in independent scopes so another open task never loses work.
        const linked=snapshot.tabs.find(t=>t.examLink);
        let entry=linked?[...entries].reverse().find(e=>{const l=e.controller.examTaskLink(linked.id);return l?.tabId===linked.examLink.tabId && l.assetId===linked.examLink.assetId;}):null;
        let merged=structuredClone(snapshot);
        if(entry) {
          const live=await entry.controller.sharingSnapshot(), ids=new Set(merged.tabs.map(t=>t.id));
          merged.tabs.push(...live.tabs.filter(t=>!ids.has(t.id)));
        } else entry=add(crypto.randomUUID(),false);
        await entry.controller.importSharingSnapshot(merged,null);
        restored.push(entry);
      }
      if(restored.length) activate(restored[Math.min(restored.length-1,Math.max(0,document.activeWorkspace||0))]);
      saveRegistry();
    },
    openSharingDocument: async (id, document) => {
      await ready;
      const imports = await idbGet('sharing:imports') || {};
      const existing = imports[id]?.scopes?.map(scope => entries.find(entry => entry.scope === scope) || (/^[a-f0-9-]{36}$/.test(scope) ? add(scope,false) : null));
      if (existing?.length && existing.every(Boolean)) {
        await Promise.all(existing.map(entry=>entry.controller.ready));
        saveRegistry();
        activate(existing.includes(active)?active:existing[Math.min(existing.length - 1, document.activeWorkspace)]);
      } else {
        const created = [];
        for (const snapshot of document.workspaces) {
          const entry = add(crypto.randomUUID(), false);
          await entry.controller.importSharingSnapshot(snapshot, document.mode);
          created.push(entry);
        }
        await idbSet('sharing:imports', {...imports, [id]: {scopes:created.map(entry => entry.scope)}});
        saveRegistry();
        activate(created[document.activeWorkspace]);
      }
      return active.controller.open({reveal:true});
    },
    open: async options => {
      await ready;
      const selected = state.get().objects.find(o => state.get().selectedIds?.includes(o.id) && o.aiTaskId);
      const hasReference = options?.reference || options?.references?.length;
      const owner = !hasReference && entries.find(e => e.controller.ownsTask(selected?.aiTaskId));
      const target = owner || (hasReference && active.panel.dataset.aiSharingMode === 'view' ? add(crypto.randomUUID()) : active);
      if (hasReference) saveRegistry();
      activate(target);
      return active.controller.open(options);
    },
    close: () => active.controller.close(),
    attachReference: (...args) => active.controller.attachReference(...args),
    openIndependentReferences: async ({ references, prompt = '', startGeneration = false, placement = 'separate', groups = null, reveal = true, importId = null, conversionKind = 'image' } = {}) => {
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
      const journalKey = importId ? `ai-reference-import:${importId}` : null;
      let journal = journalKey ? await idbGet(journalKey) : null;
      if (journal && (journal.version !== 1 || journal.scopes?.length !== groupedSnapshots.length)) {
        throw new Error('저장된 이미지 전달 정보가 현재 작업과 다릅니다.');
      }
      let reusable = null;
      if (!journal && initialReferenceTargetAvailable) {
        initialReferenceTargetAvailable = false;
        if (!initialEntry.disposed && initialEntry.panel.dataset.aiSharingMode !== 'view') {
          const snapshot = await initialEntry.controller.sharingSnapshot();
          const checkpoint = await initialEntry.controller.checkpointForClose();
          if (checkpoint.recovered && !checkpoint.hasWork && snapshot.tabs.length <= 1 && snapshot.taskTabSerial <= 1) reusable = initialEntry;
        }
      }
      if (journalKey && !journal) {
        // Reserve stable destinations before the first pixel import. A reload
        // between a task checkpoint and its receipt can then find that task.
        journal = { version: 1, scopes: groupedSnapshots.map((_, index) => index === 0 && reusable ? reusable.scope : crypto.randomUUID()) };
        await idbSet(journalKey, journal);
      }
      const imported = [];
      const transferredReferenceIndices = [];
      for (const [index, group] of groupedSnapshots.entries()) {
        const entry = journal
          ? entries.find(item => item.scope === journal.scopes[index]) || add(journal.scopes[index], false)
          : index === 0 && reusable ? reusable : add(crypto.randomUUID(), false);
        const created = entry !== reusable;
        saveRegistry();
        try {
          await entry.controller.ready;
          const previous = journal ? await entry.controller.sharingSnapshot() : null;
          const previousAttachments = previous?.tabs.flatMap(tab => tab.attachments || []) || [];
          const alreadyImported = journal && group.every(reference => previousAttachments.some(item => item.data === reference.dataUrl));
          if (!alreadyImported) {
            if (journal && previousAttachments.length) throw new Error('일부 이미지가 이미 저장되어 있습니다. 기존 작업대를 확인해 주세요.');
            await entry.controller.open({ references: group, placement: group.length > 1 ? 'together' : 'separate', reveal: false, prompt, conversionKind, startGeneration: startGeneration === true });
          }
          const snapshot = await entry.controller.sharingSnapshot();
          const attachments = snapshot.tabs.flatMap(tab => tab.attachments || []);
          const accepted = group.filter(reference => attachments.some(item => item.data === reference.dataUrl));
          const checkpoint = await entry.controller.checkpointForClose();
          if (!checkpoint.recovered) throw new Error('참고 이미지가 저장되지 않았습니다. 다시 시도해 주세요.');
          const referenceIndices = accepted.map(reference => snapshots.indexOf(reference));
          transferredReferenceIndices.push(...referenceIndices);
          if (accepted.length !== group.length) throw new Error('일부 참고 이미지를 AI 작업실에 불러오지 못했습니다.');
          imported.push({ scope: entry.scope, name: group[0].name, referenceIndices });
        } catch (cause) {
          let checkpoint;
          try { checkpoint = await entry.controller.checkpointForClose(); } catch { /* Keep the original storage failure. */ }
          if (checkpoint?.recovered && !checkpoint.hasWork) {
            if (created) {
              await entry.controller.importSharingSnapshot({ key: 'workspace', tabs: [], activeTaskTabId: null, taskTabSerial: 0, imageSerial: 0 });
              disposeEntry(entry);
            } else initialReferenceTargetAvailable = true;
          }
          saveRegistry();
          renderNavigation();
          const error = new Error(cause?.message || String(cause), { cause });
          error.transferredReferenceIndices = [...new Set(transferredReferenceIndices)];
          throw error;
        }
        saveRegistry();
        if (reveal) activate(entry);
      }
      return imported;
    },
    revealImportedReferences: async (receipt, { signal } = {}) => {
      await ready;
      if (signal?.aborted) throw new DOMException('로그인이 취소되었습니다.', 'AbortError');
      if (!Array.isArray(receipt) || !receipt.length) throw new Error('이어갈 이미지 작업대를 찾지 못했습니다.');
      const targets = receipt.map(item => {
        if (typeof item.scope !== 'string' || item.scope !== '' && !/^[a-f0-9-]{36}$/i.test(item.scope)) throw new Error('저장된 작업대 주소가 올바르지 않습니다.');
        return entries.find(entry => entry.scope === item.scope) || add(item.scope, false);
      });
      await Promise.all(targets.map(entry => entry.controller.ready));
      if (signal?.aborted) throw new DOMException('로그인이 취소되었습니다.', 'AbortError');
      if (targets.some(entry => !entry.tabs.length)) throw new Error('저장된 작업대에 이미지가 없습니다.');
      saveRegistry();
      activate(targets.at(-1));
      await active.controller.open({ reveal: true });
      return receipt;
    },
    prepareNewWork: async () => {
      await ready;
      await Promise.all(entries.map(entry => entry.controller.checkpointForClose()));
      const next = add(crypto.randomUUID(), false);
      await next.controller.ready;
      saveRegistry();
      return () => activate(next, { reveal: false });
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
