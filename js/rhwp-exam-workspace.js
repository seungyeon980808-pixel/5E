import { initPaletteWorkspace } from './hwp-palette/ui.js?v=1.7.0-hwppalette-rhwp';
import { installExamModes } from './rhwp-exam-modes.js';
import { parseFiveEProject } from './fivee-project.js?v=1.7.0-four-session-integration';
import { appSwitchHtml } from './app-switch.js?v=1021-fix';
import {buildQuestionHtml,verifyNativeQuestion} from '../assets/exampool/sheet/handoff.js?v=1014-hwp-sheet';
import {openApprovedQuestion,nativeInsertOptions,sameColumnGeometry} from '../assets/exampool/sheet/native-transfer.js?v=1014-compact-panel';

import { PictureSettings, ExamRegionSurface } from './rhwp-exam-picture-controls.js?v=1.7.0-four-session-integration';
import { validRegion, DEFAULT_PICTURE_LAYOUT } from './rhwp-exam-region.js?v=1.7.0-four-session-integration';
import { RhwpExamBridge } from './rhwp-exam-bridge.js?v=1014-question-page';
import { buildExamProject, parseExamProject, readExamDraft, writeExamDraft, listExamDrafts, EXAM_PROJECT_MAX_BYTES } from './rhwp-exam-project.js?v=1.7.0-four-session-integration';
import { embedEditablePng, readEditablePng, validateFigureRender, EDITABLE_PNG_MAX_BYTES } from './editable-png.js?v=1.7.0-four-session-integration';
import { normalizeExamFigure, forkExamFigure, validateExamLink, validateExamContext, renameExamFigure } from './rhwp-exam-links.js?v=1.7.0-four-session-integration';
import { createExamSourceTabs, createExamDraftChecker } from './rhwp-exam-source-tabs.js?v=1.7.0-four-session-integration';
import { annotationsFor, getAnnotationPage, mergeAnnotationPatch, validateAnnotationPatch } from './rhwp-exam-annotations.js?v=1.7.0-four-session-integration';
import { ExamInlineEditor, chooseInlineCrop } from './rhwp-exam-inline-editor.js?v=1.7.0-four-session-integration';
import { getContentBounds } from './svg-export.js?v=1.7.0-four-session-integration';
import { registerTopMenu } from './top-menu.js?v=1.7.0-four-session-integration';
import { showExamDocumentChoice } from './ui-dialogs.js?v=1.7.0-four-session-integration';
import { consumeConfirmationPress } from './ui-confirm-key.js?v=1.7.0-four-session-integration';
import { syncAppLock } from './app-lock.js?v=1021-lock';

const clone = value => JSON.parse(JSON.stringify(value));
const safeName = name => (name.trim() || '새 시험지').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
const pictureKey=ref=>ref ? JSON.stringify([ref.sec,ref.ppi,ref.ci,(ref.cellPath || []).map(step=>[
  step.controlIndex ?? step.controlIdx,step.cellIndex ?? step.cellIdx,step.cellParaIndex ?? step.cellParaIdx,
]),ref.headerFooter || null]) : null;

