import { newQuestion, confirmFigure, questionHandoff, encodePool, decodePoolBundle, validateQuestion, POOL_MAX_BYTES } from './exampool-model.js?v=1013-exampool';
import { listQuestions, saveQuestion, importQuestions, listResources } from './exampool-store.js?v=1013-exampool';
import { initPoolReferences } from './exampool-references.js?v=1013-exampool';
import { embedEditablePng, readEditablePng } from './editable-png.js?v=1.7.0-four-session-integration';
import { getContentBounds } from './svg-export.js?v=1.7.0-four-session-integration';
import { syncAppLock } from './app-lock.js?v=1021-lock';
import { initQuestionSheet } from './exampool-sheet-workspace.js?v=1021-fix';

const copy = value => structuredClone(value);
const letters = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const choiceLabels = ['①','②','③','④','⑤'];
const bytesFor = png => Uint8Array.from(atob(png.split(',')[1]), ch => ch.charCodeAt(0));
function dataUrl(bytes) {
  let binary = '';for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
  return 'data:image/png;base64,' + btoa(binary);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url;link.download = name;link.click();setTimeout(() => URL.revokeObjectURL(url),30000);
}
export function initExamPoolWorkspace(state, services, examWorkspace) {
  initQuestionSheet(state,services,examWorkspace);
  let items = [], current = null, dirty = false, busy = false, timer, saving = Promise.resolve(), focusReturn, editStamp = 0;
  const panel = document.createElement('section');panel.id = 'exampool-workspace';panel.hidden = true;
  panel.setAttribute('aria-label','문항 설계');panel.dataset.mobileView='editor';
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  panel.innerHTML = `
    <header class="pool-header"><div><strong>5E_exam</strong><h1>문항 설계</h1></div>
      <div class="pool-actions"><button type="button" data-pool-action="import">문항 파일 열기</button><button type="button" data-pool-action="export">문항 파일 저장</button><button type="button" data-pool-action="close">그림 편집기로 돌아가기</button></div></header>
    <div class="pool-mobile-switch" aria-label="작업 영역"><button type="button" data-pool-view="editor" aria-pressed="true">문항 작성</button><button type="button" data-pool-view="references" aria-pressed="false">자료 열람</button></div>
    <div class="pool-body"><aside class="pool-sidebar" aria-label="문항 목록"><button type="button" data-pool-action="new" class="pool-primary">새 문항</button><div id="pool-list"></div><p class="pool-storage">입력 내용은 자동 저장됩니다.<br>문항 파일로 자료와 원본까지 함께 보관하세요.</p></aside>
    <main class="pool-main"><div id="pool-empty"><h2>자료를 보며 문항을 설계하세요</h2><p>옆에서 성취기준과 해설을 확인하고, 교과서·참고자료를 열어 근거를 연결할 수 있습니다.</p><button type="button" data-pool-action="new" class="pool-primary">새 문항 만들기</button></div>
    <form id="pool-form" hidden><div class="pool-editor-heading"><h2 id="pool-title">새 문항</h2><div class="pool-actions"><button type="button" data-pool-action="save">저장</button><button type="button" data-pool-action="handoff" class="pool-primary">한글로 보내기</button></div></div>
    <section class="pool-plan" aria-label="출제 설계"><div class="pool-plan-heading"><h3>출제 설계</h3><span>인쇄되지 않는 설계 정보</span></div><div class="pool-standard-link"><div id="pool-selected-standard">성취기준을 선택해 출제 범위를 정하세요.</div><button type="button" id="pool-choose-standard">성취기준 찾기</button><button type="button" id="pool-clear-standard" hidden>연결 해제</button></div><label class="pool-intent-label" for="pool-intent">출제 의도</label><textarea id="pool-intent" rows="1" maxlength="10000" placeholder="평가할 개념과 학생이 수행할 내용을 적으세요."></textarea><div id="pool-linked-references"></div></section>
    <div class="pool-writing-heading"><h3>문항 작성</h3><button type="button" id="pool-preview-toggle" aria-expanded="false" aria-controls="pool-print-preview">출력 미리보기</button></div><article id="pool-print-preview" hidden aria-label="문항 출력 미리보기"></article>
    <div class="pool-fields"><label class="pool-row pool-number-row"><span>문항 번호</span><input id="pool-number" maxlength="40" autocomplete="off" placeholder="번호"></label>
      <label class="pool-row"><span>지문</span><textarea id="pool-passage" rows="3" maxlength="100000" placeholder="지문을 입력하세요"></textarea></label>
      <div class="pool-row"><span id="pool-figure-label">사진·그림</span><div class="pool-figure" aria-labelledby="pool-figure-label"><div class="pool-actions"><button type="button" data-pool-action="capture">현재 5E 그림 가져오기</button><button type="button" data-pool-action="photo">사진 파일 열기</button><button type="button" data-pool-action="edit">5E 원본 편집</button><button type="button" data-pool-action="confirm">작업본 확정</button></div>
      <div id="pool-previews"></div><p id="pool-figure-state">연결된 사진·그림이 없습니다.</p><p class="pool-hint">한글에는 확정본만 전달됩니다. 원본 편집 후 이 창에서 수정본을 가져와 다시 확정하세요.</p></div></div>
      <label class="pool-row"><span>발문</span><textarea id="pool-ask" rows="2" maxlength="100000" placeholder="실제 물음을 입력하세요"></textarea></label>
      <div class="pool-row"><label for="pool-bogi">보기</label><div><textarea id="pool-bogi" rows="3" maxlength="100000" placeholder="보기 내용을 한 줄에 하나씩 입력하세요"></textarea><p class="pool-hint">입력한 줄의 순서대로 ㄱ, ㄴ, ㄷ이 붙습니다.</p></div></div>
      <fieldset class="pool-choices"><legend>선지</legend>${choiceLabels.map((label,index) => `<label><span>${label}</span><textarea id="pool-choice-${index}" rows="1" maxlength="100000" aria-label="선지 ${label}" placeholder="선지 내용을 입력하세요"></textarea></label>`).join('')}</fieldset>
    </div></form></main><aside id="pool-reference-panel" class="pool-references" aria-label="교과서·성취기준·참고자료"></aside></div>
    <div class="pool-statusbar"><span id="pool-status" role="status" aria-live="polite">준비 중</span><span>5E 그림 → 문항 내용 → 한글 조판</span></div>
    <input id="pool-file" type="file" accept=".exampool,.json" hidden><input id="pool-photo" type="file" accept="image/png,image/jpeg,image/webp" hidden>`;
  document.body.append(panel);
  const $ = selector => panel.querySelector(selector);
  const entry = document.createElement('button');entry.type = 'button';entry.id = 'exampool-open';entry.className = 'object-search-trigger';
  entry.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 3v14M8 12h9"/></svg><span>문항 설계</span>';
  // 진입은 5E_ExamPool(문항 시트) 하나로 모은다. 예전 문항 설계 창은 ?exampool=1 또는 숨은 버튼으로만 연다.
  entry.hidden=true;entry.style.display='none';document.querySelector('.image-workflow-hub')?.append(entry);
  const references = initPoolReferences(panel,{
    getQuestion:()=>current,
    onStandard:standard=>void run(async()=>{await persist();current.standard_code=standard.code;current.standard=standard;markDirty();await persist();renderPlan();references.updateState();}),
    onReference:reference=>void run(async()=>{await persist();current.references=[...(current.references||[]),reference];markDirty();await persist();renderPlan();message('자료의 쪽수와 근거를 문항에 연결했습니다.');}),
  });
  function mobileView(view) {panel.dataset.mobileView=view;panel.querySelectorAll('[data-pool-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.poolView===view)));}
  panel.querySelectorAll('[data-pool-view]').forEach(button=>button.addEventListener('click',()=>mobileView(button.dataset.poolView)));
  $('#pool-choose-standard').addEventListener('click',()=>{references.setTab('standards');mobileView('references');$('#pool-standard-search').focus();});
  $('#pool-clear-standard').addEventListener('click',()=>void run(async()=>{await persist();current.standard_code='';current.standard=null;markDirty();await persist();renderPlan();references.updateState();}));
  $('#pool-preview-toggle').addEventListener('click',()=>{collect();const preview=$('#pool-print-preview');preview.hidden=!preview.hidden;$('#pool-preview-toggle').setAttribute('aria-expanded',String(!preview.hidden));$('#pool-preview-toggle').textContent=preview.hidden?'출력 미리보기':'미리보기 닫기';renderPreview();});
  function message(text, error = false) {$('#pool-status').textContent = text;$('#pool-status').dataset.error = String(error);}
  function renderList() {
    const list = $('#pool-list');list.replaceChildren();
    for (const item of items) {
      const button = document.createElement('button');button.type = 'button';button.className = 'pool-list-item';button.dataset.questionId = item.id;
      button.setAttribute('aria-current',String(item.id === current?.id));
      const heading = document.createElement('strong');heading.textContent = item.number ? `${item.number}번` : '번호 미입력';
      const summary = document.createElement('span');summary.textContent = item.ask || item.passage || '내용을 입력하세요';
      button.append(heading,summary);button.addEventListener('click',() => void run(async () => {await persist();current = copy(items.find(row => row.id === item.id));render();}));list.append(button);
    }
  }
  function renderFigure() {
    const previews = $('#pool-previews');previews.replaceChildren();
    const asset = current?.asset, draft = asset?.draft, confirmed = asset?.confirmed;
    const same = draft && confirmed?.id === draft.id;
    for (const [snapshot,label] of [[confirmed,'확정본'],[same ? null : draft,'작업본']]) if (snapshot) {
      const figure = document.createElement('figure'), img = document.createElement('img'), caption = document.createElement('figcaption');
      img.src = snapshot.png;img.alt = `${label}: ${snapshot.name}`;caption.textContent = `${label} · ${snapshot.name}`;figure.append(img,caption);previews.append(figure);
    }
    $('#pool-figure-state').textContent = confirmed ? (same ? '그림 확정 · 한글 전달 가능' : '확정본 보관 중 · 새 작업본은 아직 확정되지 않았습니다.') : draft ? '작업 중 · 확정 전에는 한글로 전달할 수 없습니다.' : '연결된 사진·그림이 없습니다.';
    $('[data-pool-action="confirm"]').disabled = busy || !draft || same;
    $('[data-pool-action="edit"]').disabled = busy || !((draft || confirmed)?.source);
  }
  function render() {
    $('#pool-form').hidden = !current;$('#pool-empty').hidden = !!current;renderList();references.questionChanged();if (!current) return;
    $('#pool-title').textContent = current.number ? `${current.number}번 문항` : '새 문항';
    $('#pool-number').value = current.number;$('#pool-passage').value = current.passage;$('#pool-ask').value = current.ask;
    $('#pool-intent').value=current.intent||'';renderPlan();renderPreview();
    $('#pool-bogi').value = current.bogi_items.map(row => row.text).join('\n');
    current.choices.forEach((row,index) => {$(`#pool-choice-${index}`).value = row.text;});renderFigure();
  }
  function collect() {
    if (!current) return;
    current.number = $('#pool-number').value;current.passage = $('#pool-passage').value;current.ask = $('#pool-ask').value;
    current.intent=$('#pool-intent').value;
    const lines = $('#pool-bogi').value ? $('#pool-bogi').value.split('\n') : [];
    current.bogi_items = lines.map((text,index) => ({id:current.bogi_items[index]?.id || crypto.randomUUID(), label:letters[index] || String(index+1), text}));
    current.choices.forEach((row,index) => {row.text = $(`#pool-choice-${index}`).value;});
  }
  function renderPlan() {
    const linked=$('#pool-selected-standard');linked.replaceChildren();
    if(current?.standard) {const code=document.createElement('strong'),text=document.createElement('span');code.textContent=current.standard.code;text.textContent=current.standard.text;linked.append(code,text);}
    else linked.textContent='성취기준을 선택해 출제 범위를 정하세요.';
    $('#pool-clear-standard').hidden=!current?.standard;
    const list=$('#pool-linked-references');list.replaceChildren();
    if(!current?.references?.length)return;
    const heading=document.createElement('h4');heading.textContent=`연결한 근거 ${current.references.length}`;list.append(heading);
    const fields={question:'문항',passage:'지문',ask:'발문',bogi:'보기',...Object.fromEntries(choiceLabels.map((label,i)=>['choice-'+i,'선지 '+label]))};
    for(const ref of current.references) {
      const row=document.createElement('div'),open=document.createElement('button'),remove=document.createElement('button');row.className='pool-linked-reference';open.type=remove.type='button';
      open.textContent=`${fields[ref.field]||'문항'} · ${ref.title} · ${ref.page}쪽`;open.title=ref.quote||'원문 열기';open.dataset.linkedReferenceId=ref.id;
      open.addEventListener('click',()=>{mobileView('references');void references.openReference(ref).catch(error=>message(error.message,true));});
      remove.textContent='해제';remove.setAttribute('aria-label',`${ref.title} ${ref.page}쪽 근거 연결 해제`);
      remove.addEventListener('click',()=>void run(async()=>{await persist();current.references=current.references.filter(row=>row.id!==ref.id);markDirty();await persist();renderPlan();}));row.append(open,remove);
      if(ref.quote){const quote=document.createElement('p');quote.textContent=ref.quote;row.append(quote);}list.append(row);
    }
  }
  function renderPreview() {
    const preview=$('#pool-print-preview');preview.replaceChildren();if(!current||preview.hidden)return;
    const text=(value,tag='p')=>{if(!value)return;const node=document.createElement(tag);node.textContent=value;preview.append(node);};
    text(current.number?`${current.number}.`:'문항','h3');text(current.passage);
    const figure=current.asset?.confirmed||current.asset?.draft;if(figure){const img=document.createElement('img');img.src=figure.png;img.alt=figure.name;preview.append(img);if(!current.asset.confirmed)text('작업본 · 아직 확정되지 않은 그림','small');}
    text(current.ask);if(current.bogi_items.length){text('〈보기〉','h4');for(const row of current.bogi_items)text(`${row.label}  ${row.text}`);}
    current.choices.forEach((row,i)=>text(`${choiceLabels[i]}  ${row.text}`));
  }
  function persist() {
    clearTimeout(timer);
    saving = saving.catch(() => {}).then(async () => {
      if (!current || !dirty) return;
      collect();validateQuestion(current,services.prepareLoadedProject);
      const stamp = editStamp, saved = await saveQuestion(copy(current));
      if (stamp === editStamp) {current = saved;dirty = false;}
      else {current.revision = saved.revision;current.updatedAt = saved.updatedAt;collect();}
      const index = items.findIndex(item => item.id === saved.id);if (index < 0) items.push(copy(saved));else items[index] = copy(saved);
      renderList();$('#pool-title').textContent = saved.number ? `${saved.number}번 문항` : '새 문항';
      message(dirty ? '입력한 변경 내용을 저장 중입니다.' : '저장됨 · ' + new Date(saved.updatedAt).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}));
    });return saving;
  }
  function markDirty() {dirty = true;editStamp++;message('저장하지 않은 변경 내용이 있습니다.');}
  async function run(task) {
    if (busy) return;busy = true;panel.setAttribute('aria-busy','true');
    panel.querySelectorAll('button,input:not([type="file"]),textarea,select').forEach(node => {node.disabled = true;});
    try {await task();}catch(error) {message(error.message || '작업을 마치지 못했습니다. 다시 시도하세요.',true);}
    finally {busy = false;panel.setAttribute('aria-busy','false');panel.querySelectorAll('button,input,textarea,select').forEach(node => {node.disabled = false;});renderFigure();references.updateState();}
  }
  function close() {panel.hidden = true;document.body.classList.remove('pool-open');syncAppLock();focusReturn?.focus();}
  async function open() {
    focusReturn = document.activeElement;panel.hidden = false;document.body.classList.add('pool-open');
    panel.style.bottom = `${document.querySelector('.app-footer')?.getBoundingClientRect().height || 24}px`;
    syncAppLock();
    await run(async () => {items = await listQuestions();if (!current) current = items[0] ? copy(items[0]) : null;render();message(items.length ? '저장한 문항을 열었습니다.' : '새 문항을 만들어 시작하세요.');});
    await references.refresh().catch(error=>message(error.message,true));references.questionChanged();
    (current ? $('#pool-number') : $('[data-pool-action="new"]')).focus();
  }
  async function setDraft(snapshot) {
    current.asset = {id:current.asset?.id || crypto.randomUUID(), confirmed:current.asset?.confirmed || null, draft:snapshot};
    markDirty();await persist();renderFigure();
  }
  async function capture() {
    if (!current) throw new Error('먼저 문항을 만드세요.');
    services.commitActiveText?.();const source = copy(services.serialize(state.get()));
    source.pages = source.pages.filter(page => page.id === source.activePageId);
    const {active} = services.prepareLoadedProject(copy(source));
    if (!active.objects.length) throw new Error('5E에서 그림을 만든 뒤 가져오세요.');
    const bounds = getContentBounds({...state.get(),...active});
    if (!bounds || bounds.w <= 0 || bounds.h <= 0 || (bounds.w/25.4*300)*(bounds.h/25.4*300) > 40000000) throw new Error('그림 영역을 확인하거나 줄인 뒤 가져오세요.');
    const assetId = current.asset?.id || crypto.randomUUID();
    source.pages[0].meta = {...source.pages[0].meta, exampoolLink:{questionId:current.id, assetId}};
    await services.ensureEmbeddedFonts();
    const {canvas,widthMm,heightMm} = await services.rasterizeExportCanvas({...state.get(),...active},{dpi:300,bounds,options:{includeReferenceImages:true,excludeAllImages:false}});
    const blob = await new Promise((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('그림을 가져오지 못했습니다.')), 'image/png'));
    const id = crypto.randomUUID(), name = active.name.slice(0,200), render = {bounds,options:{includeReferenceImages:true,excludeAllImages:false}};
    const figure = {id,name,version:1,source,render,link:{tabId:current.id,assetId}};
    const bytes = embedEditablePng(new Uint8Array(services.insertPngPhys(await blob.arrayBuffer(),300)),figure,services.prepareLoadedProject);
    current.asset ||= {id:assetId, confirmed:null};
    await setDraft({id,name,png:dataUrl(bytes),source,render,capturedAt:new Date().toISOString(),widthMm,heightMm,pixelWidth:canvas.width,pixelHeight:canvas.height});
    state.update(value => {const page = value.pages.find(page => page.id === source.activePageId);if (page) page.meta = {...page.meta,exampoolLink:{questionId:current.id,assetId}};});
  }
  async function edit() {
    await persist();const snapshot = current.asset?.draft || current.asset?.confirmed;if (!snapshot?.source) throw new Error('이 사진에는 편집 가능한 5E 원본이 없습니다.');
    const linked = state.get().pages.find(page => page.meta?.exampoolLink?.questionId === current.id && page.meta.exampoolLink.assetId === current.asset.id);
    if (linked) services.switchPage(state,linked.id);
    else {
      const page = services.prepareLoadedProject(copy(snapshot.source)).active;
      page.id = `pool_${crypto.randomUUID()}`;page.meta = {...page.meta,exampoolLink:{questionId:current.id,assetId:current.asset.id}};
      state.update(value => {value.pages.push(page);});services.switchPage(state,page.id);
    }
    close();services.centerView();
  }
  async function importPhoto(file) {
    if (!current) throw new Error('먼저 문항을 만드세요.');
    if (file.size > 25*1024*1024) throw new Error('사진 파일은 25 MB 이하로 열어주세요.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const embedded = readEditablePng(bytes,services.prepareLoadedProject);
    const url = URL.createObjectURL(file), image = new Image();
    try {
      image.src = url;await image.decode();
      if (!image.naturalWidth || image.naturalWidth*image.naturalHeight > 40000000) throw new Error('사진 크기를 줄인 뒤 다시 열어주세요.');
      let png = embedded ? dataUrl(bytes) : null;
      if (!png) {const canvas = document.createElement('canvas');canvas.width = image.naturalWidth;canvas.height = image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);png = canvas.toDataURL('image/png');}
      const widthMm = 80, heightMm = 80*image.naturalHeight/image.naturalWidth;
      await setDraft({id:crypto.randomUUID(),name:file.name.slice(0,200),png,source:embedded?.source || null,render:embedded?.render || {bounds:null,options:{includeReferenceImages:true,excludeAllImages:false}},
        capturedAt:new Date().toISOString(),widthMm,heightMm,pixelWidth:image.naturalWidth,pixelHeight:image.naturalHeight});
    } finally {URL.revokeObjectURL(url);}
  }
  const actions = {
    new:async () => {await persist();if (items.length >= 500) throw new Error('문항은 500개까지 보관할 수 있습니다.');current = newQuestion(String(items.length+1));mobileView('editor');render();markDirty();await persist();},
    close:async () => {await persist();close();},save:persist,capture,edit,
    confirm:async () => {current = confirmFigure(current);markDirty();await persist();renderFigure();},
    photo:() => $('#pool-photo').click(),import:() => $('#pool-file').click(),
    export:async () => {
      // The file remains a recovery path even when the browser cannot persist.
      collect();const snapshot = items.map(item => item.id === current?.id ? copy(current) : copy(item));
      if (current && !snapshot.some(item => item.id === current.id)) snapshot.push(copy(current));
      download(new Blob([encodePool(snapshot,services.prepareLoadedProject,await listResources())],{type:'application/json'}),'문항.exampool');message('문항 파일을 저장했습니다. 성취기준·참고자료·그림·5E 원본이 함께 들어 있습니다.');
    },
    handoff:async () => {await persist();const packet = questionHandoff(current);await examWorkspace.receiveQuestion(packet);close();},
  };
  panel.addEventListener('click',event => {const button = event.target.closest('[data-pool-action]');if (button && !button.disabled) {event.preventDefault();void run(actions[button.dataset.poolAction]);}});
  $('#pool-form').addEventListener('submit',event => {event.preventDefault();void run(persist);});
  $('#pool-form').addEventListener('input',() => {markDirty();if(!$('#pool-print-preview').hidden){collect();renderPreview();}clearTimeout(timer);timer = setTimeout(() => {if (!busy) void persist().catch(error => message(error.message,true));},650);});
  $('#pool-file').addEventListener('change',() => {const file = $('#pool-file').files[0];if (!file) return;void run(async () => {
    if (file.size > POOL_MAX_BYTES) throw new Error('문항 파일은 128 MB 이하로 열어주세요.');
    const bundle = decodePoolBundle(await file.text(),services.prepareLoadedProject),incoming=bundle.items;
    for (const item of incoming) for (const snapshot of [item.asset?.draft,item.asset?.confirmed].filter(Boolean)) {
      readEditablePng(bytesFor(snapshot.png),services.prepareLoadedProject);
      const image = new Image();image.src = snapshot.png;await image.decode();
      if (image.naturalWidth !== snapshot.pixelWidth || image.naturalHeight !== snapshot.pixelHeight) throw new Error('문항 파일의 그림 크기가 맞지 않습니다. 기존 문항은 보존했습니다.');
    }
    await persist();await importQuestions(incoming,bundle.resources);items = await listQuestions();await references.refresh();
    current = incoming[0] ? copy(items.find(item => item.id === incoming[0].id)) : current;render();message(`${incoming.length}개 문항을 열었습니다.`);
  }).finally(() => {$('#pool-file').value = '';});});
  $('#pool-photo').addEventListener('change',() => {const file = $('#pool-photo').files[0];if (file) void run(() => importPhoto(file)).finally(() => {$('#pool-photo').value = '';});});
  entry.addEventListener('click',() => void open());
  panel.addEventListener('keydown',event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {event.preventDefault();event.stopPropagation();void run(persist);}
    if (event.key === 'Escape' && !event.isComposing) {event.preventDefault();event.stopPropagation();void run(actions.close);}
    if (event.key === 'Tab') {
      const controls = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"],summary')].filter(node => node.getClientRects().length);
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (document.activeElement === edge) {event.preventDefault();(event.shiftKey ? controls.at(-1) : controls[0])?.focus();}
    }
  });
  window.addEventListener('beforeunload',event => {if (dirty) {event.preventDefault();event.returnValue = '';}});
  if (new URLSearchParams(location.search).get('exampool') === '1') void open();
  return {open};
}
