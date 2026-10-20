import {createPdfRuntimeLoader} from './pdf-library/runtime-loader.js?v=1.7.0-four-session-integration';
import {listResources,saveResource} from './exampool-store.js?v=1013-exampool';
import {validateResource} from './exampool-model.js?v=1013-exampool';

const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
function base64(bytes) {
  let text = '';for (let i=0;i<bytes.length;i+=32768) text += String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(text);
}
function node(tag,text,className) {const element=document.createElement(tag);if (text!=null) element.textContent=text;if (className) element.className=className;return element;}
function button(text,handler) {const element=node('button',text);element.type='button';element.addEventListener('click',handler);return element;}

// The viewer uses the same local PDF runtime as 5E's library. Original ExamPool
// files and database are never opened for writing; this library is browser-local.
export function initPoolReferences(panel,{getQuestion,onStandard,onReference,onError}) {
  const $=selector=>panel.querySelector(selector);
  const host=$('#pool-reference-panel');
  host.innerHTML=`<div class="pool-reference-heading"><h2>자료 열람</h2><span id="pool-library-count"></span></div>
    <div class="pool-reference-tabs" role="tablist" aria-label="자료 종류">
      <button type="button" id="pool-tab-textbooks" role="tab" aria-selected="false" aria-controls="pool-documents-pane" data-ref-tab="textbooks">교과서</button>
      <button type="button" id="pool-tab-standards" role="tab" aria-selected="true" aria-controls="pool-standards-pane" data-ref-tab="standards">성취기준</button>
      <button type="button" id="pool-tab-materials" role="tab" aria-selected="false" aria-controls="pool-documents-pane" data-ref-tab="materials">참고자료</button>
    </div>
    <section id="pool-standards-pane" role="tabpanel" aria-labelledby="pool-tab-standards">
      <div class="pool-reference-filters"><label>과목<select id="pool-subject"><option>불러오는 중</option></select></label><label>단원<select id="pool-unit"><option value="">전체 단원</option></select></label></div>
      <label class="pool-search-label" for="pool-standard-search">성취기준 검색</label><input type="search" id="pool-standard-search" placeholder="코드·핵심어로 검색">
      <div id="pool-standard-count" class="pool-hint"></div><div id="pool-standard-list" class="pool-reference-results" aria-label="성취기준 검색 결과"></div>
      <article id="pool-standard-detail" class="pool-standard-detail"></article>
      <p id="pool-standard-source" class="pool-source-caption"></p>
    </section>
    <section id="pool-documents-pane" role="tabpanel" aria-labelledby="pool-tab-textbooks" hidden>
      <div class="pool-reference-import"><label>자료 분류<select id="pool-resource-kind"><option>교과서</option><option>교육과정</option><option>기출</option><option>수업</option><option>참고자료</option></select></label><button type="button" id="pool-resource-open">자료 파일 열기</button></div>
      <input type="file" id="pool-resource-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain" multiple hidden>
      <label class="pool-search-label" for="pool-resource-search">자료 검색</label><input type="search" id="pool-resource-search" placeholder="파일명·본문의 핵심어로 검색">
      <div id="pool-resource-list" class="pool-reference-results" aria-label="자료 검색 결과"></div>
      <div id="pool-source-viewer" hidden>
        <div class="pool-viewer-heading"><h3 id="pool-source-title"></h3><div class="pool-page-tools"><button type="button" id="pool-page-prev" aria-label="이전 쪽">이전</button><label><input type="number" id="pool-source-page" min="1" aria-label="자료 쪽수"><span id="pool-source-total"></span></label><button type="button" id="pool-page-next" aria-label="다음 쪽">다음</button><select id="pool-source-zoom" aria-label="원문 확대"><option value="100">맞춤</option><option value="150">150%</option><option value="200">200%</option></select></div></div>
        <div id="pool-source-page-view" tabindex="0" aria-label="자료 원문"></div>
        <details class="pool-source-text"><summary>원문 텍스트 확인</summary><div id="pool-source-text" class="pool-document-text"></div><button type="button" id="pool-quote-selection">선택한 문장 인용</button></details>
        <div class="pool-evidence-compose"><label for="pool-evidence-quote">근거 문장·메모</label><textarea id="pool-evidence-quote" rows="2" maxlength="10000" placeholder="참고한 문장이나 메모를 적으세요. 쪽수와 함께 저장됩니다."></textarea><div class="pool-evidence-actions"><label>연결할 요소<select id="pool-evidence-field"><option value="question">문항 전체</option><option value="passage">지문</option><option value="ask">발문</option><option value="bogi">보기</option>${['①','②','③','④','⑤'].map((label,i)=>`<option value="choice-${i}">선지 ${label}</option>`).join('')}</select></label><button type="button" id="pool-reference-attach" class="pool-primary">문항 근거로 연결</button></div></div>
      </div>
    </section><p id="pool-reference-status" role="status" aria-live="polite"></p>`;
  let seed=null,seedPromise,resources=[],tab='standards',selectedStandard=null,active=null,page=1,sequence=0,viewerUrl=null,importing=false;
  const loadRuntime=createPdfRuntimeLoader();
  const lastViews=new Map();
  let runtimeTasks=Promise.resolve();
  function withRuntime(task) {const next=runtimeTasks.catch(()=>{}).then(async()=>task(await loadRuntime()));runtimeTasks=next;return next;}
  function status(text,error=false) {$('#pool-reference-status').textContent=text;$('#pool-reference-status').dataset.error=String(error);}
  function attempt(task) {void Promise.resolve().then(task).catch(error=>status(error.message || '자료를 열지 못했습니다. 다시 시도하세요.',true));}
  function setTab(value,reveal=true) {
    if(active&&tab!=='standards')lastViews.set(tab,{resource:active,page});
    const changed=tab!==value;tab=value;
    host.querySelectorAll('[data-ref-tab]').forEach(el=>{const selected=el.dataset.refTab===tab;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});
    $('#pool-standards-pane').hidden=tab!=='standards';$('#pool-documents-pane').hidden=tab==='standards';
    $('#pool-documents-pane').setAttribute('aria-labelledby',tab==='textbooks'?'pool-tab-textbooks':'pool-tab-materials');
    $('#pool-resource-kind').value=tab==='textbooks'?'교과서':'참고자료';
    if(changed)sequence++;
    if(tab!=='standards') {
      renderResources();
      if(changed&&reveal) {const previous=lastViews.get(tab);if(previous)attempt(()=>showPage(previous.resource,previous.page));else{active=null;$('#pool-source-viewer').hidden=true;}}
    }
  }
  host.querySelectorAll('[data-ref-tab]').forEach(el=>{
    el.addEventListener('click',()=>setTab(el.dataset.refTab));
    el.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...host.querySelectorAll('[data-ref-tab]')],i=tabs.indexOf(el),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next].dataset.refTab);tabs[next].focus();});
  });
  function units() {
    const subject=$('#pool-subject').value;$('#pool-unit').replaceChildren(new Option('전체 단원',''));
    for(const unit of seed.units.filter(unit=>unit.subject===subject)) $('#pool-unit').append(new Option(`${unit.local_no}. ${unit.name}`,String(unit.unit_no)));
  }
  function detail(standard) {
    selectedStandard=standard;const target=$('#pool-standard-detail');target.replaceChildren();if(!standard)return;
    const unit=seed.units.find(unit=>unit.unit_no===standard.unit_no);
    target.append(node('div',`${standard.subject} · ${unit?.name || standard.grade_band}`,'pool-source-caption'),node('h3',standard.code),node('p',standard.text,'pool-standard-text'));
    if(standard.explain) {const details=node('details');details.open=true;details.append(node('summary','성취기준 해설'),node('p',standard.explain));target.append(details);}
    if(unit?.inquiry?.length || unit?.consider?.length) {const details=node('details');details.append(node('summary','탐구 활동·지도 시 고려 사항'));for(const text of [...(unit.inquiry||[]),...(unit.consider||[])]) details.append(node('p',text));target.append(details);}
    const linked=getQuestion()?.standard_code===standard.code;
    const choose=button(linked?'연결된 성취기준':'이 성취기준으로 설계',()=>{onStandard({...structuredClone(standard),source:seed.source,unit_name:unit?.name||''});});choose.className='pool-primary';choose.disabled=!getQuestion() || linked;target.append(choose);
    $('#pool-standard-list').querySelectorAll('[data-standard-code]').forEach(el=>el.setAttribute('aria-current',String(el.dataset.standardCode===standard.code)));
  }
  function renderStandards() {
    if(!seed)return;
    const subject=$('#pool-subject').value,unit=$('#pool-unit').value,terms=$('#pool-standard-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered=seed.standards.filter(s=>(!subject||s.subject===subject)&&(!unit||String(s.unit_no)===unit)&&terms.every(term=>[s.code,s.text,s.explain,seed.units.find(u=>u.unit_no===s.unit_no)?.name].join(' ').toLocaleLowerCase().includes(term)));
    const list=$('#pool-standard-list');list.replaceChildren();$('#pool-standard-count').textContent=`${filtered.length}개 성취기준`;
    for(const standard of filtered) {const row=button('',()=>detail(standard));row.dataset.standardCode=standard.code;row.append(node('strong',standard.code),node('span',standard.text));list.append(row);}
    if(!filtered.length) {list.append(node('p','일치하는 성취기준이 없습니다. 검색어나 단원을 바꿔보세요.','pool-hint'));detail(null);}
    else detail(filtered.find(s=>s.code===selectedStandard?.code)||filtered.find(s=>s.code===getQuestion()?.standard_code)||filtered[0]);
  }
  $('#pool-subject').addEventListener('change',()=>{units();renderStandards();});$('#pool-unit').addEventListener('change',renderStandards);$('#pool-standard-search').addEventListener('input',renderStandards);
  function category(resource) {return tab==='textbooks'?resource.kind==='교과서':resource.kind!=='교과서';}
  function renderResources() {
    const list=$('#pool-resource-list');list.replaceChildren();$('#pool-library-count').textContent=`자료 ${resources.length}`;
    const terms=$('#pool-resource-search').value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);let count=0;
    for(const resource of resources.filter(category)) {
      const hits=terms.length?resource.pages.map((text,i)=>({text,page:i+1})).filter(hit=>terms.every(term=>(resource.title+' '+hit.text).toLocaleLowerCase().includes(term))):[{text:'',page:1}];
      for(const hit of hits.slice(0,30)) {const row=button('',()=>attempt(()=>showPage(resource,hit.page)));row.dataset.resourceId=resource.id;row.dataset.resourcePage=String(hit.page);row.append(node('strong',resource.title),node('span',`${resource.kind} · ${hit.page} / ${resource.pages.length}쪽`));
        if(hit.text) {const first=Math.max(0,hit.text.toLocaleLowerCase().indexOf(terms[0])-30);row.append(node('span',hit.text.slice(first,first+160),'pool-search-snippet'));}
        list.append(row);count++;
      }
    }
    if(!count) list.append(node('p',terms.length?'검색 결과가 없습니다. 스캔 PDF는 본문 검색이 어려우므로 파일명으로 찾거나 쪽수를 넘겨 확인하세요.':tab==='textbooks'?'교과서 PDF를 열어 문항 옆에서 읽어보세요. 원문 검색과 쪽수 연결을 지원합니다.':'교육과정·기출·수업 자료를 열어 근거를 확인하세요. PDF·이미지·텍스트 파일을 지원합니다.','pool-reference-empty'));
  }
  $('#pool-resource-search').addEventListener('input',renderResources);
  function sourceFor(resource) {return {kind:'file',locator:resource.id,displayName:resource.title};}
  async function ensurePdf(runtime,resource) {
    if(!runtime.getDocument(resource.id)) await runtime.openDocumentResource({id:resource.id,title:resource.title,source:sourceFor(resource),data:decode(resource.base64)}, {id:resource.id,title:resource.title,source:sourceFor(resource),pageCount:resource.pages.length,pages:[],status:'indexed'});
  }
  function pageControls() {$('#pool-page-prev').disabled=page<=1;$('#pool-page-next').disabled=!active||page>=active.pages.length;$('#pool-source-page').value=String(page);$('#pool-source-page').max=String(active?.pages.length||1);$('#pool-source-total').textContent=` / ${active?.pages.length||1}`;$('#pool-reference-attach').disabled=!getQuestion()||importing;}
  async function showPage(resource,pageNumber) {
    const request=++sequence;active=resource;page=Math.max(1,Math.min(resource.pages.length,Number(pageNumber)||1));
    $('#pool-source-viewer').hidden=false;$('#pool-source-title').textContent=resource.title;$('#pool-evidence-quote').value='';pageControls();
    $('#pool-source-text').textContent=resource.pages[page-1]||'이 쪽에는 추출된 텍스트가 없습니다. 원문 이미지를 확인하세요.';
    const view=$('#pool-source-page-view');view.replaceChildren(node('p','원문을 여는 중입니다.','pool-hint'));status('');
    let blob;
    if(resource.mime==='application/pdf') {
      const selectedPage=page;
      const rendered=await withRuntime(async runtime=>{if(request!==sequence)return null;await ensurePdf(runtime,resource);if(request!==sequence)return null;return runtime.renderPage({documentId:resource.id,pageNumber:selectedPage,dpi:144});});
      if(!rendered||request!==sequence)return;blob=new Blob([rendered.bytes],{type:'image/png'});
    }
    else if(resource.mime==='text/plain') {if(request!==sequence)return;view.replaceChildren(node('div',resource.pages[page-1],'pool-document-text'));return;}
    else blob=new Blob([decode(resource.base64)],{type:resource.mime});
    if(request!==sequence)return;
    if(viewerUrl)URL.revokeObjectURL(viewerUrl);viewerUrl=URL.createObjectURL(blob);const image=node('img');image.src=viewerUrl;image.alt=`${resource.title} ${page}쪽 원문`;image.style.width=$('#pool-source-zoom').value+'%';view.replaceChildren(image);
    try{await image.decode();}catch(error){if(request===sequence)throw error;return;}if(request===sequence)status(`${resource.kind} · ${page}쪽 원문`);
  }
  for(const [id,delta] of [['pool-page-prev',-1],['pool-page-next',1]]) $('#'+id).addEventListener('click',()=>attempt(()=>showPage(active,page+delta)));
  $('#pool-source-page').addEventListener('change',()=>{if(active)attempt(()=>showPage(active,Number($('#pool-source-page').value)));});
  $('#pool-source-zoom').addEventListener('change',()=>{const image=$('#pool-source-page-view img');if(image)image.style.width=$('#pool-source-zoom').value+'%';});
  $('#pool-quote-selection').addEventListener('click',()=>{const selection=window.getSelection();if(selection?.toString()&&$('#pool-source-text').contains(selection.anchorNode)&&$('#pool-source-text').contains(selection.focusNode))$('#pool-evidence-quote').value=selection.toString().slice(0,10000);else status('원문 텍스트에서 인용할 문장을 먼저 선택하세요.');});
  $('#pool-reference-attach').addEventListener('click',()=>{if(!getQuestion()||!active)return;onReference({id:crypto.randomUUID(),resourceId:active.id,title:active.title,kind:active.kind,page,quote:$('#pool-evidence-quote').value,field:$('#pool-evidence-field').value});});
  $('#pool-resource-open').addEventListener('click',()=>$('#pool-resource-file').click());
  async function importFile(file,kind) {
    if(resources.length>=100)throw new Error('자료는 100개까지 보관할 수 있습니다.');
    if(file.size>50*1024*1024)throw new Error('자료 파일은 50 MB 이하로 열어주세요.');
    const bytes=new Uint8Array(await file.arrayBuffer()),id=crypto.randomUUID();
    const extension=file.name.split('.').at(-1).toLowerCase();
    const mime={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain'}[extension];
    if(!mime)throw new Error('PDF·PNG·JPEG·WebP·텍스트 파일을 열어주세요.');
    const resource={id,title:file.name.slice(0,240),kind,mime,base64:base64(bytes),pages:[],createdAt:new Date().toISOString()};
    if(mime==='application/pdf') {const record=await withRuntime(runtime=>runtime.openDocument({id,title:resource.title,source:sourceFor(resource),data:bytes,onMetadata:meta=>{if(meta.pageCount>3000)throw new Error('PDF는 3,000쪽 이하로 열어주세요.');status(`${file.name} · ${meta.pageCount}쪽을 읽고 있습니다.`);}}));resource.pages=record.pages.map(p=>p.text);}
    else if(mime==='text/plain') {if(file.size>1024*1024)throw new Error('텍스트 자료는 1 MB 이하로 열어주세요.');resource.pages=new TextDecoder().decode(bytes).split('\f');}
    else {const url=URL.createObjectURL(file),image=new Image();try{image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('이미지 크기를 줄인 뒤 다시 열어주세요.');}finally{URL.revokeObjectURL(url);}resource.pages=[''];}
    validateResource(resource);await saveResource(resource);resources.push(resource);return resource;
  }
  $('#pool-resource-file').addEventListener('change',()=>attempt(async()=>{
    const files=[...$('#pool-resource-file').files],kind=$('#pool-resource-kind').value;if(!files.length||importing)return;
    importing=true;$('#pool-resource-open').disabled=true;status('자료를 읽고 있습니다.');let last;
    try{for(const file of files)last=await importFile(file,kind);setTab(kind==='교과서'?'textbooks':'materials',false);renderResources();if(last)await showPage(last,1);status(`${files.length}개 자료를 저장했습니다. 문항 파일에도 함께 보관됩니다.`);}
    finally{importing=false;$('#pool-resource-open').disabled=false;$('#pool-resource-file').value='';pageControls();}
  }));
  async function refresh() {
    resources=await listResources();renderResources();
    if(!seedPromise)seedPromise=fetch(new URL('../assets/exampool/standards.json',import.meta.url)).then(response=>{if(!response.ok)throw new Error('성취기준을 불러오지 못했습니다. 다시 열어주세요.');return response.json();}).catch(error=>{seedPromise=null;throw error;});
    const first=!seed;seed=await seedPromise;
    if(first) {$('#pool-subject').replaceChildren(...seed.subjects.map(subject=>new Option(`${subject.name} · ${subject.grade_band}`,subject.name)));units();$('#pool-standard-source').textContent=`출처: ${seed.source} · 5E_exam 수록본`;}
    renderStandards();pageControls();
  }
  function questionChanged() {
    const current=getQuestion();
    if(seed&&current?.standard_code) {const standard=seed.standards.find(s=>s.code===current.standard_code);if(standard){$('#pool-subject').value=standard.subject;units();$('#pool-unit').value=String(standard.unit_no);$('#pool-standard-search').value='';selectedStandard=standard;renderStandards();}}
    else if(seed)renderStandards();pageControls();
  }
  async function openReference(reference) {
    const resource=resources.find(r=>r.id===reference.resourceId);if(!resource){status('자료 원본이 없습니다. 자료가 포함된 문항 파일을 열거나 원본을 다시 추가하세요.',true);return;}
    setTab(resource.kind==='교과서'?'textbooks':'materials',false);await showPage(resource,reference.page);$('#pool-evidence-quote').value=reference.quote;$('#pool-evidence-field').value=reference.field;
  }
  function updateState() {pageControls();if(selectedStandard) {const choose=$('#pool-standard-detail button');if(choose){const linked=getQuestion()?.standard_code===selectedStandard.code;choose.disabled=!getQuestion()||linked;choose.textContent=linked?'연결된 성취기준':'이 성취기준으로 설계';}}$('#pool-resource-open').disabled=importing;}
  return {refresh,questionChanged,openReference,resources:()=>structuredClone(resources),setTab,updateState};
}