export function initRhwpExamWorkspace(state, services) {
  const { serialize, applyLoaded, prepareLoadedProject, ensureEmbeddedFonts, rasterizeExportCanvas, insertPngPhys } = services;
  let bridge, opening, editing, pendingSource, placement, repairPromise, repairing = false, incomingRequest = 0, busy = false, initializing = true, stamp = 0, timer, restoredDraft, connectedAi;
  let resolveAi;
  const aiReady = new Promise(resolve => {resolveAi = resolve;});
  const tabs = createExamSourceTabs(state,{...services,getAiPanel:() => connectedAi});
  const drawingHasDraft = createExamDraftChecker(prepareLoadedProject);
  let latestWorkspace;
  let pendingDocumentInsertion = null;
  let inlineSession, inlineQueue = Promise.resolve(), inlineFailure;
  const inlineRecoveries=new Map();
  let projectId = crypto.randomUUID(), documentGeneration, restoringWorkspace=false, workspaceStamp=0;
  let figures = new Map(), savedToken = '', saveQueue = Promise.resolve();
  let composing = false, figureFrame = 0, maintenanceTimer, maintenancePending = false;
  const compositionActive = () => composing || !!bridge?.input?.isComposing;
  const panel = document.createElement('section');
  panel.id = 'rhwp-exam-workspace';
  panel.hidden = true;
  panel.setAttribute('aria-label', '시험지 작업 공간');
  panel.setAttribute('role', 'dialog');
  panel.innerHTML = `
    <div class="exam-topbar"><div class="exam-top-cell"><button type="button" class="exam-panel-toggle" data-exam-panel aria-pressed="true" aria-label="왼쪽 칸 접기" title="왼쪽 칸 접기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path class="exam-panel-fill" d="M3.8 4.8h5.2v14.4H3.8z"/><path d="M9 4v16"/></svg></button><span class="exam-brand app-brand" title="5E_hwp · 조판"><b class="app-brand-mark">5E</b><span class="app-brand-name">_hwp</span></span></div><div class="exam-heading"><nav class="app-switch" aria-label="5E 프로그램">${appSwitchHtml('hwp')}</nav>
      <span class="exam-top-sep" aria-hidden="true"></span><button type="button" class="exam-history" data-exam-action="undo" title="되돌리기 (⌘Z)" aria-label="되돌리기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button><button type="button" class="exam-history" data-exam-action="redo" title="다시 실행 (⇧⌘Z)" aria-label="다시 실행"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg></button><span class="exam-top-sep" aria-hidden="true"></span>
      <nav class="exam-actions" aria-label="시험지 작업">
        <button type="button" data-exam-action="close" title="그림 편집기로 돌아가기 (Esc)" aria-label="그림 편집기로 돌아가기">←</button>
        <div class="exam-menu">
          <button type="button" data-exam-menu="file" aria-haspopup="menu" aria-expanded="false" aria-controls="exam-file-menu">파일 <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"><path d="m6 8 4 4 4-4"/></svg></button>
          <div id="exam-file-menu" class="exam-menu-popup" role="menu" hidden>
            <button type="button" role="menuitem" data-exam-action="new">새 시험지</button>
            <button type="button" role="menuitem" data-exam-action="open-hwp">한글 파일 열기…</button>
            <button type="button" role="menuitem" data-exam-action="open-project">프로젝트 열기… (.5e)</button>
            <button type="button" role="menuitem" data-exam-action="open-exampool">ExamPool 시험지 열기…</button>
            <button type="button" role="menuitem" data-exam-action="open-png">그림 원본 열기</button>
            <div class="exam-menu-divider" role="separator"></div>
            <button type="button" role="menuitem" data-exam-action="save">프로젝트 저장 (.5e)</button>
            <button type="button" role="menuitem" data-exam-action="export-hwpx">한글 저장 (.hwpx)</button>
            <button type="button" role="menuitem" data-exam-action="export-hwp">한글 저장 (.hwp)</button>
            <button type="button" role="menuitem" data-exam-action="export-png">선택 그림 PNG 저장</button>
            <div class="exam-menu-divider" role="separator"></div>
            <button type="button" role="menuitem" data-exam-action="demo">연동 예시 열기</button>
            <button type="button" role="menuitem" data-exam-action="restore" hidden>자동 저장 이어서</button>
          </div>
        </div>

        <button type="button" class="structure-lock" data-exam-action="structure-lock" aria-pressed="false" title="구조 잠금 · 켜면 글만 고치고, 끄면 표·그림의 크기와 틀도 고칩니다"><svg class="lock-on" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg><svg class="lock-off" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/></svg>구조 잠금</button>
      </nav></div></div>
    <div class="exam-body"><aside class="exam-sidebar"><header class="exam-header">
      <input id="exam-name" value="새 시험지" maxlength="200" aria-label="시험지 이름">
      <div class="exam-placement" hidden><img alt="보낼 영역 미리보기"><div><strong>삽입할 위치를 선택하세요</strong><span data-placement-hint>본문이나 표 셀에서 위치를 클릭한 뒤 확인하세요.</span></div><button type="button" data-exam-action="cancel-placement">취소</button><button type="button" data-exam-action="confirm-placement" class="exam-primary" disabled>확인</button></div>
    </header>
    <h2>문서의 그림</h2>
      <p class="exam-hint" hidden>더블클릭: 라벨 · 원본 편집: 전체 그림</p>
      <div id="exam-figures"></div>
    <footer class="exam-footer"><span id="exam-status" role="status" aria-live="polite">준비 중</span></footer></aside><div id="exam-studio"><div class="exam-loading">시험지 편집기를 준비합니다…</div></div></div>
    <input id="exam-hwp-file" type="file" accept=".hwp,.hwpx" hidden>
    <input id="exam-project-file" type="file" accept=".5e,.5exam,.json" hidden>
    <input id="exam-png-file" type="file" accept=".png" hidden>`;
  document.body.append(panel);
  if (window.fiveEExam) {
    panel.querySelector('[data-exam-action="open-png"]').hidden = true;
  }
  const palette = initPaletteWorkspace(panel, {
    getBridge:() => bridge,run,notify:(...args)=>message(...args),download,
    withBusy:async task => { if (busy) throw new Error('진행 중인 작업이 끝난 뒤 다시 실행해주세요.');setBusy(true);try{return await task();}finally{setBusy(false);} },
    replaceDocument:async(bytes,name,anchor)=>{if(palette.contentEditing)throw new Error('조각 편집을 저장하거나 돌아간 뒤 새 양식을 열어주세요.');await stableSave();await loadDocument(bytes,`${safeName(name)}.hwpx`);if(anchor&&!anchor.hf)bridge.input.cursor.moveTo(anchor);},
    beginContentEdit:async(bytes,name)=>{if(palette.contentEditing)throw new Error('지금 편집하는 조각을 먼저 저장하거나 돌아가주세요.');const previous=new Uint8Array(await (await stableSave()).arrayBuffer());await loadDocument(bytes,`${safeName(name)}.hwpx`);return async()=>{await stableSave();await loadProject(previous);};},
  });
  // A small public capability surface also makes standalone port regressions
  // exercise the same instances the user operates.
  window.fiveEHwpPalette = palette; // 화면 색(graphite-shell)의 window.fiveEPalette와 이름이 겹쳐 덮어쓰이던 것을 피함
  // 도구 모드 3개(기본·집중·없음)와 집중 도구 줄. 동작(actions)·그림 설정은 아래에서 정의되므로 누를 때 찾는다.
  const toolModes = installExamModes(panel, { getBridge:() => bridge, palette, message:(...args) => message(...args), run:task => run(task),
    actions:{ edit:() => actions.edit(), insertFromImage:() => actions['insert-from-image']() }, download:(blob,name) => download(blob,name), documentName:() => nameInput.value.trim(), loadExam:async(bytes,title) => { if (bridge?.input) await stableSave(); await loadDocument(new Uint8Array(bytes),`${String(title||'시험지').replace(/[\\/:*?"<>|]/g,' ').slice(0,180)}.hwpx`); }, openPictureSettings:anchor => openPictureSettings(anchor) });
  const nativeRegion = new ExamRegionSurface(document.body, {
    onSettings:anchor => openPictureSettings(anchor),onUndo:redo=>run(()=>{if(redo)bridge.input.performRedo();else bridge.input.performUndo();renderFigures();}), onError:error=>message(error.message,true),
  });
  const sourceRegion = new ExamRegionSurface(document.body, {
    source:true,onChange:bounds=>updateSourceRegion(bounds),onUndo:undoSourceRegion,onError:error=>message(error.message,true),
  });
  const bar=sourceRegion.heading;bar.id='exam-edit-bar';bar.hidden=true;
  bar.querySelector('.exam-edit-badge').id='exam-edit-name';
  const applySource=document.createElement('button');applySource.type='button';
  applySource.dataset.sourceApply='';applySource.className='exam-primary';applySource.textContent='문서에 반영';
  applySource.addEventListener('click',()=>void run(applyEdit));
  const returnSource=document.createElement('button');returnSource.type='button';returnSource.textContent='돌아가기';
  returnSource.addEventListener('click',()=>void run(returnFromEdit));
  bar.querySelector('.exam-region-actions').append(applySource,returnSource);
  const pictureSettings = new PictureSettings(document.body, {
    onApply:async(layout,context)=>{if(busy)return false;setBusy(true);try{await applyLayout(layout,context);return true;}finally{setBusy(false);}},
    onError:error=>message(error.message,true),
  });
  const regionInspector=document.createElement('section');regionInspector.id='exam-region-inspector';regionInspector.hidden=true;
  regionInspector.innerHTML=`<h3>시험지에 보낼 영역</h3><div class="exam-region-fields">${['x','y','w','h'].map((k,i)=>`<label><span>${['X','Y','너비','높이'][i]}</span><input type="number" step="0.5" data-source-region="${k}" aria-label="보내는 영역 ${['X','Y','너비','높이'][i]}">mm</label>`).join('')}</div><div class="exam-region-fields">${['top','bottom','left','right'].map((k,i)=>`<label><span>${['위','아래','왼쪽','오른쪽'][i]} 여백</span><input type="number" step="0.5" data-source-padding="${k}" aria-label="그림 ${['위','아래','왼쪽','오른쪽'][i]} 여백">mm</label>`).join('')}</div><div class="exam-region-history"><button type="button" data-region-undo>영역 되돌리기</button><button type="button" data-region-redo>다시 실행</button></div><button type="button" data-source-recrop>영역 다시 드래그</button><button type="button" data-source-settings>문서 배치·간격</button><p>영역을 넓히면 원본 또는 빈 공간이 보입니다. 객체의 크기는 유지됩니다.</p><p data-region-status role="status" hidden></p>`;
  document.querySelector('#panel-right')?.prepend(regionInspector);
  let selectedRegionKey='',sourcePositionFrame=0;
  const nameInput = panel.querySelector('#exam-name');
  const status = panel.querySelector('#exam-status');
  const token = () => `${projectId}:${bridge?.generation}:${bridge?.revision}:${stamp}:${workspaceStamp}`;
  const message = (text, error = false) => { status.textContent = text; status.dataset.error = String(error); bar.title=text;if(editing){const note=regionInspector.querySelector('[data-region-status]');note.hidden=!error;note.textContent=error?text:'';} };
  const inlineEditor = new ExamInlineEditor(document.body, {
    onChange:queueInlineChange,
    onAction:name => run(() => inlineAction(name)),
    onError:error => message(error.message,true),
  });
  function syncBackground() {
    const modal = !panel.hidden && !editing;
    // 그림 화면·아래 막대 잠금은 app-lock.js가 출제 칸까지 함께 보고 정한다(여기서 직접 켜고 끄면 출제 칸 잠금을 풀어 버렸다).
    panel.dataset.modal = String(modal);
    syncAppLock();
    panel.setAttribute('aria-modal', String(modal));
    if (bridge?.editor.element) bridge.editor.element.inert = !!editing?.remote;
  }

  function setBusy(value) {
    busy = value;
    panel.setAttribute('aria-busy', String(value));
    panel.querySelectorAll('button').forEach(button => { button.disabled = value || !!editing; });
    nameInput.disabled = value || !!editing;
    panel.querySelectorAll('select').forEach(select => { select.disabled = value || !!editing; });
    [nativeRegion.root,sourceRegion.root,regionInspector,pictureSettings.root].forEach(root=>root.querySelectorAll('button,input,select').forEach(button=>{button.disabled=value;}));
    if(!value){if(editing)syncSourceControls();if(!pictureSettings.root.hidden)pictureSettings.refresh();}
    updatePlacement(); renderFigures();
  }
  // 닫을 때 휙 사라지지 않게 0.16초 흐려지며 사라진다(app-switch.css의 .app-leaving). 움직임 줄이기 설정이면 바로 닫는다.
  async function fadeOut(element) {
    if (element.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    element.classList.add('app-leaving');
    await new Promise(resolve => setTimeout(resolve, 160));
    element.classList.remove('app-leaving');
  }
  async function run(task) {
    if (busy) return;
    setBusy(true);
    try { await task(); }
    catch (error) { const text=error.message || '작업을 완료하지 못했습니다.';message(text,true);if(panel.hidden)void services.reportError?.(text); }
    finally { setBusy(false); }
  }
  const thumbnails = new Map(), remoteNames = new Map();
  const linkKey = link => `${link.tabId}:${link.assetId}`;
  let renderedFigures = '', syncingNames = false, namesSignature = '';
  const aiNames = new Map();
  function syncTabNames(origin = 'canvas') {
    if (syncingNames || window.fiveEExam) return;
    syncingNames = true;
    try {
      const aiTitles = connectedAi?.examTaskNames?.() || [];
      for (const {link,name} of aiTitles) {
        const key = linkKey(link), page = tabs.pageForLink(link);
        if (origin === 'ai' && aiNames.has(key) && aiNames.get(key) !== name && page && page.name !== name) {
          state.update(() => {page.name = name;});
        }
        aiNames.set(key,name);
      }
      const names = state.get().pages.filter(page => page.meta?.examLink).map(page => ({link:page.meta.examLink,name:page.name}));
      for (const {link,name} of names) {
        connectedAi?.renameExamTask?.(link,name);
        aiNames.set(linkKey(link),name);
      }
      const signature = JSON.stringify(names);
      if (signature === namesSignature) return;
      namesSignature = signature;
      connectedAi?.refreshExamLinks?.();
      for (const figure of figures.values()) {
        const name = tabs.pageForLink(figure.link)?.name;
        if (name && renameExamFigure(figure,name)) stamp++;
      }
      if (editing) bar.querySelector('#exam-edit-name').textContent = `${tabs.pageForLink(editing.figure.link)?.name || editing.figure.name} 편집 중`;
      renderFigures(); scheduleSave();
      void window.fiveEDesktop?.exam?.publishNames(names).catch(error => message(error.message,true));
    } finally {syncingNames = false;}
  }
  function refreshFigureNames() {
    for (const figure of figures.values()) {
      const name = window.fiveEExam ? remoteNames.get(linkKey(figure.link)) : tabs.pageForLink(figure.link)?.name;
      if (name && renameExamFigure(figure,name)) stamp++;
    }
  }
  function renderFigures() {
    if (compositionActive()) return;
    refreshFigureNames();
    const pictures = bridge?.documentPictures() || [], seen = new Set(), rows = [];
    for (const [index,picture] of pictures.entries()) {
      const figure = figures.get(picture.id);
      if (figure && seen.has(linkKey(figure.link))) continue;
      if (figure) seen.add(linkKey(figure.link));
      rows.push({figure,ref:picture.ref,id:figure?.id || `unlinked:${bridge.generation}:${pictureKey(picture.ref)}`,
        name:figure?.name || `그림 ${index+1}`,draft:figure ? hasDraft(figure) : false});
    }
    const selected = bridge?.selectedFigureId();
    const selectedRef=bridge?.input?.cursor?.getSelectedPictureRef(), selectedKey=pictureKey(selectedRef);
    syncPictureControls();
    const signature = JSON.stringify([rows.map(({id,name,figure,draft}) => [id,name,figure?.version,draft]),selectedKey,busy,!!editing]);
    if (signature === renderedFigures) return;
    renderedFigures = signature;
    const live = new Set(rows.map(({id}) => id));
    for (const [id,url] of thumbnails) if (!live.has(id)) {URL.revokeObjectURL(url);thumbnails.delete(id);}
    const list = panel.querySelector('#exam-figures'); list.replaceChildren();
    for (const {figure,ref,id,name,draft} of rows) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'exam-figure'; button.dataset.figureId = id;
      button.dataset.connection=figure ? 'linked' : 'unlinked';
      button.setAttribute('aria-label',`${name}${figure?' · 편집 탭에 연결됨':''}${draft?' · 미반영 수정':''}`);
      button.setAttribute('aria-current',String(figure ? figure.id===selected : selectedKey===pictureKey(ref)));
      button.title = `${name} · 선택 / 더블클릭하여 라벨 편집`;
      if (!thumbnails.has(id)) {
        const bytes = bridge.pictureBytes(ref);
        thumbnails.set(id,URL.createObjectURL(new Blob([bytes],{type:'image/png'})));
      }
      const image = document.createElement('img'); image.src = thumbnails.get(id); image.alt = ''; image.className = 'exam-figure-thumbnail';
      const text = document.createElement('div'); text.className = 'exam-figure-text';
      const title = document.createElement('strong'); title.textContent = name;
      const detail = document.createElement('span'); detail.textContent = draft ? '미반영 수정' : '';detail.hidden=!draft;
      text.append(title,detail); button.append(image,text); button.disabled = busy || !!editing;
      button.addEventListener('click',()=>{if(!busy){bridge.selectPicture(ref,{reveal:true});renderFigures();}});button.addEventListener('dblclick',()=>void run(()=>beginInline(figure?.id,ref)));list.append(button);
    }
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'exam-empty';
      empty.textContent = '한글 파일을 열거나 5E에서 그림을 보내세요.'; list.append(empty);
    }
  }
  // Update only the portable title metadata, retaining the exact bitmap and
  // native placement. A rename is not a new image revision or drawing undo step.
  function flushFigureNames() {
    refreshFigureNames();
    for (const {id,ref} of bridge.documentPictures()) {
      const figure = figures.get(id); if (!figure) continue;
      const bytes = bridge.pictureBytes(ref);
      const embedded = readEditablePng(bytes,prepareLoadedProject);
      if (!embedded || (embedded.name === figure.name && embedded.source.pages[0]?.name === figure.name && (!embedded.context?.ai || embedded.context.ai.snapshot.tabs[0].title === figure.name))) continue;
      const data = new Uint8Array(bytes), view = new DataView(data.buffer,data.byteOffset,data.byteLength);
      bridge.writeFigure(ref,{bytes:embedEditablePng(data,figure,prepareLoadedProject),pixelWidth:view.getUint32(16),pixelHeight:view.getUint32(20)},id);
    }
  }
  function hasDraft(figure) {
    if (inlineRecoveries.has(figure.id)) return true;
    const page=window.fiveEExam ? latestWorkspace?.drawing.pages.find(p=>p.meta?.examLink?.tabId===figure.link.tabId && p.meta.examLink.assetId===figure.link.assetId) : tabs.pageForLink(figure.link); if (!page) return false;
    const value=state.get();
    const current=window.fiveEExam || page.id!==value.activePageId ? page : {objects:value.objects,artboard:value.artboard};
    const ai=figure.context?.ai;
    const draft=ai?latestWorkspace?.ai?.workspaces.flatMap(w=>w.tabs).find(t=>t.id===ai.taskId && t.examLink?.tabId===figure.link.tabId):null;
    const fields=t=>t?{input:t.input,generated:t.generated,attachments:t.attachments,selectedCandidateId:t.selectedCandidateId,conversationMessages:t.conversationMessages}:null;
    return drawingHasDraft(current,page.meta,figure) || !!(draft && JSON.stringify(fields(draft))!==JSON.stringify(fields(ai.snapshot.tabs[0])));
  }
  async function captureWorkspace() {
    if (window.fiveEExam?.snapshot) {const workspace=await window.fiveEExam.snapshot();return {...workspace,...(inlineRecoveries.size?{annotationDrafts:clone([...inlineRecoveries.values()])}:{})};}
    await services.whenReady?.();await aiReady;
    const drawing=clone(serialize(state.get()));
    const viewBox=clone(state.get().viewBox),selectedIds=[...state.get().selectedIds];
    const ai=await connectedAi?.sharingSnapshot?.();
    return {drawing,viewBox,selectedIds,...(ai?{ai}:{}),...(inlineRecoveries.size?{annotationDrafts:clone([...inlineRecoveries.values()])}:{})};
  }
  function validateWorkspace(workspace) {
    const recoveries=new Map();
    if (!workspace) return recoveries;
    if(workspace.annotationDrafts!==undefined) {
      if(!Array.isArray(workspace.annotationDrafts) || workspace.annotationDrafts.length>500)throw new Error('보관한 라벨 초안이 올바르지 않습니다.');
      for(const draft of workspace.annotationDrafts){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(draft?.id || '') || recoveries.has(draft.id))throw new Error('보관한 라벨 초안이 올바르지 않습니다.');validateAnnotationPatch(draft.baseline,draft.edited);validateFigureRender(draft.render);recoveries.set(draft.id,clone(draft));}
    }
    prepareLoadedProject(workspace.drawing);
    if (workspace.ai && (!Array.isArray(workspace.ai.workspaces) || workspace.ai.workspaces.some(s=>!s || !Array.isArray(s.tabs)))) throw new Error('AI 작업 원본이 올바르지 않습니다.');
    return recoveries;
  }
  async function restoreWorkspace(workspace) {
    if (!workspace) return;
    const recoveries=validateWorkspace(workspace);
    if (window.fiveEExam?.restoreWorkspace) {const {annotationDrafts,...primaryWorkspace}=workspace;await window.fiveEExam.restoreWorkspace(primaryWorkspace);inlineRecoveries.clear();for(const[id,draft]of recoveries)inlineRecoveries.set(id,draft);return;}
    await services.whenReady?.();await aiReady;
    restoringWorkspace=true;
    try {
      applyLoaded(state,clone(workspace.drawing));
      if (workspace.viewBox && ['x','y','w','h'].every(k=>Number.isFinite(workspace.viewBox[k])) && workspace.viewBox.w>0 && workspace.viewBox.h>0) state.update(value=>{value.viewBox=clone(workspace.viewBox);value.selectedIds=(workspace.selectedIds||[]).filter(id=>value.objects.some(o=>o.id===id));});
      if (workspace.ai) await connectedAi?.restoreProjectSnapshot?.(workspace.ai);
      tabs.closeAi();
      inlineRecoveries.clear();for(const[id,draft]of recoveries)inlineRecoveries.set(id,draft);
    } finally {restoringWorkspace=false;}
  }
  function scheduleSave() {
    if (!bridge?.input || initializing || restoringWorkspace) return;
    clearTimeout(timer);
    if (compositionActive()) return;
    timer = setTimeout(() => {
      if (busy) { scheduleSave(); return; }
      void saveNow().catch(error => message(`자동 저장 실패: ${error.message}`, true));
    // 조판 창을 닫아 둔 동안에도 그림 화면의 변경이 시험지 자동 저장(HWPX 내보내기·zip·IndexedDB)을 0.9초마다 돌려
    // 그림을 끌다 멈출 때 버벅였다(M5). 닫혀 있을 때는 한참 쉰 뒤에만 저장한다(닫기 직전 변경도 결국 저장된다).
    }, panel.hidden ? 8000 : 900);
  }
  function changed() { stamp++; renderFigures(); scheduleSave(); }
  async function saveNow() {
    const capture = async () => {
      if (!bridge?.input) return null;
      if (compositionActive()) {scheduleSave();return null;}
      await flushInline(true);
      await maintainDocument();
      if (compositionActive()) {scheduleSave();return null;}
      flushFigureNames();
      const start = token();
      const workspace = await captureWorkspace();latestWorkspace=workspace;renderedFigures="";renderFigures();
      const sources = clone([...figures.values()]);
      const title = nameInput.value.trim() || '새 시험지';
      const documentBytes = new Uint8Array(await bridge.exportDraftHwpx());
      if (start !== token()) { scheduleSave(); return null; }
      const blob = buildExamProject({ projectId, name:title, documentBytes, figures:sources, workspace });
      await writeExamDraft(blob,projectId,title);
      savedToken = start;panel.querySelector('[data-exam-action="restore"]').hidden=false;
      if (start === token()) {
        await bridge.editor.notifySaved();
        if (start === token()) {if(status.dataset.error!=='true')message('자동 저장 완료 · 편집 중인 수정도 보관했습니다.');}
        else scheduleSave();
      }
      else scheduleSave();
      return blob;
    };
    const next = saveQueue.then(capture, capture); saveQueue = next.catch(() => {}); return next;
  }
  async function stableSave() {
    for (let attempt = 0; attempt < 3; attempt++) { const blob = await saveNow(); if (blob) return blob; }
    throw new Error('문서 편집을 잠시 멈춘 뒤 다시 저장해주세요.');
  }
  function download(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function activeSource() {
    const source = clone(serialize(state.get()));
    source.pages = source.pages.filter(page => page.id === source.activePageId);
    prepareLoadedProject(source); return source;
  }
  async function imageFor(source, figure) {
    const { active } = prepareLoadedProject(clone(source));
    if (!active.objects.length) throw new Error('5E에서 그림을 먼저 만들어주세요.');
    const bounds = figure?.render?.bounds || null, options = figure?.render?.options || {};
    const size = bounds || active.artboard, pixelW = Math.round(size.w / 25.4 * 300), pixelH = Math.round(size.h / 25.4 * 300);
    if (pixelW < 1 || pixelH < 1 || pixelW > 32767 || pixelH > 32767 || pixelW * pixelH > 40000000) throw new Error('그림 영역이 너무 큽니다. 5E에서 아트보드나 내보내기 영역을 줄여주세요.');
    await ensureEmbeddedFonts();
    const { canvas, widthMm, heightMm } = await rasterizeExportCanvas({ ...state.get(), ...active }, { dpi:300, bounds, options });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('그림을 내보내지 못했습니다.')), 'image/png'));
    const raw = new Uint8Array(insertPngPhys(await blob.arrayBuffer(), 300));
    return { bytes:figure ? embedEditablePng(raw, {...figure, source}, prepareLoadedProject) : raw,
      pixelWidth:canvas.width, pixelHeight:canvas.height, widthMm, heightMm };
  }
  async function insertSource(source, name) {
    if (figures.size >= 500) throw new Error('이 실험에서는 그림과 수정 이력을 500개까지 보관합니다.');
    const a=source.pages[0].artboard,id=crypto.randomUUID(),figure=normalizeExamFigure({id,name:name.slice(0,200),version:1,source,render:{bounds:{x:-a.w/2,y:-a.h/2,w:a.w,h:a.h},options:{includeReferenceImages:true,excludeAllImages:false}}}),image=await imageFor(source,figure);
    // New figures fit a single exam column; later edits preserve this placement.
    const scale = Math.min(1, 80 / image.widthMm);
    bridge.insertFigure({ id, ...image, widthMm:image.widthMm * scale, heightMm:image.heightMm * scale });
    figures.set(id, figure); changed();
    message('그림을 넣었습니다. 더블클릭해서 수정해보세요.');
  }
  function cancelPlacement() {
    if (placement?.url) URL.revokeObjectURL(placement.url);
    placement = null; panel.querySelector('.exam-placement').hidden = true; delete panel.dataset.placing;
  }
  function updatePlacement() {
    if (placement?.target && placement.target.generation === bridge?.generation && placement.target.revision !== bridge?.revision) {
      placement.target = bridge.insertionTarget();
    }
    panel.querySelector('[data-exam-action="confirm-placement"]').disabled = busy || !placement || (!placement.existing && (!placement.target || placement.target.generation !== bridge?.generation || placement.target.revision !== bridge?.revision));
  }
  async function preparePlacement(captured) {
    if (editing) {pendingSource = captured;message('새 그림을 받았습니다. 현재 편집을 마친 뒤 보낼 수 있습니다.');return;}
    validateExamLink(captured.link); validateExamContext(captured.context); prepareLoadedProject(captured.source);
    await open(); await repairLinks(); cancelPlacement();
    const current = bridge.documentPictures().map(picture => figures.get(picture.id)).find(figure => figure?.link.assetId === captured.link.assetId || figure?.link.tabId === captured.link.tabId);
    const figure = {...captured,id:crypto.randomUUID(),version:current ? current.version + 1 : 1};
    figure.source.pages[0].meta = {...figure.source.pages[0].meta,examRevisionId:figure.id,examRender:clone(figure.render || null)};
    const image = await imageFor(figure.source,figure), url = URL.createObjectURL(new Blob([image.bytes],{type:'image/png'}));
    placement = {figure,image,url,existing:current || null,target:null};
    const row = panel.querySelector('.exam-placement'); panel.dataset.placing = 'true'; closeMenus(); row.hidden = false; row.querySelector('img').src = url;
    row.querySelector('strong').textContent = current ? '이 탭에 연결된 그림을 갱신합니다' : '삽입할 위치를 선택하세요';
    row.querySelector('[data-placement-hint]').textContent = current ? '기존 위치와 객체 크기를 유지하며 보내는 영역을 바꿉니다. 확인하면 선택한 영역으로 바뀝니다.' : '본문이나 표 셀에서 위치를 클릭한 뒤 확인하세요.';
    message(current ? '같은 탭에서 보낸 그림은 기존 그림 한 개를 갱신합니다.' : '시험지에서 그림을 넣을 위치를 클릭하세요.'); updatePlacement();
  }
  async function startSend(aiRequest = null, graph = null) {
    pendingDocumentInsertion = null;
    if (window.fiveEExam) {await window.fiveEExam.returnToSource();return;}
    services.commitActiveText?.();
    if(!aiRequest && !graph && !state.get().objects.length){await open();return;}
    if (graph && (graph.pageId !== state.get().activePageId || !state.get().objects.some(object=>object.id===graph.planeId && object.type==='coordplane'))) throw new Error('그래프 작업 탭이 바뀌었습니다. 현재 탭에서 한글에 넣기를 다시 눌러주세요.');
    const captured = aiRequest ? await tabs.prepareAi(aiRequest.taskId,aiRequest.scope,{commit:false}) : await tabs.capture(null,{commit:false});
    const pageId = state.get().activePageId, wasOpen = !panel.hidden;
    panel.hidden = true; syncBackground(); tabs.closeAi();
    let graphBounds;
    if (graph) {
      await document.fonts.ready;
      graphBounds = graphSendBounds(graph.planeId);
    }
    const bounds = await new Promise(resolve => services.runAreaCapture(document.querySelector('#canvas'),state,resolve,graph ? '한글에 넣을 그래프 영역을 확인하거나 다시 드래그하세요' : '시험지에 보낼 영역을 드래그하세요',{confirmText:'확인',purpose:'hwp',initialBounds:[...figures.values()].reverse().find(f=>f.link?.tabId===captured.link.tabId)?.render?.bounds || tabs.pageForLink(captured.link)?.meta?.examRender?.bounds || graphBounds}));
    if (!bounds) {
      if (wasOpen) {panel.hidden = false;syncBackground();}
      else if (captured.context.ai) await connectedAi?.restoreExamTask(captured.context.ai);
      return;
    }
    if (state.get().activePageId !== pageId) throw new Error('작업 탭이 바뀌었습니다. 보내기를 다시 눌러주세요.');
    const latest = await tabs.capture(captured.context.ai,{commit:false,link:captured.link});
    latest.render = {bounds,options:{includeReferenceImages:true,excludeAllImages:false}};
    if (location.protocol === 'file:' && window.fiveEDesktop?.exam?.open) {await window.fiveEDesktop.exam.open({source:latest.source,captured:latest});return;}
    // New insertion never dispatches the linked picture's apply action.
    // Its owner tab may differ from the source-edit session kept in the background.
    if (editing) endEdit();
    if (!bridge?.input) {
      const choice = await showExamDocumentChoice();
      if (choice === 'cancel') return;
      await open();
      if (choice === 'open') {
        pendingDocumentInsertion = latest;
        panel.querySelector('#exam-hwp-file').click();
        message('문서를 열면 선택한 영역을 넣을 위치를 지정할 수 있습니다.');
        return;
      }
    }
    await preparePlacement(latest);
  }
  function graphSendBounds(planeId) {
    const objects=state.get().objects.filter(object=>object.id===planeId || object.planeId===planeId);
    let bounds=getContentBounds({...state.get(),objects},{},2);
    const canvas=document.querySelector('#canvas'),matrix=canvas.getScreenCTM()?.inverse();
    if (!matrix) return bounds;
    const nodes=[...canvas.querySelectorAll('#scene [data-id]')];
    for (const object of objects) {
      const node=nodes.find(node=>node.dataset.id===object.id);if(!node)continue;
      // Coordinate-frame boxes omit long axis captions and end labels. Measure
      // the existing renderer so those glyphs enter the proposed crop as well.
      const rect=node.getBoundingClientRect();if(!rect.width || !rect.height)continue;
      const a=new DOMPoint(rect.left,rect.top).matrixTransform(matrix),b=new DOMPoint(rect.right,rect.bottom).matrixTransform(matrix);
      const x=Math.min(bounds?.x ?? Infinity,a.x-2),y=Math.min(bounds?.y ?? Infinity,a.y-2);
      const right=Math.max(bounds ? bounds.x+bounds.w : -Infinity,b.x+2),bottom=Math.max(bounds ? bounds.y+bounds.h : -Infinity,b.y+2);
      bounds={x,y,w:right-x,h:bottom-y};
    }
    return bounds;
  }
  async function confirmPlacement() {
    if (!placement) return;
    if (figures.size >= 500) throw new Error('그림과 수정 이력은 500개까지 보관할 수 있습니다.');
    const {figure,image,existing,target} = placement;
    if (existing) bridge.replaceFigure(existing.id,image,figure.id,null,{before:figureBounds(existing,bridge.findFigure(existing.id)),after:figure.render.bounds});
    else {const scale = Math.min(1,80 / image.widthMm);bridge.insertAt(target,{id:figure.id,...image,widthMm:image.widthMm * scale,heightMm:image.heightMm * scale});}
    figures.set(figure.id,figure); tabs.markRevision(figure); cancelPlacement(); changed();
    await stableSave(); message(existing ? '연결된 그림을 갱신했습니다. 더블클릭하면 라벨을 수정합니다.' : '선택한 위치에 그림을 넣었습니다. 더블클릭하면 라벨을 수정합니다.');
  }
  async function repairLinks() {
    if (!bridge?.input || repairing) return;
    repairing = true;
    try {
      const seenTabs = new Set(), seenAssets = new Set(); let copied = 0;
      for (const picture of bridge.documentPictures()) {
        let figure = figures.get(picture.id);
        if (!figure) {
          const ref = picture.ref, bytes = bridge.pictureBytes(ref);
          const recovered = readEditablePng(bytes,prepareLoadedProject); if (!recovered) continue;
          figure = normalizeExamFigure(recovered); figures.set(figure.id,figure);
          if (picture.id !== figure.id) {const image = await imageFor(figure.source,figure);bridge.writeFigure(ref,image,figure.id);}
        }
        figure = normalizeExamFigure(figure); figures.set(figure.id,figure);
        if (seenTabs.has(figure.link.tabId) || seenAssets.has(figure.link.assetId)) {
          if (figures.size >= 500) throw new Error('그림 복제를 분리할 공간이 없습니다. 복제를 되돌린 뒤 작업을 새 파일로 나눠주세요.');
          const independent = forkExamFigure(figure), image = await imageFor(independent.source,independent);
          bridge.writeFigure(picture.ref,image,independent.id); figures.set(independent.id,independent); copied++;
        } else {seenTabs.add(figure.link.tabId);seenAssets.add(figure.link.assetId);}
      }
      if (copied) {stamp++;bridge.deps.eventBus.emit('document-changed');message('복제한 그림을 독립된 5E 작업 탭으로 분리했습니다.');}
      renderFigures();
    } finally {repairing = false;}
  }
  function documentChanged() {
    updatePlacement(); scheduleSave();
    maintenancePending = true;
    clearTimeout(maintenanceTimer);
    if (!compositionActive()) maintenanceTimer = setTimeout(() => void maintainDocument(),160);
  }
  async function maintainDocument() {
    clearTimeout(maintenanceTimer);
    if (compositionActive() || initializing) return;
    await repairPromise;
    if (!maintenancePending || compositionActive()) return;
    maintenancePending = false;
    repairPromise = repairLinks().catch(error => message(error.message,true)).finally(() => {repairPromise = null;});
    await repairPromise;
    // An asynchronous image repair can overlap another native edit.
    if (maintenancePending && !compositionActive()) documentChanged();
  }
  function scheduleFigures() {
    if (figureFrame || compositionActive() || maintenancePending) return;
    figureFrame = requestAnimationFrame(() => {
      figureFrame = 0;
      if (!compositionActive() && !maintenancePending) renderFigures();
    });
  }
  function currentSourceRender(){
    const page=editing&&tabs.pageForLink(editing.figure.link);
    return clone(page?.meta?.examDraftRender || editing?.figure.render);
  }
  function sourceAiPreview(){const panel=document.querySelector('#ai-image-panel:not([hidden])');return panel&&[...panel.querySelectorAll('[data-ai-previews] .ai-preview-stage > img')].find(img=>img.getClientRects().length);}
  function sourceViewport(){const image=sourceAiPreview(),r=(image?.closest('.ai-image-pane') || document.querySelector('#canvas'))?.getBoundingClientRect();return r&&{x:r.x,y:r.y,w:r.width,h:r.height};}
  function sourceGeometry(){
    const image=sourceAiPreview();if(image){
      const r=image.getBoundingClientRect(),badge=image.closest('.ai-preview-stage')?.querySelector('[data-ai-graph-edit]');
      const headingBottom=badge?.getClientRects().length?Math.min(r.y,badge.getBoundingClientRect().top):r.y;
      return{x:r.x,y:r.y,w:r.width,h:r.height,headingBottom};
    }
    const c=document.querySelector('#canvas'),m=c?.getScreenCTM(),b=currentSourceRender()?.bounds;if(!m||!b)return null;
    const p=new DOMPoint(b.x,b.y).matrixTransform(m);return{x:p.x,y:p.y,w:b.w*m.a,h:b.h*m.d};
  }
  // Full floating text widgets occlude the source handles just like dialogs.
  // Keep direct inline label inputs available on the source canvas.
  const sourceBlockers='dialog,.modal-overlay,[role="dialog"],.unified-text-editor';
  function syncSourceControls(){
    const ownerPage=editing&&tabs.pageForLink(editing.figure.link);
    const aiTask=connectedAi?.activeExamTask?.();
    const aiVisible=!!document.querySelector('#ai-image-panel:not([hidden])');
    const wrongAi=aiVisible && (!editing?.aiContext || !aiTask || aiTask.scope!==editing.aiContext.scope || aiTask.taskId!==editing.aiContext.taskId);
    const blocking=[...document.querySelectorAll(sourceBlockers)].some(element=>
      element!==panel && !element.closest('[data-ai-workflow],#rhwp-exam-workspace')
      && !element.closest('[hidden],[inert]') && element.getClientRects().length && getComputedStyle(element).visibility!=='hidden');
    if(!editing || editing.remote || aiVisible || !panel.hidden || ownerPage?.id!==state.get().activePageId || wrongAi || blocking){sourceRegion.hide();regionInspector.hidden=true;return;}
    const render=currentSourceRender();if(!render?.bounds)return;
    const toolbarBottom=document.querySelector('.canvas-toolbar')?.getBoundingClientRect().bottom || 0;
    document.body.style.setProperty('--exam-source-toolbar-bottom',`${toolbarBottom}px`);
    const aiPreview=sourceAiPreview();sourceRegion.root.classList.toggle('exam-source-ai',!!aiPreview);
    sourceRegion.show({inside:!!aiPreview,bounds:aiPreview?null:render.bounds,name:tabs.pageForLink(editing.figure.link)?.name || editing.figure.name,geometry:sourceGeometry,viewport:sourceViewport});
    regionInspector.hidden=!!aiPreview;
    regionInspector.querySelector('[data-region-undo]').disabled=busy||!editing.regionUndo?.length;regionInspector.querySelector('[data-region-redo]').disabled=busy||!editing.regionRedo?.length;
    const b=render.bounds,base=editing.baseBounds || b;
    const padding={left:base.x-b.x,right:b.x+b.w-base.x-base.w,top:base.y-b.y,bottom:b.y+b.h-base.y-base.h};
    for(const input of regionInspector.querySelectorAll('input'))if(document.activeElement!==input)input.value=Number((input.dataset.sourceRegion?b[input.dataset.sourceRegion]:padding[input.dataset.sourcePadding]).toFixed(3));
  }
  function scheduleSourcePosition(){if(editing&&!sourcePositionFrame)sourcePositionFrame=requestAnimationFrame(()=>{sourcePositionFrame=0;syncSourceControls();});}
  window.addEventListener('resize',scheduleSourcePosition);
  // Modal creation and dismissal must immediately suspend the source handles.
  new MutationObserver(records=>{
    if(records.some(record=>record.type==='childList'
      ? [...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1 && (node.matches(sourceBlockers) || node.querySelector(sourceBlockers)))
      : record.target.matches(sourceBlockers)))scheduleSourcePosition();
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','style','class']});
  new ResizeObserver(scheduleSourcePosition).observe(document.querySelector('#canvas'));
  document.addEventListener('scroll',scheduleSourcePosition,true);
  let aiSourceObserver,aiSourceResizeObserver,aiSourcePanel;
  function observeSourceAi(){
    const panel=document.querySelector('#ai-image-panel');
    if(panel&&panel!==aiSourcePanel){
      aiSourceObserver?.disconnect();aiSourceResizeObserver?.disconnect();
      aiSourcePanel?.removeEventListener('transitionend',scheduleSourcePosition);
      aiSourcePanel?.removeEventListener('animationend',scheduleSourcePosition);
      aiSourcePanel=panel;
      const observed=new WeakSet();aiSourceResizeObserver=new ResizeObserver(scheduleSourcePosition);
      const observePreviews=()=>{
        for(const element of panel.querySelectorAll('.ai-image-pane,.ai-preview-stage > img')){
          if(!observed.has(element)){observed.add(element);aiSourceResizeObserver.observe(element);}
        }
      };
      aiSourceObserver=new MutationObserver(()=>{observePreviews();scheduleSourcePosition();});
      aiSourceObserver.observe(panel,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-ai-selected-candidate-id','data-ai-layout']});
      panel.addEventListener('transitionend',scheduleSourcePosition);
      panel.addEventListener('animationend',scheduleSourcePosition);
      observePreviews();
    }
  }
  observeSourceAi();
  window.addEventListener('5e:ai-workspace-activate',()=>{observeSourceAi();scheduleSourcePosition();});
  function updateSourceRegion(bounds,layout,record=true){
    if(!editing || editing.remote)throw new Error('편집 중인 그림이 없습니다.');validRegion(bounds);
    const page=tabs.pageForLink(editing.figure.link);if(!page || page.id!==state.get().activePageId)throw new Error('연결된 작업 탭을 선택해주세요.');
    if(record){(editing.regionUndo ||= []).push(currentSourceRender());editing.regionRedo=[];}
    const render={...currentSourceRender(),bounds:clone(bounds),...(layout?{layout:clone(layout),layoutDraft:true}:{})};validateFigureRender(render);
    state.update(()=>{page.meta={...page.meta,examDraftRender:render};});syncSourceControls();
  }
  function undoSourceRegion(redo=false){if(!editing || busy)return;const from=redo?editing.regionRedo:editing.regionUndo;if(!from?.length)return;const next=from.pop();(redo?(editing.regionUndo ||= []):(editing.regionRedo ||= [])).push(currentSourceRender());const page=tabs.pageForLink(editing.figure.link);validateFigureRender(next);state.update(()=>{page.meta={...page.meta,examDraftRender:clone(next)};});syncSourceControls();}
  regionInspector.querySelector('[data-region-undo]').onclick=()=>undoSourceRegion();regionInspector.querySelector('[data-region-redo]').onclick=()=>undoSourceRegion(true);
  regionInspector.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();undoSourceRegion(e.shiftKey);}});
  regionInspector.addEventListener('change',e=>{
    const input=e.target;if(!input.matches('input') || busy)return;
    try{const b=currentSourceRender().bounds,k=input.dataset.sourceRegion,value=Number(input.value);if(!Number.isFinite(value)||input.value==='')throw new Error('영역 값을 확인해주세요.');
      if(k)b[k]=value;else{const base=editing.baseBounds||b,p={left:base.x-b.x,right:b.x+b.w-base.x-base.w,top:base.y-b.y,bottom:b.y+b.h-base.y-base.h};p[input.dataset.sourcePadding]=value;Object.assign(b,{x:base.x-p.left,y:base.y-p.top,w:base.w+p.left+p.right,h:base.h+p.top+p.bottom});}updateSourceRegion(b);
    }catch(error){message(error.message,true);syncSourceControls();}
  });
  regionInspector.querySelector('[data-source-recrop]').onclick=()=>void run(async()=>{
    const owner=editing,render=currentSourceRender();if(!owner)return;
    const bounds=await new Promise(resolve=>services.runAreaCapture(document.querySelector('#canvas'),state,resolve,'기존 영역을 옮기거나 다시 드래그하세요',{confirmText:'확인',purpose:'hwp',initialBounds:render.bounds}));
    if(bounds && editing===owner)updateSourceRegion(bounds);
  });
  regionInspector.querySelector('[data-source-settings]').onclick=e=>openPictureSettings(e.currentTarget,true);
  function syncPictureControls(){
    if(!bridge || panel.hidden || editing || inlineSession || placement){nativeRegion.hide();selectedRegionKey='';return;}
    const ref=bridge.input?.cursor?.getSelectedPictureRef();if(ref?.type!=='image'){nativeRegion.hide();selectedRegionKey='';return;}
    const id=bridge.figureId(ref),figure=figures.get(id),key=`${bridge.generation}:${bridge.revision}:${pictureKey(ref)}:${id}`;
    if(key===selectedRegionKey && nativeRegion.session){nativeRegion.position();return;}
    selectedRegionKey=key;
    nativeRegion.show({ref,id,generation:bridge.generation,bounds:null,geometry:()=>bridge.figureGeometry(ref),viewport:()=>bridge.figureViewport(ref)});
  }
  function openPictureSettings(anchor,source=false){
    const session=source?editing:nativeRegion.session;if(!session)return;
    const ref=session.ref,layout=source?(currentSourceRender().layout || (ref?bridge.pictureLayout(ref):DEFAULT_PICTURE_LAYOUT)):bridge.pictureLayout(ref);
    pictureSettings.open(layout,anchor,{source,owner:session,ref,id:source?editing.id:session.id,generation:bridge?.generation,revision:bridge?.revision,inlineAlignment:!ref || !!bridge.paragraphTarget(ref)});
  }
  async function applyLayout(layout,context){
    if(context.source){if(editing!==context.owner)throw new Error('편집 연결이 바뀌었습니다.');updateSourceRegion(currentSourceRender().bounds,layout);return;}
    if(context.generation!==bridge.generation || context.revision!==bridge.revision || bridge.figureId(context.ref)!==context.id)throw new Error('그림이 바뀌었습니다. 설정을 다시 열어주세요.');
    bridge.applyPictureLayout(context.ref,layout);changed();bridge.selectPicture(context.ref);message('그림 배치 설정을 적용했습니다.');
  }
  async function decodePicture(blob) {
    try {return await createImageBitmap(blob);} catch {
      const image=new Image(),url=URL.createObjectURL(blob);
      try {await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('그림 형식을 읽지 못했습니다.'));image.src=url;});return image;}
      finally {URL.revokeObjectURL(url);}
    }
  }
  function syncSourceCrop() {
    const canvas=document.querySelector('#canvas');if(!canvas)return;
    let group=canvas.querySelector('#exam-source-crop');
    if(!group){group=document.createElementNS('http://www.w3.org/2000/svg','g');group.id='exam-source-crop';group.setAttribute('pointer-events','none');canvas.append(group);}
    const page=state.get().pages.find(page=>page.id===state.get().activePageId),bounds=(page?.meta?.examDraftRender || page?.meta?.examRender)?.bounds;
    canvas.querySelector('#exam-source-crop-fill')?.remove();group.replaceChildren();
    // Saved output bounds are metadata, not a permanent canvas selection.
    // Show the frame only in the live linked-picture editing session.
    if(!editing || !panel.hidden || !state.get().objects.length || !page?.meta?.examLink || !bounds)return;
    const fill=document.createElementNS('http://www.w3.org/2000/svg','rect');fill.id='exam-source-crop-fill';for(const[k,v]of Object.entries({x:bounds.x,y:bounds.y,width:bounds.w,height:bounds.h,fill:'#fff','pointer-events':'none'}))fill.setAttribute(k,v);canvas.insertBefore(fill,canvas.querySelector('#scene'));
    const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    for(const [key,value]of Object.entries({x:bounds.x,y:bounds.y,width:bounds.w,height:bounds.h,fill:'none',stroke:'#6ba4f8','stroke-width':1.5,'stroke-dasharray':'6 4','vector-effect':'non-scaling-stroke'}))rect.setAttribute(key,value);
    group.append(rect);
  }
  function figureBounds(figure,ref) {
    const a=getAnnotationPage(figure.source).artboard;
    const original=(!figure.nativeCropIncluded && figure.render?.bounds) || {x:-a.w/2,y:-a.h/2,w:a.w,h:a.h};
    const region=bridge.pictureSourceRegion(ref),props=bridge.properties(ref);
    // Older replacements reset crop endpoints to the shape's size, even
    // though the display PNG already contained figure.render.bounds. When
    // native crop UI reports no crop and exactly that old reset is present,
    // recover the saved export bounds instead of cropping the source twice.
    const legacyReset=!figure.nativeCropIncluded && figure.render?.bounds && region.nativeSize &&
      region.l===0 && region.t===0 && (region.r<region.w || region.b<region.h) &&
      region.r===props.originalWidth && region.b===props.originalHeight &&
      ['cropLeft','cropTop','cropRight','cropBottom'].every(key=>!props[key]);
    return legacyReset ? clone(original) : bridge.cropBounds(ref,original);
  }
  async function inlinePreview(source,bounds,options={},excludeLabels=true) {
    const {active}=prepareLoadedProject(clone(source));
    if(excludeLabels)active.objects=active.objects.filter(object=>object.type!=='labeler');
    if(bounds.w/25.4*150*bounds.h/25.4*150>40000000 || bounds.w<=0 || bounds.h<=0)throw new Error('그림 영역이 너무 큽니다. 영역을 줄여주세요.');
    await ensureEmbeddedFonts();
    const {canvas}=await rasterizeExportCanvas({...state.get(),...active},{dpi:150,bounds,options});
    return canvas.toDataURL('image/png');
  }
  async function annotationRequest(kind,figure,extra={}) {
    if(window.fiveEExam)return window.fiveEExam.annotations({kind,figure,...extra});
    if(kind==='read')return tabs.readAnnotations(figure);
    if(kind==='patch')return tabs.patchAnnotations(figure,extra.baseline,extra.edited,{render:extra.render});
    await tabs.markAnnotationRevision(figure);return {labels:annotationsFor(figure.source)};
  }
  async function beginInline(id,ref=null) {
    if(editing)return;
    await flushInline(true);await closeInline();refreshFigureNames();
    const figure=figures.get(id);
    if(!figure){if(ref)return registerPicture(ref,'inline');throw new Error('시험지에서 그림을 선택해주세요.');}
    const target=ref || bridge.findFigure(id);if(!target)throw new Error('시험지에서 그림을 찾지 못했습니다.');
    cancelPlacement();await services.whenReady?.();await aiReady;
    const prepared=normalizeExamFigure(figure);
    prepared.render={...figure.render,bounds:figureBounds(figure,target),options:figure.render?.options || {includeReferenceImages:true,excludeAllImages:false}};
    const reading=await annotationRequest('read',prepared),render=reading.render || prepared.render;
    const recovery=inlineRecoveries.get(id),shownRender=recovery?.render || render;
    if(bridge.figureId(target)!==id)throw new Error('문서의 그림이 바뀌었습니다. 다시 선택해주세요.');
    inlineFailure=null;inlineQueue=Promise.resolve();
    inlineSession={id,figure:prepared,ref:target,generation:bridge.generation,baseline:clone(reading.draft),render:clone(shownRender)};
    const opening=inlineSession;
    nativeRegion.hide();pictureSettings.close();
    // Raster preparation overlaps the camera, but a failed/stale preparation
    // must also restore the view instead of leaving a half-open edit session.
    const [preview,camera]=await Promise.allSettled([inlinePreview(prepared.source,shownRender.bounds,shownRender.options),bridge.focusFigure(target,{toolbarHeight:150})]);
    opening.view=camera.status==='fulfilled'?camera.value:null;
    if(preview.status==='rejected'||camera.status==='rejected'||inlineSession!==opening||opening.generation!==bridge.generation||bridge.figureId(target)!==id){
      if(inlineSession===opening)await closeInline();
      throw preview.reason || camera.reason || new Error('문서의 그림이 바뀌었습니다. 다시 선택해주세요.');
    }
    const baseUrl=preview.value;
    inlineEditor.open({simple:true,bridge,ref:target,labels:recovery?.edited || reading.draft,bounds:shownRender.bounds,baseUrl,recovery:!!recovery,layers:getAnnotationPage(prepared.source).layers,layerId:getAnnotationPage(prepared.source).layers.find(layer=>layer.visible!==false)?.id || 1});
    inlineEditor.position();
    message(recovery ? '보관한 라벨 초안입니다. 적용하면 원본 라벨을 이 초안으로 교체합니다.' : '라벨 내용·글꼴·글자 크기·선 굵기를 수정하세요. 라벨 추가나 위치 변경은 원본 편집에서 할 수 있습니다.');
  }
  function queueInlineChange(labels,bounds) {
    const session=inlineSession;if(!session)return;
    const render={...session.render,bounds:clone(bounds),options:clone(session.render.options)},edited=clone(labels);
    workspaceStamp++;scheduleSave();
    inlineQueue=inlineQueue.then(async()=>{
      if(inlineFailure)throw inlineFailure;
      if(session.generation!==bridge.generation || bridge.figureId(session.ref)!==session.id)throw new Error('시험지의 그림이 바뀌었습니다. 라벨 편집을 다시 열어주세요.');
      const result=await annotationRequest('patch',session.figure,{baseline:session.baseline,edited,render});
      session.baseline=clone(result.labels);session.render=render;
      inlineRecoveries.delete(session.id);
    }).catch(error=>{inlineFailure=error;inlineRecoveries.set(session.id,{id:session.id,baseline:clone(session.baseline),edited,render});message(`${error.message} 라벨 초안은 별도로 보관합니다.`,true);});
  }
  async function flushInline(allowFailure=false) {
    inlineEditor.flush?.();await inlineQueue;if(inlineFailure && !allowFailure)throw inlineFailure;
  }
  async function closeInline() {const view=inlineSession?.view;inlineEditor.close();inlineSession=null;inlineFailure=null;inlineQueue=Promise.resolve();await bridge?.restoreFigureView(view);}
  async function refreshInline() {
    const session=inlineSession;if(!session || busy || inlineFailure || inlineEditor.drag || document.activeElement?.matches('#exam-inline-editor input,#exam-inline-editor textarea'))return;
    await inlineQueue;if(inlineSession!==session)return;
    const reading=await annotationRequest('read',session.figure);
    if(inlineSession!==session || JSON.stringify(session.baseline)===JSON.stringify(reading.draft))return;
    session.baseline=clone(reading.draft);inlineEditor.setLabels(reading.draft);
    message('원본 편집기의 라벨 수정을 이 화면에도 반영했습니다.');
  }
  async function inlineAction(name) {
    if(!inlineSession)return;
    await flushInline(name==='close' || name==='original');const session=inlineSession;
    if(name==='close'){const failed=!!inlineFailure;await closeInline();scheduleSave();message(failed ? '원본 변경으로 반영하지 못한 라벨은 프로젝트의 초안으로 보관했습니다. 다시 열어 확인하세요.' : '라벨 수정은 작업 탭에 남아 있습니다.');return;}
    if(name==='original'){const {id,ref}=session;await closeInline();await beginEdit(id,ref);return;}
    if(name==='crop') {
      const page=getAnnotationPage(session.figure.source),a=page.artboard,current=session.render.bounds,content=getContentBounds(page,session.render.options,3);
      const boxes=[{x:-a.w/2,y:-a.h/2,w:a.w,h:a.h},current,...(content?[content]:[])],x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
      const full={x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};
      const source=mergeAnnotationPatch(session.figure.source,annotationsFor(session.figure.source),session.baseline);
      const sourceUrl=await inlinePreview(source,full,session.render.options,false);
      const bounds=await chooseInlineCrop({sourceUrl,fullBounds:full,initialBounds:session.render.bounds});
      if(!bounds)return;
      const url=await inlinePreview(session.figure.source,bounds,session.render.options);
      inlineEditor.setBounds(bounds,url);queueInlineChange(inlineEditor.snapshot(),bounds);await flushInline();return;
    }
    if(name!=='apply')return;
    if(JSON.stringify(inlineEditor.snapshot())!==JSON.stringify(session.baseline)){queueInlineChange(inlineEditor.snapshot(),inlineEditor.bounds);await flushInline();}
    const appliedLabels=clone(session.baseline),appliedRender=clone(session.render),appliedLayout=appliedRender.layoutDraft?clone(appliedRender.layout):undefined;delete appliedRender.layoutDraft;
    if(session.generation!==bridge.generation || bridge.figureId(session.ref)!==session.id)throw new Error('시험지의 그림이 바뀌었습니다. 다시 선택해주세요.');
    if(figures.size>=500)throw new Error('그림 수정 이력을 500개까지 보관할 수 있습니다.');
    const source=mergeAnnotationPatch(session.figure.source,annotationsFor(session.figure.source),appliedLabels),nextId=crypto.randomUUID();
    const figure={...session.figure,id:nextId,version:session.figure.version+1,source,render:appliedRender,nativeCropIncluded:false,editScope:'annotations'};
    const page=getAnnotationPage(source);page.meta={...page.meta,examRevisionId:nextId,examRender:clone(figure.render)};delete page.meta.examDraftRender;
    const image=await imageFor(source,figure);
    // Check the primary label snapshot once more before touching the HWP image.
    await annotationRequest('patch',session.figure,{baseline:appliedLabels,edited:appliedLabels,render:session.render});
    if(session.generation!==bridge.generation || bridge.figureId(session.ref)!==session.id)throw new Error('시험지의 그림이 바뀌었습니다. 다시 선택해주세요.');
    const props=bridge.properties(session.ref),fixed=JSON.stringify(appliedRender.bounds)===JSON.stringify(session.figure.render.bounds) && !['cropLeft','cropTop','cropRight','cropBottom'].some(key=>props[key]);
    if(fixed)bridge.transaction('replace-labels',()=>{const result=bridge.writeFigure(session.ref,image,nextId);if(appliedLayout)bridge.writePictureLayout(session.ref,appliedLayout);return result;});
    else bridge.replaceFigure(session.id,image,nextId,session.ref,{before:session.figure.render.bounds,after:appliedRender.bounds,layout:appliedLayout});
    figures.set(nextId,figure);
    await closeInline();await annotationRequest('revision',figure);changed();await stableSave();
    message('같은 그림에 라벨 수정을 반영했습니다.');
  }
  async function registerPicture(ref, mode = 'original') {
    if (figures.size>=500) throw new Error('그림과 수정 이력은 500개까지 보관합니다. 새 프로젝트로 나눠주세요.');
    const generation=bridge.generation,props=clone(bridge.properties(ref));
    const raw=new Uint8Array(bridge.pictureBytes(ref));
    const mime=bridge.pictureMime(ref) || 'image/png';
    let blob=new Blob([raw],{type:mime}), image;
    try {image=await decodePicture(blob);}
    catch {
      // RHWP supplies converted raster sources for vector picture formats.
      if(!image) throw new Error('이 그림 형식은 편집기에 불러올 수 없습니다. RHWP에서 PNG 그림으로 바꾼 뒤 등록해주세요.');
    }
    const width=image.width,height=image.height;image.close?.();
    if(width*height>40000000) throw new Error('그림이 너무 큽니다. 4천만 화소 이하의 그림을 등록해주세요.');
    const src=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
    if(generation!==bridge.generation || JSON.stringify(props)!==JSON.stringify(bridge.properties(ref))) throw new Error('문서의 그림이 바뀌었습니다. 다시 선택해주세요.');
    const source=activeSource(),page=source.pages[0], id=crypto.randomUUID(),link={tabId:crypto.randomUUID(),assetId:crypto.randomUUID()};
    const w=100,h=100*height/width;
    page.id=`exam_${id}`;page.name=`문서 그림 ${Math.max(0,bridge.documentPictures().findIndex(p=>pictureKey(p.ref)===pictureKey(ref)))+1}`;
    page.artboard={w,h};page.guides=[];page.objects=[{id:`image_${id}`,type:'image',src,x:-w/2,y:-h/2,w,h,rotation:0,layerId:page.layers[0].id,order:0,locked:false}];
    page.meta={number:'',points:'',examLink:link,examRevisionId:id};source.activePageId=page.id;
    const bounds=bridge.cropBounds(ref,{x:-w/2,y:-h/2,w,h},{width,height});
    const figure=normalizeExamFigure({id,name:page.name,version:1,link,source,nativeCropIncluded:false,render:{bounds,options:{includeReferenceImages:true,excludeAllImages:false}}});
    // Bake the document's native crop into the display PNG once, keeping the
    // complete original raster in figure.source. Registration preserves the
    // exact document frame/anchor/rotation; later edits use the same bounds.
    const display=await imageFor(source,figure);
    if(generation!==bridge.generation || JSON.stringify(props)!==JSON.stringify(bridge.properties(ref))) throw new Error('문서의 그림이 바뀌었습니다. 다시 선택해주세요.');
    bridge.transaction('register-picture',()=>{
      const result=bridge.writeFigure(ref,display,id,{width,height}),target=bridge.paragraphTarget(ref);
      // Give a newly registered standalone inline image the default alignment.
      // A paragraph shared with question text retains its intentional format.
      const empty=target?.kind==='body'?bridge.wasm.getParagraphLength(target.sec,target.para)===0:
        target?.kind==='cell'?bridge.wasm.getCellParagraphLength(target.sec,target.parentPara,target.controlIdx,target.cellIdx,target.cellParaIdx)===0:false;
      if(props.treatAsChar&&empty)bridge.writePictureLayout(ref,{...bridge.pictureLayout(ref),alignment:'Center'});
      return result;
    });
    figures.set(id,figure);changed();
    if(mode === 'inline') await beginInline(id,ref);else if(mode!=='register') await beginEdit(id,ref);return figure;
  }
  async function beginEdit(id, ref = null) {
    if (editing) return;
    await flushInline(true);await closeInline();
    refreshFigureNames();
    const figure = figures.get(id);
    if (!figure) {if(ref) return registerPicture(ref);throw new Error('시험지에서 편집할 그림을 선택해주세요.');}
    if (!bridge.findFigure(id)) throw new Error('시험지에서 이 그림을 찾지 못했습니다.');
    cancelPlacement();
    const target = ref || bridge.findFigure(id);
    editing = {id,figure:normalizeExamFigure(figure),ref:target,generation:bridge.generation};
    {
      editing.figure.render={...figure.render,layout:bridge.pictureLayout(target),layoutDraft:false,bounds:figureBounds(figure,target),options:figure.render?.options || {includeReferenceImages:true,excludeAllImages:false}};
    }
    if (window.fiveEExam) {
      const reading=await annotationRequest('read',editing.figure);
      if(reading.render)editing.figure.render=clone(reading.render);
      editing.remote = true; editing.requestId = crypto.randomUUID(); syncBackground();
      try { await window.fiveEExam.requestEdit({requestId:editing.requestId,figure:editing.figure}); }
      catch (error) {editing = null;syncBackground();throw error;}
      message('원래 5E 작업 탭에서 수정한 뒤 시험지에 반영하세요.'); return;
    }
    await services.whenReady?.(); await aiReady;
    try { Object.assign(editing,await tabs.activate(editing.figure)); }
    catch (error) {editing = null;throw error;}
    const draftRender=tabs.pageForLink(editing.figure.link)?.meta?.examDraftRender;
    if(draftRender)editing.figure.render=clone(draftRender);
    nativeRegion.hide();pictureSettings.close();
    editing.baseBounds=clone(editing.figure.render.bounds);
    panel.hidden = true;
    bar.querySelector('#exam-edit-name').textContent = `${figure.name} 편집 중`;
    bar.hidden = false;syncSourceControls();
    document.body.classList.add('exam-editing');
    syncBackground();
    window.dispatchEvent(new Event('resize'));
    if (!editing.aiContext) document.querySelector('#canvas').focus({preventScroll:true});
    message('원래 작업 탭입니다. 수정한 뒤 시험지에 반영하세요.');
  }
  function endEdit() {
    if (!editing) return;
    editing = null;
    tabs.closeAi();
    document.body.classList.remove('exam-editing'); sourceRegion.hide();bar.hidden=true;regionInspector.hidden=true;pictureSettings.close();syncSourceCrop();
    if (location.protocol !== 'file:') panel.hidden = false;
    syncBackground();
    window.dispatchEvent(new Event('resize')); renderFigures();
  }
  async function applyEdit() {
    if (!editing) return;
    if (editing.remote) return;
    services.commitActiveText?.();
    const session=editing;
    const captured = await tabs.captureEdit(session);
    if(editing!==session)throw new Error('편집 화면이 바뀌었습니다. 그림을 다시 선택해주세요.');
    tabs.closeAi();
    captured.render=clone(currentSourceRender());validateFigureRender(captured.render);
    if (editing.external) {
      const receipt = await window.fiveEDesktop.exam.finish({requestId:editing.requestId,apply:true,captured});
      if (receipt?.figure) tabs.markRevision(receipt.figure);
      endEdit(); message('수정한 그림을 시험지로 보냈습니다.'); return;
    }
    await commitEdit(captured);
  }
  async function commitEdit(captured) {
    const session=editing;
    validateExamLink(captured.link); validateExamContext(captured.context); prepareLoadedProject(captured.source);
    if (captured.link.tabId !== editing.figure.link.tabId || captured.link.assetId !== editing.figure.link.assetId) throw new Error('다른 작업 탭의 그림은 이 위치에 반영할 수 없습니다.');
    if (editing.generation !== bridge.generation) throw new Error('시험지가 바뀌었습니다. 그림 편집을 마치고 다시 열어주세요.');
    if (figures.size >= 500) throw new Error('그림 수정 이력을 500개까지 보관할 수 있습니다.');
    const source = captured.source, nextId = crypto.randomUUID();
    if (editing.generation !== bridge.generation) throw new Error('시험지가 바뀌었습니다. 다시 그림을 선택해주세요.');
    const figure = { ...editing.figure, ...captured, id:nextId, version:editing.figure.version + 1, source, nativeCropIncluded:false };
    delete figure.editScope;
    source.pages[0].meta = {...source.pages[0].meta,examRevisionId:nextId,examRender:clone(figure.render || null)};
    delete source.pages[0].meta.examDraftRender;
    const appliedLayout=figure.render?.layoutDraft?clone(figure.render.layout):undefined;if(figure.render)delete figure.render.layoutDraft;
    source.pages[0].meta.examRender=clone(figure.render || null);
    const image = await imageFor(source, figure);
    if (editing!==session || session.generation !== bridge.generation) throw new Error('시험지가 바뀌었습니다. 다시 그림을 선택해주세요.');
    let owner;
    if (session.remote) {
      owner = await window.fiveEExam.snapshot({editRequestId:session.requestId});
      if (editing!==session || session.generation !== bridge.generation) throw new Error('시험지가 바뀌었습니다. 다시 그림을 선택해주세요.');
    } else {
      const linkedPage = tabs.pageForLink(captured.link);
      owner = {pageId:linkedPage?.id,activePageId:state.get().activePageId,link:linkedPage?.meta?.examLink,ai:connectedAi?.activeExamTask?.() || null};
    }
    if (!owner || owner.pageId !== captured.context.pageId || owner.activePageId !== owner.pageId || owner.link?.tabId !== captured.link.tabId || owner.link?.assetId !== captured.link.assetId) {
      throw new Error('연결된 원래 작업 탭을 선택해주세요.');
    }
    if (captured.context.ai && (owner.ai?.taskId !== captured.context.ai.taskId || owner.ai?.scope !== captured.context.ai.scope)) {
      throw new Error('연결된 원래 AI 작업 탭을 선택해주세요.');
    }
    bridge.replaceFigure(session.id,image,nextId,session.ref,{before:figureBounds(figures.get(session.id),session.ref),after:figure.render.bounds,layout:appliedLayout});
    // Keep earlier sources: native HWP undo restores their marker and bitmap.
    figures.set(nextId, figure); tabs.markRevision(figure); endEdit(); changed();
    await bridge.revealFigure(nextId,{generation:session.generation});
    try {await stableSave(); message('수정한 그림을 시험지에 반영하고 자동 저장했습니다.');}
    catch (error) {message(`그림을 반영했지만 자동 저장에 실패했습니다. 작업 저장을 다시 눌러주세요. ${error.message}`,true);}
    return figure;
  }
  async function loadProject(bytes) {
    await flushInline(true);await closeInline();
    const modern=parseFiveEProject(bytes,prepareLoadedProject);
    if (modern?.kind==='drawing') {await restoreWorkspace(modern.workspace || {drawing:modern.drawing});await actions.close();return;}
    const project = parseExamProject(bytes, prepareLoadedProject);
    validateWorkspace(project.workspace);
    const previous = {bytes:new Uint8Array(await bridge.exportDraftHwpx()),generation:bridge.generation,figures,projectId,name:nameInput.value,workspace:await captureWorkspace()};
    initializing = true;
    try {
      await bridge.load(project.documentBytes,'document.hwpx');
      figures=new Map(project.figures.map(figure=>[figure.id,normalizeExamFigure(figure)]));
      projectId=project.projectId || crypto.randomUUID();
      inlineRecoveries.clear();
      await restoreWorkspace(project.workspace);await repairLinks();nameInput.value=project.name;
    } catch(error) {
      if (bridge.generation !== previous.generation) await bridge.load(previous.bytes,'previous.hwpx');
      figures=previous.figures;projectId=previous.projectId;nameInput.value=previous.name;
      try {await restoreWorkspace(previous.workspace);} catch {}
      throw error;
    } finally {documentGeneration=bridge.generation;initializing=false;}
    changed();message('시험지와 편집 원본을 열었습니다. 미반영 수정은 작업 탭에 남아 있습니다.');
  }

  async function loadDocument(bytes, filename) {
    if (!/\.(hwp|hwpx)$/i.test(filename)) throw new Error('한글 파일(.hwp 또는 .hwpx)을 선택해주세요.');
    if (!bytes.length) throw new Error('빈 한글 파일입니다. 다른 파일을 선택해주세요.');
    await flushInline(true);await closeInline();
    const previous={bytes:new Uint8Array(await bridge.exportDraftHwpx()),generation:bridge.generation,figures,projectId,name:nameInput.value,recoveries:new Map(inlineRecoveries)};
    initializing=true;
    try {
      await bridge.load(bytes,filename);
      figures=new Map();projectId=crypto.randomUUID();inlineRecoveries.clear();
      await repairLinks();
      nameInput.value=filename.replace(/\.(hwp|hwpx)$/i,'').slice(0,200) || '불러온 시험지';
      cancelPlacement();
    } catch(error) {
      if (bridge.generation !== previous.generation) await bridge.load(previous.bytes,'previous.hwpx');
      figures=previous.figures;projectId=previous.projectId;nameInput.value=previous.name;
      inlineRecoveries.clear();for(const [id,draft]of previous.recoveries)inlineRecoveries.set(id,draft);
      throw new Error(`한글 파일을 열지 못했습니다. 파일이 손상되지 않았는지 확인하거나 HWPX로 저장해 다시 열어주세요. ${error.message || ''}`);
    } finally {documentGeneration=bridge.generation;initializing=false;renderedFigures='';renderFigures();updatePlacement();}
    changed();message(`${filename}을 열었습니다. 그림을 선택하고 수정 메뉴에서 편집할 수 있습니다.`);
  }

  async function importFile(file) {
    if(palette.contentEditing)throw new Error('지금 편집하는 조각을 먼저 저장하거나 돌아가주세요.');
    if (file.size>EXAM_PROJECT_MAX_BYTES) throw new Error('최대 128 MiB 파일을 열 수 있습니다.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    await stableSave();
    if (/\.(5e|5exam|json)$/i.test(file.name)) await loadProject(bytes);
    else await loadDocument(bytes,file.name);
  }

  async function ensureBridge() {
    if (bridge) return;
    panel.querySelector('#exam-studio').replaceChildren();
    bridge = await RhwpExamBridge.create(panel.querySelector('#exam-studio'), {
      validateSource:prepareLoadedProject,
      onChange:error=>{if(error)message(error.message,true);else documentChanged();},
      onBeforeReplace:stableSave,
      onReplace:()=>{
        if(initializing) return;
        cancelPlacement();void closeInline();endEdit();figures=new Map();projectId=crypto.randomUUID();documentGeneration=bridge.generation;nameInput.value='불러온 시험지';stamp++;
      },
      onEdit:(id, ref) => { if (!busy) void run(() => beginInline(id, ref)); },
    });
    bridge.editor.element.contentDocument.addEventListener('focusin',preserveMenuFocus,true);
    bridge.editor.element.contentDocument.addEventListener('keydown', saveShortcut, true);
    bridge.editor.element.contentDocument.addEventListener('keydown', closeOpenMenu, true);
    bridge.editor.element.contentDocument.addEventListener('keydown', confirmPlacementWithKey, true);
    bridge.editor.element.contentDocument.addEventListener('keydown', event => {
      if (event.key === 'Escape' && bridge.canReturnOnEscape(event)) closeWorkspaceWithEscape(event);
    }, true);
    // Embed chrome omits file open/save commands; the host's File menu owns
    // both HWP and .5e operations. Keep the remaining native page settings clear.
    const nativeFileTitle=bridge.editor.element.contentDocument.querySelector('[data-menu="file"] .menu-title');
    if (nativeFileTitle) {nativeFileTitle.removeAttribute('data-i18n');nativeFileTitle.textContent='문서 설정';}
    bridge.editor.element.contentDocument.addEventListener('pointerdown',closeMenus,true);
    bridge.editor.element.contentDocument.addEventListener('drop',event=>{
      const file=event.dataTransfer?.files?.[0];if(!file || !/\.(5e|5exam|json|hwp|hwpx)$/i.test(file.name)) return;
      event.preventDefault();event.stopImmediatePropagation();
      void run(()=>importFile(file));
    },true);
    bridge.editor.element.contentDocument.addEventListener('compositionstart', () => {
      composing = true;
      clearTimeout(timer);clearTimeout(maintenanceTimer);
      cancelAnimationFrame(figureFrame);figureFrame = 0;
    },true);
    bridge.editor.element.contentDocument.addEventListener('compositionend', () => {
      composing = false;
      // The native end handler runs after this capture listener. It can finish
      // or cancel a composition without emitting another document change.
      queueMicrotask(documentChanged);
    },true);
    bridge.editor.element.contentDocument.addEventListener('keyup', scheduleFigures);
    bridge.editor.element.contentDocument.addEventListener('pointerup', event => {
      scheduleFigures();
      if (!placement || placement.existing || !event.target.closest?.('#scroll-content')) return;
      requestAnimationFrame(() => {
        if (!placement || placement.existing) return;
        placement.target = bridge.insertionTarget();
        panel.querySelector('[data-placement-hint]').textContent = placement.target ? (placement.target.position.cellPath?.length ? '표 셀을 선택했습니다. 확인하면 이 위치에 들어갑니다.' : '본문 위치를 선택했습니다. 확인하면 이 위치에 들어갑니다.') : '본문이나 표 셀을 선택해주세요.';
        updatePlacement();
      });
    });
    bridge.watchView(()=>{if(!inlineSession&&!editing)syncPictureControls();});
    bridge.deps.eventBus.on('picture-object-selection-changed',scheduleFigures);
    await bridge.newDocument();documentGeneration=bridge.generation;
    await palette.attach();
    toolModes.attach();
    restoredDraft = await readExamDraft().catch(() => null);
    initializing = false;
    savedToken = token();
    panel.querySelector('[data-exam-action="restore"]').hidden = !restoredDraft;
    message('시험지를 작성하거나, 현재 5E 그림을 넣어보세요.'); renderFigures();
  }
  async function open() {
    // Startup creates this workspace before autosaveReady is assigned. Yield
    // once, then let recovery own the modal surface until its choice is made.
    await Promise.resolve();
    await services.whenReady?.();
    if(editing && !editing.remote){await returnFromEdit();if(location.protocol==='file:')return;}
    if (location.protocol === 'file:') {
      if (window.fiveEDesktop?.exam?.open) {
        try { await window.fiveEDesktop.exam.open({source:clone(serialize(state.get()))}); }
        catch { panel.hidden = false; syncBackground(); message('시험지 창을 열지 못했습니다. 다른 5E 시험지 창을 닫고 다시 열어주세요.', true); }
      } else { message('시험지 연동은 로컬 웹 미리보기에서 실행해주세요.', true); panel.hidden = false; }
      return;
    }
    panel.hidden = false;
    syncBackground();
    if (bridge) return;
    if (!opening) {
      const ownsBusy = !busy; if (ownsBusy) setBusy(true);
      opening = ensureBridge().finally(() => {opening = null;if (ownsBusy) setBusy(false);});
    }
    await opening;
  }
  nativeRegion.root.addEventListener('click',e=>{const b=e.target.closest('[data-exam-action]');if(b&&!b.disabled){nativeRegion.closeMenu();void run(()=>actions[b.dataset.examAction]?.());}});
  const actions = {
    close:async () => {await flushInline(true);await closeInline();if (window.fiveEExam) return window.fiveEExam.returnToSource(); await fadeOut(panel); panel.hidden = true; syncBackground(); await resumeLinkedPage();document.querySelector('.app-switch-image [data-app-switch="hwp"]')?.focus(); },
    new:async () => { cancelPlacement();await stableSave();await closeInline(); initializing=true;await bridge.newDocument();initializing=false;documentGeneration=bridge.generation;projectId=crypto.randomUUID();figures = new Map(); nameInput.value = '새 시험지'; changed(); },
    insert:() => startSend(),
    // 집중 도구 줄 「그림 화면에서 넣기」: 그림 화면이 비었으면 안내만 한다(예전 아래 막대 단추의 동작).
    'insert-from-image':() => { if (!state.get().objects.length) throw new Error('그림 화면에 넣을 그림이 없습니다. 맨 위 「image」에서 그림을 만든 뒤 누르세요.'); return startSend(); },
    'cancel-placement':() => {cancelPlacement();message('그림 보내기를 취소했습니다.');},
    'confirm-placement':confirmPlacement,
    edit:() => { const ref=bridge.input.cursor.getSelectedPictureRef();if(ref?.type!=='image') throw new Error('시험지에서 그림을 선택해주세요.');return beginEdit(bridge.selectedFigureId(),ref); },
    labels:() => { const ref=bridge.input.cursor.getSelectedPictureRef();if(ref?.type!=='image') throw new Error('시험지에서 그림을 선택해주세요.');return beginInline(bridge.selectedFigureId(),ref); },
    save:async () => { const blob = await stableSave(); download(blob, `${safeName(nameInput.value)}.5e`); message('작업 파일 다운로드를 시작했습니다. 그림 원본도 함께 들어 있습니다.'); },
    // 맨 위 줄 공통 되돌리기·다시 실행(세 프로그램 같은 자리): 한글 편집 기록을 되돌린다.
    undo:() => { bridge.input?.performUndo?.(); renderFigures(); },
    redo:() => { bridge.input?.performRedo?.(); renderFigures(); },
    'structure-lock':() => { const locked=!bridge.tableLayoutLocked;bridge.setTableLayoutLocked(locked);panel.querySelector('[data-exam-action="structure-lock"]').setAttribute('aria-pressed',String(locked));message(locked?'구조 잠금 · 글만 고칠 수 있습니다. 표·그림의 크기나 틀은 잠금을 풀고 바꾸세요.':'구조 잠금 풀림 · 표·그림의 크기와 틀을 고칠 수 있습니다.'); },
    'open-hwp':() => panel.querySelector('#exam-hwp-file').click(),
    'open-project':() => panel.querySelector('#exam-project-file').click(),
    // ExamPool에 만들어 둔 시험지를 골라 바로 연다(ExamPool 「한글로 보내기」와 같은 조판).
    'open-exampool':() => toolModes.openExamPool(panel.querySelector('[data-exam-menu="file"]')),
    'export-hwpx':() => exportDocument('hwpx'),
    'export-hwp':() => exportDocument('hwp'),
    'export-png':async () => {
      const figure = figures.get(bridge.selectedFigureId()); if (!figure) throw new Error('시험지에서 저장할 그림을 먼저 선택해주세요.');
      flushFigureNames();
      const ref = bridge.findFigure(figure.id), bytes = bridge.pictureBytes(ref);
      download(new Blob([bytes], {type:'image/png'}), `${safeName(figure.name)}.png`);
      message('편집 원본을 포함한 PNG 다운로드를 시작했습니다.');
    },
    'open-png':() => panel.querySelector('#exam-png-file').click(),
    restore:showDrafts,
    demo:async () => {
      const source = activeSource(), page = source.pages[0]; page.name = '속력 그래프'; page.artboard = { w:80, h:50 };
      const line = (id, x1, y1, x2, y2, order) => ({ id, type:'line', p1:{x:x1-40,y:y1-25}, p2:{x:x2-40,y:y2-25}, layerId:page.layers[0].id, order, rotation:0, strokeLevel:0, strokeWidth:0.3, lineMode:'solid', arrowHead:'none', locked:false });
      page.objects = [line('demo-x',10,40,72,40,0), line('demo-y',10,40,10,7,1), line('demo-a',10,40,35,15,2), line('demo-b',35,15,65,15,3)];
      page.guides = [];
      bridge.insertText('1. 그림은 물체의 운동을 나타낸 것이다. 그래프를 보고 물음에 답하시오.');
      bridge.insertParagraph();
      await insertSource(source, '속력 그래프');
    },
  };
  async function resumeLinkedPage() {
    if (!bridge || !panel.hidden) return;
    const page=state.get().pages.find(p=>p.id===state.get().activePageId),link=page?.meta?.examLink;
    if (!link) return;
    if (editing?.figure.link.tabId===link.tabId && editing?.figure.link.assetId===link.assetId) return;
    if(editing) {const wasHidden=panel.hidden;endEdit();panel.hidden=wasHidden;syncBackground();}
    const figure=[...figures.values()].reverse().find(f=>f.link.tabId===link.tabId && f.link.assetId===link.assetId && bridge.findFigure(f.id));
    if (figure) await beginEdit(figure.id,bridge.findFigure(figure.id));
  }
  window.addEventListener('5e:exam-edit-linked-page',()=>void run(resumeLinkedPage));
  window.addEventListener('5e:exam-unlink-page',event=>{
    connectedAi?.unlinkExamTask?.(event.detail?.link);
    if (editing && !tabs.pageForLink(editing.figure.link)) {
      const wasHidden=panel.hidden;endEdit();panel.hidden=wasHidden;syncBackground();
    }
    syncSourceCrop();
  });
  async function saveEditingProject() {
    if (editing?.external) {await window.fiveEDesktop.exam.saveWorkspace();return;}
    await actions.save();
  }
  async function showDrafts() {
    const rows=await listExamDrafts();
    if (!rows.length) {if(restoredDraft) await loadProject(restoredDraft);return;}
    const box=document.createElement('dialog');box.className='exam-draft-dialog';
    const heading=document.createElement('h3');heading.textContent='자동 저장한 프로젝트';box.append(heading);
    for(const row of rows){const button=document.createElement('button');button.type='button';button.textContent=`${row.name} · ${new Date(row.updatedAt).toLocaleString('ko-KR')}`;button.onclick=()=>{box.close();box.remove();void run(async()=>{await stableSave();await loadProject(await readExamDraft(row.projectId));});};box.append(button);}
    const close=document.createElement('button');close.textContent='닫기';close.onclick=()=>{box.close();box.remove();};box.append(close);document.body.append(box);box.showModal();
  }
  async function exportDocument(format) {
    await stableSave();
    const bytes = format === 'hwp' ? await bridge.exportHwp() : await bridge.exportHwpx();
    download(new Blob([bytes]), `${safeName(nameInput.value)}.${format}`);
    message('한글 파일 다운로드를 시작했습니다. 연결된 PNG에 그림 원본이 들어 있습니다.');
  }
  let fileMenuFocus, menuFocusLifetime=0;
  panel.addEventListener('focusin',e=>{if(e.target.closest('.exam-menu'))fileMenuFocus=e.target;});
  function preserveMenuFocus(){
    const open=panel.querySelector('[data-exam-menu][aria-expanded="true"]');if(!open || document.activeElement?.closest('.exam-menu'))return;
    const lifetime=menuFocusLifetime;
    queueMicrotask(()=>{
      if(lifetime!==menuFocusLifetime || !panel.isConnected || panel.hidden || !panel.getClientRects().length ||
        open.getAttribute('aria-expanded')!=='true' || document.activeElement?.closest('.exam-menu'))return;
      const target=fileMenuFocus?.isConnected&&fileMenuFocus.getClientRects().length?fileMenuFocus:open;
      if(!target.disabled)target.focus({preventScroll:true});
    });
  }
  document.addEventListener('focusin',preserveMenuFocus,true);
  function closeMenus() {
    menuFocusLifetime++;
    nativeRegion.closeMenu();
    panel.querySelectorAll('[data-exam-menu]').forEach(button => {
      button.setAttribute('aria-expanded','false');
      panel.querySelector(`#${button.getAttribute('aria-controls')}`).hidden = true;
    });
  }
  function openMenu(button,focus = false) {
    closeMenus(); button.setAttribute('aria-expanded','true');
    const menu = panel.querySelector(`#${button.getAttribute('aria-controls')}`); menu.hidden = false;
    const rect=button.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top=`${rect.bottom+6}px`;
    menu.style.maxHeight=`${Math.max(80,innerHeight-rect.bottom-14)}px`;
    button.focus({preventScroll:true});
    if (focus) [...menu.querySelectorAll('button')].find(item => !item.hidden && item.getClientRects().length && !item.disabled)?.focus();
  }
  panel.addEventListener('dragover',event=>event.preventDefault());
  panel.addEventListener('drop',event=>{
    const file=event.dataTransfer?.files?.[0];if(!file) return;event.preventDefault();
    if(/\.(5e|5exam|json|hwp|hwpx)$/i.test(file.name)) void run(()=>importFile(file));
  });
  // 왼쪽 칸 접기(5E_image·5E_exam과 같은 자리·모양, 10-20): 상태는 기억한다.
  const leftKey='5e.hwp.leftCollapsed';const setLeft=collapsed=>{panel.classList.toggle('exam-left-collapsed',collapsed);const t=panel.querySelector('[data-exam-panel]');t?.setAttribute('aria-pressed',String(!collapsed));t?.setAttribute('title',collapsed?'왼쪽 칸 펴기':'왼쪽 칸 접기');t?.setAttribute('aria-label',collapsed?'왼쪽 칸 펴기':'왼쪽 칸 접기');try{localStorage.setItem(leftKey,collapsed?'1':'0');}catch{}};
  try{setLeft(localStorage.getItem(leftKey)==='1');}catch{setLeft(false);}
  panel.querySelector('[data-exam-panel]')?.addEventListener('click',()=>setLeft(!panel.classList.contains('exam-left-collapsed')));
  panel.addEventListener('click', event => {
    const menu = event.target.closest('[data-exam-menu]');
    if (menu && !menu.disabled) {if (menu.getAttribute('aria-expanded') === 'true') closeMenus(); else openMenu(menu);return;}
    const button = event.target.closest('[data-exam-action]');
    if (button && !button.disabled) {
      const action=button.dataset.examAction;
      if(palette.contentEditing&&['close','new','open-hwp','open-project','demo','restore'].includes(action)){
        message('조각 편집을 저장하거나 돌아간 뒤 실행해주세요.',true);
        return;
      }
      closeMenus();
      void run(() => actions[action]?.()).then(()=>{
        // The opener becomes focusable after run releases its busy state.
        if(action==='close' && panel.hidden && !window.fiveEExam)document.querySelector('.app-switch-image [data-app-switch="hwp"]')?.focus();
      });
    }
  });
  document.addEventListener('pointerdown', event => {if (!event.target.closest('.exam-menu,.exam-region-surface')) closeMenus();});
  function closeOpenMenu(event) {
    if (event.key!=='Escape' || event.isComposing) return;
    const open=panel.querySelector('[data-exam-menu][aria-expanded="true"]');
    if (!open) return;
    event.preventDefault();event.stopImmediatePropagation();closeMenus();open.focus({preventScroll:true});
  }
  document.addEventListener('keydown',closeOpenMenu,true);
  function confirmPlacementWithKey(event) {
    if (!placement || panel.hidden || event.isComposing || event.keyCode === 229 || compositionActive() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !['Enter',' '].includes(event.key)) return;
    const nativeInput = event.target === bridge?.input?.textarea;
    if (!nativeInput && event.target.closest?.('input,textarea,select,button,[contenteditable="true"]')) return;
    const owner = event.target?.ownerDocument || document;
    if ([...owner.querySelectorAll('dialog[open],.modal-overlay,[role="dialog"],[role="alertdialog"]')].some(node=>node!==panel && !node.hidden && node.getClientRects().length)) return;
    consumeConfirmationPress(event);
    const button = panel.querySelector('[data-exam-action="confirm-placement"]');
    if (!event.repeat && !button.disabled) void run(confirmPlacement);
  }
  document.addEventListener('keydown',confirmPlacementWithKey,true);
  function closeWorkspaceWithEscape(event) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.repeat || compositionActive() || panel.hidden || busy) return;
    // Inner dialogs, label editing and RHWP's own cancellation get first use.
    if (inlineEditor.active || !pictureSettings.root.hidden) return;
    const owner = event.target?.ownerDocument || document;
    if ([...owner.querySelectorAll('dialog[open],.modal-overlay,[role="dialog"],[role="alertdialog"]')]
      .some(node => node !== panel && !node.hidden && node.getClientRects().length)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (placement) { cancelPlacement(); message('그림 보내기를 취소했습니다.'); return; }
    void run(actions.close).then(() => {
      if (panel.hidden && !window.fiveEExam) document.querySelector('.app-switch-image [data-app-switch="hwp"]')?.focus();
    });
  }
  document.addEventListener('keydown',closeWorkspaceWithEscape);
  panel.addEventListener('keydown', event => {
    const trigger = event.target.closest('[data-exam-menu]');
    const menu = event.target.closest('.exam-menu-popup');
    if (trigger && event.key === 'ArrowDown') {event.preventDefault();openMenu(trigger,true);}
    else if (menu && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll('button')].filter(item => !item.hidden && item.getClientRects().length && !item.disabled);
      const index = items.indexOf(document.activeElement), next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') closeMenus();
  });
  state.subscribe(() => {syncSourceCrop();scheduleSourcePosition();syncTabNames();if(!window.fiveEExam && !restoringWorkspace) {workspaceChanged();}});
  let publishTimer;
  function workspaceChanged() {
    scheduleSourcePosition();workspaceStamp++;scheduleSave();
    if(window.fiveEDesktop?.exam?.workspaceChanged) {clearTimeout(publishTimer);publishTimer=setTimeout(()=>void window.fiveEDesktop.exam.workspaceChanged().catch(()=>{}),250);}
  }
  window.addEventListener('5e:exam-workspace-changed',workspaceChanged);
  window.fiveEExam?.onWorkspaceChanged(()=>{workspaceStamp++;scheduleSave();void refreshInline().catch(error=>message(error.message,true));});
  window.addEventListener('5e:exam-ai-names-changed',() => syncTabNames('ai'));
  const receiveNames = names => {
    remoteNames.clear();for (const {link,name} of names) {validateExamLink(link);remoteNames.set(linkKey(link),name);}
    renderedFigures = ''; renderFigures(); scheduleSave();
  };
  window.fiveEExam?.onNames(receiveNames);
  if (window.fiveEExam) void window.fiveEExam.getNames().then(receiveNames).catch(error => message(error.message,true));
  nameInput.addEventListener('input', changed);
  function saveShortcut(event) {
    if ((panel.hidden && bar.hidden) || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault(); event.stopImmediatePropagation();
    void run(saveEditingProject);
  }
  document.addEventListener('keydown', saveShortcut, true);
  async function returnFromEdit(){
    services.commitActiveText?.();
    const session=editing;
    if(editing?.external)await window.fiveEDesktop.exam.finish({requestId:editing.requestId,apply:false});
    endEdit();
    if (session && !session.external) await bridge?.revealFigure(session.id,{generation:session.generation});
    message('한글 문서의 원래 그림으로 돌아왔습니다. 수정 내용은 작업 탭에 남아 있습니다.');scheduleSave();
  }
  async function readFile(input, load, maxBytes = EXAM_PROJECT_MAX_BYTES) {
    const file = input.files[0]; if (!file) return;
    try {
      await run(async () => {
        if (file.size > maxBytes) throw new Error(`최대 ${maxBytes / (1024 * 1024)} MiB 파일을 열 수 있습니다.`);
        // Safari can revoke a selected disk file when the picker is cleared.
        // Retain the selection until all bytes have been copied into memory.
        let bytes;
        try { bytes = new Uint8Array(await file.arrayBuffer()); }
        catch (cause) {
          // FileReader uses Safari's picker-granted file access directly. Keep
          // the selected File alive throughout the provider download/read.
          try {bytes=new Uint8Array(await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.onabort=()=>reject(new Error('파일 읽기가 취소되었습니다.'));reader.readAsArrayBuffer(file);}));}
          catch(error){throw new Error(`“${file.name}”을 읽지 못했습니다. 저장 위치의 파일 읽기가 완료되지 않았습니다. 파일을 다시 선택해 주세요.`,{cause:error});}
        }
        await stableSave(); await load(bytes, file.name);
        if (input.id === 'exam-hwp-file' && pendingDocumentInsertion) {
          const captured = pendingDocumentInsertion;
          pendingDocumentInsertion = null;
          await preparePlacement(captured);
        }
      });
    } finally {
      if (input.files?.[0] === file) input.value = '';
    }
  }
  panel.querySelector('#exam-project-file').addEventListener('change', event => readFile(event.target, loadProject));
  panel.querySelector('#exam-hwp-file').addEventListener('change', event => readFile(event.target, loadDocument));
  panel.querySelector('#exam-png-file').addEventListener('change', event => readFile(event.target, async bytes => {
    const figure = readEditablePng(bytes, prepareLoadedProject);
    if (!figure) throw new Error('이 PNG에는 5E 원본이 없습니다. 원본 포함 PNG나 .5e 파일을 열어주세요.');
    await aiReady; await tabs.activate(figure); actions.close();
  },EDITABLE_PNG_MAX_BYTES));
  window.addEventListener('beforeunload', event => {
    if (editing || (bridge?.input && savedToken !== token())) { event.preventDefault(); event.returnValue = ''; }
  });
  // 그림 화면 아래 막대의 「한글에 넣기」 단추는 10-21 사용자 결정으로 없앴다(입구는 맨 위 줄 「hwp」 하나).
  // 지금 그림에서 영역을 골라 넣는 동작은 5E_hwp 집중 도구 줄 「그림 → 그림 화면에서 넣기」와 다른 창의 보내기 요청(5e:exam-send-canvas)으로 한다.
  // 초기화가 여기까지 끝났다는 표시(예전에는 이 자리에서 붙던 아래 막대 단추가 그 신호였다 — 검사 도우미 ready가 기다린다).
  panel.dataset.examReady = 'true';
  // 맨 위 줄 「hwp」(app-switch.js)가 한글 문서를 연다.
  // 맨 위 전환 줄의 「hwp」. 다른 작업으로 바쁘면 받지 않고, 받았는지는 detail.accepted로 알려 전환 쪽이 잠시 뒤 다시 부탁하게 한다.
  window.addEventListener('5e:hwp-open',event=>{if(busy)return;if(event.detail)event.detail.accepted=true;void run(open);});
  panel.querySelector('#exam-hwp-file').addEventListener('cancel',()=>{pendingDocumentInsertion=null;message('문서 열기를 취소했습니다.');});
  // 다른 창에서 보내 온 요청은 조판 창이 바쁘면 예전에는 알림 없이 버려졌다(점검 하). 버리는 대신 이유를 알린다.
  const sendFromElsewhere = task => {
    if (busy) {const text='한글 시험지 창이 다른 작업 중이라 보내지 못했습니다. 작업이 끝난 뒤 다시 보내세요.';message(text,true);if(panel.hidden)void services.reportError?.(text);return;}
    void run(task);
  };
  window.addEventListener('5e:exam-send-ai', event => sendFromElsewhere(() => startSend(event.detail)));
  window.addEventListener('5e:exam-send-graph', event => sendFromElsewhere(() => startSend(null,event.detail)));
  // 5E 라이브러리 창 「보내기 → 한글 시험지로」: 그림을 작업대에 넣은 뒤 「현재 영역 삽입…」과 같은 길로 보낸다.
  window.addEventListener('5e:exam-send-canvas', () => sendFromElsewhere(() => startSend()));
  async function receiveSource(path) {
    const request = ++incomingRequest;
    const response = await fetch(path, {cache:'no-store'}); if (!response.ok) throw new Error('그림 열기 요청이 만료되었습니다.');
    const payload = await response.json(), source = payload.source || payload; prepareLoadedProject(source);
    await services.whenReady?.();
    if (request !== incomingRequest) return;
    if (payload.captured) { await preparePlacement({...payload.captured,source});return; }
    if (editing) { pendingSource = source; message('새 그림을 받았습니다. 현재 그림 편집을 마치면 불러옵니다.'); }
    else { applyLoaded(state, source); message('5E에서 보낸 그림을 받았습니다. 현재 그림 넣기로 시험지에 넣으세요.'); }
  }
  window.addEventListener('5e:exam-source-url', event => {
    if (!/^\/exam-seed\/[a-f0-9]{48}$/.test(event.detail)) return;
    void receiveSource(event.detail).catch(error => message(error.message, true));
  });
  if (new URLSearchParams(location.search).get('exam') === '1') void (async () => {
    const seed = new URLSearchParams(location.search).get('examSeed');
    let sourceError;
    if (seed && /^[a-f0-9]{48}$/.test(seed)) {
      try { await receiveSource(`/exam-seed/${seed}`); } catch (error) { sourceError = error; }
    }
    await open();
    if (sourceError) message('그림 전달이 만료되었습니다. 5E에서 시험지를 다시 열거나 자동 저장을 이어서 여세요.', true);
  })().catch(error => message(error.message, true));
  services.configurePortableProjectIO({saveExam:async()=>{
    if(window.fiveEDesktop?.exam?.projectSnapshot){const bytes=await window.fiveEDesktop.exam.projectSnapshot();return bytes?new Blob([bytes],{type:'application/zip'}):null;}
    return bridge?.input ? stableSave() : null;
  },snapshot:captureWorkspace,restore:restoreWorkspace,openExam:async bytes=>{await open();if(location.protocol==='file:' && window.fiveEDesktop?.exam?.openProject) await window.fiveEDesktop.exam.openProject(bytes.buffer);else {await stableSave();await loadProject(bytes);}/* 다른 열기 경로처럼 지금 작업을 먼저 저장(H4) */}});
  window.fiveEDesktop?.exam?.onWorkspaceRequest(async request=>{
    try {
      let value;
      if (request.ownerRequest) {
        const {editRequestId,link} = request.ownerRequest;
        if (!editing?.external || editing.requestId !== editRequestId || editing.figure.link.tabId !== link.tabId || editing.figure.link.assetId !== link.assetId) throw new Error('시험지 편집 연결이 만료되었습니다.');
        const page = tabs.pageForLink(link);
        value = {pageId:page?.id || null,activePageId:state.get().activePageId,link:page ? clone(page.meta.examLink) : null,ai:connectedAi?.activeExamTask?.() || null};
      } else value=request.restore?await restoreWorkspace(request.restore):await captureWorkspace();
      await window.fiveEDesktop.exam.workspaceReply({requestId:request.requestId,value});
    }
    catch(error){await window.fiveEDesktop.exam.workspaceReply({requestId:request.requestId,error:error.message});}
  });
  window.fiveEDesktop?.exam?.onAnnotationsRequest(async request=>{
    try {
      await services.whenReady?.();await aiReady;
      const figure=normalizeExamFigure(request.figure);prepareLoadedProject(figure.source);
      let value;
      if(request.kind === 'read') value=await tabs.readAnnotations(figure);
      else if(request.kind === 'patch') value=await tabs.patchAnnotations(figure,request.baseline,request.edited,{render:request.render});
      else if(request.kind === 'revision') {await tabs.markAnnotationRevision(figure);value={labels:annotationsFor(figure.source)};}
      else throw new Error('지원하지 않는 라벨 편집 요청입니다.');
      await window.fiveEDesktop.exam.annotationsReply({requestId:request.requestId,value});
    } catch(error) {await window.fiveEDesktop.exam.annotationsReply({requestId:request.requestId,error:error.message});}
  });
  window.fiveEDesktop?.exam?.onEdit(async request => {
    await services.whenReady?.(); await aiReady;
    while (busy) await new Promise(resolve => setTimeout(resolve,20));
    await run(async () => {
      try {
        if (editing) throw new Error('현재 그림 편집을 마친 뒤 다른 그림을 여세요.');
        const figure = normalizeExamFigure(request.figure); prepareLoadedProject(figure.source);
        const activated = await tabs.activate(figure);
        editing = {...activated,id:figure.id,external:true,requestId:request.requestId};
        bar.querySelector('#exam-edit-name').textContent = `${figure.name} 편집 중`;
        editing.baseBounds=clone(figure.render?.bounds);bar.hidden=false;syncSourceControls();document.body.classList.add('exam-editing');syncBackground();
        message('원래 작업 탭입니다. 수정한 뒤 시험지에 반영하세요.');
      } catch (error) {await window.fiveEDesktop.exam.finish({requestId:request.requestId,error:error.message});throw error;}
    });
  });
  window.fiveEExam?.onProjectOpen(async request=>{
    while(busy) await new Promise(resolve=>setTimeout(resolve,20));
    await run(async()=>{
      try{endEdit();await stableSave();await loadProject(new Uint8Array(request.bytes));await window.fiveEExam.projectSnapshotReply({requestId:request.requestId});}
      catch(error){await window.fiveEExam.projectSnapshotReply({requestId:request.requestId,error:error.message});throw error;}
    });
  });
  window.fiveEExam?.onProjectSnapshot(async request=>{
    try{const blob=await stableSave();await window.fiveEExam.projectSnapshotReply({requestId:request.requestId,bytes:await blob.arrayBuffer()});}
    catch(error){await window.fiveEExam.projectSnapshotReply({requestId:request.requestId,error:error.message});}
  });
  window.fiveEExam?.onSaveWorkspace(()=>void run(actions.save));
  window.fiveEExam?.onResult(async result => {
    while (busy) await new Promise(resolve => setTimeout(resolve,20));
    await run(async () => {
      if (!editing?.remote || editing.requestId !== result.requestId) {await window.fiveEExam.ack({requestId:result.requestId,error:'시험지의 편집 연결이 만료되었습니다.'});return;}
      try {
        let figure;
        if (result.error) {endEdit();message(result.error,true);}
        else if (result.apply) {figure = await commitEdit(result.captured);}
        else {endEdit();message('시험지로 돌아왔습니다. 5E의 수정 내용은 작업 탭에 남아 있습니다.');scheduleSave();}
        await window.fiveEExam.ack({requestId:result.requestId,...(figure ? {figure} : {})});
        if (pendingSource?.source && pendingSource?.render) {const next = pendingSource;pendingSource = null;await preparePlacement(next);}
      } catch (error) {await window.fiveEExam.ack({requestId:result.requestId,error:error.message});throw error;}
    });
  });
  window.fiveEDesktop?.exam?.onCancel(() => {if (editing?.external) {endEdit();message('시험지 창을 닫았습니다. 수정 내용은 5E 작업 탭에 남아 있습니다.');}});
  // ExamPool v1 boundary: content fields use the existing ExamPool names and
  // the image is an immutable confirmed snapshot. No live canvas is sampled.
  async function receiveQuestion(packet) {
    if (busy || placement || editing) throw new Error('현재 한글 그림 작업을 마친 뒤 문항을 보내세요.');
    if (location.protocol === 'file:') throw new Error('문항 전달은 로컬 웹 미리보기에서 한글 편집기를 열어 사용하세요.');
    const q = packet?.question, snapshot = packet?.figure;
    if (packet?.format !== '5e-exampool' || packet.version !== 1 || !q || typeof q.id !== 'string' ||
        !['number','passage','ask'].every(key => typeof q[key] === 'string') || !Array.isArray(q.bogi_items) || !Array.isArray(q.choices) || q.choices.length !== 5) throw new Error('문항 전달 데이터가 올바르지 않습니다.');
    let image, figure;
    if (snapshot) {
      if (!snapshot.confirmedAt || !/^data:image\/png;base64,/.test(snapshot.png)) throw new Error('확정한 그림이 아닙니다.');
      const raw = Uint8Array.from(atob(snapshot.png.split(',')[1]), char => char.charCodeAt(0));
      const id = crypto.randomUUID();
      if (snapshot.source) {
        prepareLoadedProject(clone(snapshot.source));
        figure = normalizeExamFigure({id,name:snapshot.name,version:1,source:clone(snapshot.source),render:clone(snapshot.render),
          link:{tabId:crypto.randomUUID(),assetId:crypto.randomUUID()},
          exampool:{questionId:q.id,assetId:snapshot.assetId,confirmedRevisionId:snapshot.id,confirmedAt:snapshot.confirmedAt}});
      }
      image = {id,bytes:figure ? embedEditablePng(raw,figure,prepareLoadedProject) : raw,
        widthMm:Math.min(80,snapshot.widthMm),heightMm:snapshot.heightMm*Math.min(1,80/snapshot.widthMm),pixelWidth:snapshot.pixelWidth,pixelHeight:snapshot.pixelHeight};
    }
    await open();
    if (busy || placement || editing) throw new Error('한글 편집기가 준비된 뒤 다시 보내세요.');
    setBusy(true);
    try {
      await flushInline(true);await closeInline();await repairLinks();
      const input = bridge.input, cursor = input.getCursorPosition();
      if (cursor.cellPath?.length || input.cursor.isInHeaderFooter?.() || input.cursor.isInFootnote?.()) throw new Error('한글 본문에 커서를 놓고 문항을 다시 보내세요.');
      const textAlignment = bridge.wasm.getParaPropertiesAt(cursor.sectionIndex,cursor.paragraphIndex)?.alignment || 'justify';
      const lines = text => String(text).split(/\r?\n/);
      bridge.transaction('exampool-question', () => {
        if (bridge.wasm.getParagraphLength(cursor.sectionIndex,cursor.paragraphIndex)>0) bridge.insertParagraph();
        const append = text => {for (const line of lines(text)) {bridge.insertText(line);bridge.insertParagraph();}};
        append((q.number ? q.number + '. ' : '') + q.passage);
        if (image) {
          const ref = bridge.insertFigure(image);
          // RHWP's text length excludes picture controls. Splitting at zero
          // moves the picture to the next paragraph, then every following line.
          const offsets = bridge.wasm.getControlTextPositions(ref.sec,ref.ppi);
          const after = Math.max(bridge.wasm.getParagraphLength(ref.sec,ref.ppi),...offsets.map(offset => offset+1));
          const split = JSON.parse(bridge.wasm.splitParagraph(ref.sec,ref.ppi,after,null));
          if (!split.ok) throw new Error('그림 뒤의 문단을 만들지 못했습니다.');
          input.cursor.moveTo({sectionIndex:ref.sec,paragraphIndex:split.paraIdx,charOffset:0});
          bridge.wasm.applyParaFormat(ref.sec,split.paraIdx,JSON.stringify({alignment:textAlignment}));
        }
        append(q.ask);
        if (q.bogi_items.some(row => row.text.trim())) {append('〈보기〉');q.bogi_items.forEach((row,index) => append((row.label || ['ㄱ','ㄴ','ㄷ'][index] || String(index+1)) + '. ' + row.text));}
        q.choices.forEach((row,index) => append(['①','②','③','④','⑤'][index] + ' ' + row.text));
        return true;
      });
      if (figure) figures.set(figure.id,figure);
      changed();message('문항과 확정 그림을 넣었습니다. 한글에서 최종 조판하고 .hwp 또는 .hwpx로 저장하세요.');
    } finally {setBusy(false);}
  }
  // ExamPool 시험지 구성에서 만든 시험지 한 부(HWPX)를 5E 시험지 편집기에서 연다(최종 검수).
  async function receiveExamDocument(bytes,name){
    if(busy||placement||editing)throw Error('현재 한글 그림 작업을 마친 뒤 시험지를 보내세요.');
    // 바꾸기 전에 지금 문서를 자동 저장한다(H4와 같은 이유). 예전에는 마지막 0.9초 안의 수정을 잃었다(점검 하).
    await open();if(bridge?.input)await stableSave();await loadDocument(new Uint8Array(bytes),`${String(name||'5E_exam 시험지').replace(/[\\/:*?"<>|]/g,' ').slice(0,180)}.hwpx`);
    message('5E_exam 시험지를 열었습니다. 최종 검수 후 한글로 저장하세요.');
  }
  async function receiveStructuredQuestion(packet){
    if(busy||placement||editing)throw Error('현재 한글 그림 작업을 마친 뒤 문항을 보내세요.');
    if(location.protocol==='file:')throw Error('로컬 웹 미리보기에서 문항 시트를 열어 한글로 보내세요.');
    if(packet?.format!=='5e-question-sheet-v2'||![1,2].includes(packet.version))throw Error('문항 전달 형식이 올바르지 않습니다.');
    await open();if(busy||placement||editing)throw Error('한글 편집기가 준비된 뒤 다시 보내세요.');setBusy(true);
    try{
      if(packet.version===2){
        await flushInline(true);await closeInline();await repairLinks();
        const input=bridge.input,cursor=input.getCursorPosition();
        if(cursor.cellPath?.length||input.cursor.isInHeaderFooter?.()||input.cursor.isInFootnote?.())throw Error('한글 본문에 커서를 놓고 문항을 다시 보내세요.');
        const target=bridge.wasm.borrowDocumentHandle(),Document=target.constructor,source=await openApprovedQuestion(Document,packet.question,packet.typeset);
        try{
          const empty=target.getSectionCount()===1&&target.getParagraphCount(0)===1&&target.getParagraphLength(0,0)===0;
          if(!empty&&!sameColumnGeometry(source,target,cursor.sectionIndex))throw Error(packet.typeset.pageMode==='question-column'?'문항 전용 용지와 현재 문서의 규격이 다릅니다. 문항 HWPX를 열어 작업하세요. 전체 시험지 조립은 추후 지원합니다.':`조판과 시험지의 용지·여백·단 너비가 다릅니다. 시험지를 ${packet.typeset.profile.paper}·${packet.typeset.profile.columns}단과 저장한 조판의 여백·단 간격으로 맞추거나 문항 HWPX를 열어 작업하세요.`);
          // 넣기가 실패하면 문서는 되돌아가므로 엄격 내보내기도 넣기 전 상태로 되돌린다(M2).
          const approvedBefore=bridge.approvedQuestionGeneration;
          await bridge.enableApprovedQuestionExport();
          let recovered;
          try{bridge.transaction('approved-question',()=>{
            if(empty){target.setPageDef(0,source.getPageDef(0));const col=JSON.parse(source.getColumnDef(0));target.setColumnDef(0,col.columnCount,col.columnType,col.sameWidth,col.spacing);}
            // Insert at a paragraph boundary; never split a native table or
            // replace the approved document with another HTML conversion.
            if(target.getParagraphLength(cursor.sectionIndex,cursor.paragraphIndex)>0)bridge.insertParagraph();
            const pos=input.getCursorPosition(),before=Math.max(1,pos.paragraphIndex);
            target.importParagraphBlock(source,nativeInsertOptions(source,pos.sectionIndex,before,true));
            const result=JSON.parse(target.importParagraphBlock(source,nativeInsertOptions(source,pos.sectionIndex,before))),inserted=result.operationResult?.result?.inserted;
            if(!inserted)throw Error('저장한 문항 조판을 넣지 못했습니다.');
            input.cursor.moveTo({sectionIndex:pos.sectionIndex,paragraphIndex:inserted.end-1,charOffset:0});
            recovered=bridge.recoverFigures(prepareLoadedProject);
            if(new Set([...figures.keys(),...recovered.keys()]).size>500)throw Error('시험지의 5E 그림은 500개까지 보관할 수 있습니다.');
            return true;
          });}catch(error){bridge.approvedQuestionGeneration=approvedBefore;throw error;}
          for(const [id,figure] of recovered)figures.set(id,figure);
          changed();renderFigures();message('저장한 조판을 넣었습니다. 글·표·수식·그림을 각각 편집할 수 있습니다.');
          return {warnings:[]};
        }finally{source.free();}
      }
      const position=bridge.input.getCursorPosition(),pageDef=bridge.wasm.getPageDef(position.sectionIndex),columnDef=bridge.wasm.getColumnDef(position.sectionIndex);
      if(columnDef.columnCount>1&&!columnDef.sameWidth)throw Error('문항을 넣을 단을 같은 너비로 맞춘 뒤 다시 보내세요.');
      const available=(pageDef.width-pageDef.marginLeft-pageDef.marginRight-(pageDef.marginGutter||0)-(columnDef.spacing||0)*(columnDef.columnCount-1))/Math.max(1,columnDef.columnCount)/75-32;
      if(available<120)throw Error('문항을 넣을 단이 너무 좁습니다. 단 수를 줄이거나 용지 너비를 넓혀주세요.');
      const width=Math.min(540,available);
      const plan=await buildQuestionHtml(packet.question,async f=>{
        const image=new Image();image.src=f.data;await image.decode();
        if(image.naturalWidth*image.naturalHeight>40000000)throw Error('한글로 보낼 그림 크기를 줄여주세요.');
        let bytes=Uint8Array.from(atob(f.data.split(',')[1]),c=>c.charCodeAt(0));
        if(!f.data.startsWith('data:image/png;')){
          const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);
          bytes=new Uint8Array(await(await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('그림을 PNG로 바꾸지 못했습니다.')),'image/png'))).arrayBuffer());
        }
        const original=readEditablePng(bytes,prepareLoadedProject)||(f.editable?.source?{id:f.editable.id||crypto.randomUUID(),name:f.name.slice(0,200),version:1,source:clone(f.editable.source),render:clone(f.editable.render)}:null);
        if(original){const independent=forkExamFigure(normalizeExamFigure(original));bytes=embedEditablePng(bytes,independent,prepareLoadedProject);}
        let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return {...f,data:'data:image/png;base64,'+btoa(raw),width:image.naturalWidth,height:image.naturalHeight};
      },width);
      await flushInline(true);await closeInline();await repairLinks();
      const Document=bridge.wasm.borrowDocumentHandle().constructor,staged=Document.createEmpty();
      try{staged.createBlankDocument();const result=JSON.parse(staged.pasteHtml(0,0,0,plan.html));if(!result.ok)throw Error('문항 구성을 한글로 읽지 못했습니다.');verifyNativeQuestion(staged,plan);}finally{staged.free();}
      const input=bridge.input,cursor=input.getCursorPosition();
      if(cursor.cellPath?.length||input.cursor.isInHeaderFooter?.()||input.cursor.isInFootnote?.())throw Error('한글 본문에 커서를 놓고 문항을 다시 보내세요.');
      let recovered;
      bridge.transaction('question-sheet',()=>{
        if(bridge.wasm.getParagraphLength(cursor.sectionIndex,cursor.paragraphIndex)>0)bridge.insertParagraph();
        const pos=input.getCursorPosition(),result=JSON.parse(bridge.wasm.pasteHtml(pos.sectionIndex,pos.paragraphIndex,pos.charOffset,plan.html));
        if(!result.ok)throw Error('문항을 넣지 못했습니다. 기존 시험지는 보존했습니다.');
        input.cursor.moveTo({sectionIndex:pos.sectionIndex,paragraphIndex:result.paraIdx??pos.paragraphIndex,charOffset:result.charOffset??0});
        recovered=bridge.recoverFigures(prepareLoadedProject);
        if(new Set([...figures.keys(),...recovered.keys()]).size>500)throw Error('시험지의 5E 그림은 500개까지 보관할 수 있습니다.');
        return true;
      });
      for(const [id,figure] of recovered)figures.set(id,figure);
      changed();renderFigures();message('문항을 넣었습니다. 글·표는 한글에서 편집하고 그림은 5E에서 수정할 수 있습니다.'+(plan.warnings.length?' '+plan.warnings.join(' '):''));
      return {warnings:plan.warnings};
    }finally{setBusy(false);}
  }
  return { receiveQuestion,receiveStructuredQuestion,receiveExamDocument, getAutosaveSnapshot:() => state.get(),setAiPanel:panel => {connectedAi = panel;resolveAi();observeSourceAi();syncTabNames();} };
}
