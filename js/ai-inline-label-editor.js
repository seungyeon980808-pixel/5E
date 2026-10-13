import { TEXT_FONTS } from './state.js?v=1.7.0-four-session-integration';
import { getFormulaScriptSpans } from './formula.js?v=1.7.0-four-session-integration';
import { renderObject } from './render/scene.js?v=1.7.0-four-session-integration';
import { prepareEditableLabelFonts } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';
import { createPointerMagnifier, svgMagnifierSample } from './tools/pointer-magnifier.js?v=1.7.0-four-session-integration';
import { changeLabelText, labelEditFrame, labelEditObjects, labelEditBounds, moveLabel, moveLeaderHandle, preserveLabelPresentation } from './ai-label-edit-model.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
const roles = [['text','일반 글자'],['name','물체·점 이름'],['quantity','물리량'],['chemical','화학식'],['unit','단위'],['number','숫자'],['symbol','기호']];
const point = n => Math.max(0,Math.min(1,n));

export function createInlineLabelEditor({ panel, getTarget, getPlan, isBusy, artboard, apply, displayChanged, enableLabels, labelsVisible, cancelTools, status }) {
  const doc = panel.ownerDocument, win = doc.defaultView, lifetime = new AbortController();
  let active = false, selectedId = null, owner = null, svg = null, stage = null, image = null;
  let frame = null, objects = [], gesture = null, paintFrame = 0, paintedKey = '', destroyed = false, applying = false, displayEpoch = 0;
  let preparedFontKey = '', fontPromise = null, pendingFontKey = '', paintedSelection = '';
  let presentedItem = null;
  const magnifierSceneId = `ai-label-magnifier-scene-${crypto.randomUUID()}`;
  const fontKey = plan => JSON.stringify(plan.labels.map(label => [label.text,label.contentMode,label.typography,Boolean(label.manualStyle)]));
  async function prepare(item) {
    const plan = getPlan(item), key = fontKey(plan);
    if (preparedFontKey === key) return;
    if (pendingFontKey !== key) {
      pendingFontKey = key;
      fontPromise = prepareEditableLabelFonts(plan.labels).then(() => {
        if (!destroyed && pendingFontKey === key) preparedFontKey = key;
      });
    }
    await fontPromise;
  }
  const entry = doc.createElement('button'); entry.type = 'button'; entry.dataset.aiLabelEdit = '';
  entry.className = 'ai-label-edit-entry'; entry.textContent = '라벨 편집'; entry.setAttribute('aria-pressed','false');
  panel.querySelector('[data-ai-result-tools]')?.append(entry);
  const section = doc.createElement('section'); section.className = 'ai-label-edit-panel'; section.dataset.aiInlineLabelEditor = '';
  section.setAttribute('aria-label','라벨 편집'); section.hidden = true;
  section.innerHTML = `<header><strong>라벨 편집</strong><button type="button" data-label-close aria-label="라벨 편집 닫기">닫기</button></header>
    <div class="ai-label-edit-tools"><button type="button" data-label-add>라벨 추가</button><button type="button" data-label-add-leader>지시선 라벨</button></div>
    <p class="ai-label-edit-hint">라벨과 지시선 끝점을 드래그해 옮기세요. 끝점을 잡으면 확대경이 표시됩니다. 편집을 마치면 수정 저장을 누르세요.</p>
    <div data-label-fields hidden>
      <label class="ai-label-edit-text">문구<textarea data-label-text aria-label="라벨 문구" maxlength="1000" rows="2"></textarea></label>
      <div class="ai-label-edit-grid">
        <label>표현<select data-label-content aria-label="라벨 표현"><option value="plain">텍스트</option><option value="formula">수식</option></select></label>
        <label>종류<select data-label-role aria-label="라벨 종류"></select></label>
        <label class="ai-label-edit-wide">글꼴<select data-label-font aria-label="라벨 글꼴"><option value="">종류에 맞게</option></select></label>
        <label>크기(px)<input type="number" min="1" max="1000" step="1" data-label-size aria-label="라벨 크기"></label>
        <label>회전(°)<input type="number" min="-180" max="180" step="1" data-label-rotation aria-label="라벨 회전"></label>
      </div>
      <div class="ai-label-edit-tools"><button type="button" data-label-bold aria-pressed="false">굵게</button><button type="button" data-label-italic aria-pressed="false">기울임</button><button type="button" data-label-sub>아래첨자</button><button type="button" data-label-sup>위첨자</button></div>
      <details class="ai-label-edit-detail"><summary>위치·지시선·세부 서식</summary><div class="ai-label-edit-grid">
        <label>가로(%)<input type="number" min="0" max="100" step="0.1" data-label-x aria-label="라벨 가로 위치"></label>
        <label>세로(%)<input type="number" min="0" max="100" step="0.1" data-label-y aria-label="라벨 세로 위치"></label>
        <label>자간(em)<input type="number" min="-0.1" max="0.5" step="0.01" data-label-spacing aria-label="라벨 자간"></label>
        <label>줄 간격<input type="number" min="0.8" max="2.5" step="0.1" data-label-line-height aria-label="라벨 줄 간격"></label>
        <label>지시선<select data-label-mode aria-label="라벨 지시선"><option value="text">없음</option><option value="leader">사용</option></select></label>
        <label>끝 모양<select data-label-arrow aria-label="지시선 끝 모양"><option value="none">없음</option><option value="open-arrow">열린 화살표</option><option value="filled-arrow">화살표</option><option value="circle">원형</option></select></label>
        <label>선 모양<select data-label-dash aria-label="지시선 선 모양"><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option></select></label>
        <label>첨자 서체<select data-label-script-role aria-label="선택한 첨자 서체"></select></label>
        <label>연결 가로(%)<input type="number" min="0" max="100" step="0.1" data-label-anchor-x aria-label="지시선 연결 가로 위치"></label>
        <label>연결 세로(%)<input type="number" min="0" max="100" step="0.1" data-label-anchor-y aria-label="지시선 연결 세로 위치"></label>
      </div></details>
      <div class="ai-label-edit-tools ai-label-edit-removal"><button type="button" data-label-duplicate>복제</button><button type="button" data-label-delete>라벨 삭제</button></div>
    </div>`;
  panel.querySelector('.ai-side-tabs')?.after(section);
  const q = name => section.querySelector(`[data-label-${name}]`);
  for (const [value,label] of roles) for (const name of ['role','script-role']) {
    const option = doc.createElement('option'); option.value = value; option.textContent = label; q(name).append(option);
  }
  for (const font of TEXT_FONTS) { const option = doc.createElement('option'); option.value = font.label; option.textContent = font.label; q('font').append(option); }
  const listen = (node,event,callback,options = {}) => node?.addEventListener(event,callback,{ ...options, signal:lifetime.signal });
  const eligible = item => item?.kind === 'generated' && !item.graphResult && !item.sceneResult && /^data:image\/png;/.test(item.data || '');
  const selected = plan => plan.labels.find(label => label.id === selectedId);
  const editable = () => active && !destroyed && !isBusy() && !applying && panel.dataset.aiSharingMode !== 'view';
  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(geometry) : null;
  const endpointDragging = () => editable() && Boolean(gesture && gesture.part !== 'position');
  const magnifier = createPointerMagnifier({
    surface: panel, id: 'ai-label-endpoint-magnifier', available: endpointDragging,
    sample: pointer => svg?.querySelector(`#${magnifierSceneId}`)
      ? { ...svgMagnifierSample(svg,pointer), href:`#${magnifierSceneId}` } : null,
  });

  function removeOverlay(preservePresentation = false) {
    magnifier.hide();
    resizeObserver?.disconnect();
    if (paintFrame) win.cancelAnimationFrame(paintFrame); paintFrame = 0;
    if (gesture) { try { stage?.releasePointerCapture(gesture.pointerId); } catch {} gesture = null; }
    svg?.remove(); svg = null; if (!preservePresentation) presentedItem = null;
    paintedKey = ''; paintedSelection = ''; stage = image = null;
  }
  function setActive(value) {
    active = Boolean(value && eligible(getTarget()) && !isBusy() && panel.dataset.aiSharingMode !== 'view');
    // Keep the last live composition while the closed preview is prepared.
    // Opening likewise keeps the raster preview until the live fonts are ready.
    if (active || panel.hidden || owner !== getTarget()) removeOverlay();
    svg?.classList.toggle('is-preview-only',!active);
    panel.dataset.aiLabelEditing = String(active);
    section.hidden = !active; entry.setAttribute('aria-pressed',String(active));
    const epoch = ++displayEpoch;
    if (active) applying = true;
    if (active) { cancelTools(); enableLabels(); }
    refresh();
    void Promise.resolve(displayChanged(getTarget())).finally(() => { if (!destroyed && displayEpoch === epoch) { applying = false; refresh(); } });
  }
  function paint(plan) {
    if (!svg || !frame) return;
    const fragment = doc.createDocumentFragment();
    objects = labelEditObjects(plan,frame);
    for (const object of objects) {
      const id = object.aiSourceLabelId, group = doc.createElementNS(NS,'g'); group.dataset.aiLabelId = id;
      group.dataset.aiCommentDragPreview = ''; group.setAttribute('role','button'); group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',`라벨 ${object.text}`); group.append(renderObject(object));
      const b = labelEditBounds(object), pad = frame.h * .005;
      const hit = doc.createElementNS(NS,'rect'); hit.classList.add('ai-label-edit-hit');
      for (const [key,value] of Object.entries({x:b.x-pad,y:b.y-pad,width:Math.max(b.w+pad*2,frame.w*.015),height:Math.max(b.h+pad*2,frame.h*.025)})) hit.setAttribute(key,value);
      hit.setAttribute('vector-effect','non-scaling-stroke'); group.append(hit);
      fragment.append(group);
    }
    // A selection change updates handles only; it must not rebuild glyphs.
    svg.replaceChildren(fragment);
    if (endpointDragging()) {
      // Reuse the live SVG scene rather than encoding the full image on every
      // pointer move. The sample contains the image and labels, never handles.
      const defs = doc.createElementNS(NS,'defs'), sample = doc.createElementNS(NS,'g');
      sample.id = magnifierSceneId;
      const bitmap = doc.createElementNS(NS,'image'); bitmap.setAttribute('href',image.currentSrc || image.src);
      bitmap.setAttribute('width',frame.w); bitmap.setAttribute('height',frame.h); sample.append(bitmap);
      for (const group of [...svg.children]) sample.append(group.firstElementChild.cloneNode(true));
      defs.append(sample); svg.prepend(defs);
    }
    paintedSelection = ''; paintSelection(plan);
  }
  function paintSelection(plan) {
    if (!svg || paintedSelection === `${selectedId || '-'}`) return;
    for (const group of svg.querySelectorAll('[data-ai-label-id]')) {
      const chosen = group.dataset.aiLabelId === selectedId;
      group.classList.toggle('is-selected',chosen);
      group.querySelectorAll('.ai-label-edit-handle').forEach(handle => handle.remove());
      if (chosen) {
        const label = selected(plan), handles = [];
        if (label.mode === 'leader' && !label.leaderRoutes?.length) {
          handles.push(['anchor',label.anchor]);
          if (label.elbow) handles.push(['elbow',label.elbow]);
          (label.extraAnchors || []).forEach((p,i) => handles.push([`extra:${i}`,p]));
        }
        if (label.mode === 'leader' && label.leaderRoutes?.length) {
          label.leaderRoutes.forEach((r,i) => { handles.push([`route:${i}:target`,r.target]); (r.controls || []).forEach((p,j) => handles.push([`control:${i}:${j}`,p])); });
        }
        const unique = handles.filter(([,p],i) => !handles.slice(0,i).some(([,old]) => Math.hypot(old.x-p.x,old.y-p.y) < 1e-6));
        for (const [part,p] of unique) {
          const handle = doc.createElementNS(NS,'circle'); handle.dataset.aiLabelHandle = part;
          handle.setAttribute('cx',p.x*frame.w); handle.setAttribute('cy',p.y*frame.h); handle.setAttribute('r',frame.h*.008);
          handle.setAttribute('vector-effect','non-scaling-stroke'); handle.classList.add('ai-label-edit-handle'); group.append(handle);
        }
      }
    }
    paintedSelection = `${selectedId || '-'}`;
  }
  function geometry() {
    if (!svg || !stage || !image) return;
    const g = getImageStageGeometry(stage,image); if (!g) return;
    Object.assign(svg.style,{ left:`${g.left}px`,top:`${g.top}px`,width:`${g.width}px`,height:`${g.height}px` });
  }
  function presented(item) {
    if (active && getTarget() === item) { presentedItem = item; refresh(); }
    else if (!active && getTarget() === item) { removeOverlay(); refreshPassive(); }
  }
  function syncFields(plan) {
    const label = selected(plan); q('fields').hidden = !label;
    if (!label) return;
    const object = objects.find(item => item.aiSourceLabelId === label.id);
    const typography = label.typography || {};
    const values = { text:label.text, content:label.contentMode, role:typography.role || object?.aiLabelRole || 'text',
      font:label.manualStyle ? typography.font || '' : TEXT_FONTS.find(font => font.css === object?.fontFamily)?.label || '',
      size:Math.round((label.manualStyle?.size || (object?.fontSize || object?.labelSize || 3.5)/frame.h)*image.naturalHeight),
      rotation:typography.rotation || 0, x:+(label.position.x*100).toFixed(1), y:+(label.position.y*100).toFixed(1),
      spacing:object?.letterSpacing || 0, 'line-height':object?.labelLineHeight || 1.2, mode:label.mode,
      arrow:label.leaderRoutes?.[0]?.end || (label.leaderArrowHead === 'target' ? 'filled-arrow' : 'none'), dash:label.leaderDash || 'solid',
      'anchor-x':+(label.anchor.x*100).toFixed(1),'anchor-y':+(label.anchor.y*100).toFixed(1) };
    for (const [key,value] of Object.entries(values)) if (doc.activeElement !== q(key)) q(key).value = value;
    q('bold').setAttribute('aria-pressed',String(object?.fontWeight === 'bold'));
    q('italic').setAttribute('aria-pressed',String(object?.italic === true));
    q('spacing').disabled = label.contentMode === 'formula';
    for (const key of ['arrow','dash','anchor-x','anchor-y']) q(key).disabled = label.mode !== 'leader';
  }
  function refreshPassive() {
    const item = getTarget();
    if (active || destroyed) return;
    if (panel.hidden || !eligible(item) || !labelsVisible?.(item) || isBusy() || panel.dataset.aiLocalEraseActive === 'true') { removeOverlay(); return; }
    const nextStage = item.card?.querySelector('.ai-preview-stage'), nextImage = nextStage?.querySelector(':scope > img');
    if (!nextImage?.complete || !nextImage.naturalWidth || svg?.classList.contains('is-preview-only')) return;
    const plan = getPlan(item), key = JSON.stringify(plan);
    if (owner === item && image === nextImage && paintedKey === key && svg?.classList.contains('ai-label-click-overlay')) { geometry(); return; }
    removeOverlay(); owner = item; stage = nextStage; image = nextImage;
    frame = labelEditFrame(image.naturalWidth,image.naturalHeight,artboard());
    objects = labelEditObjects(plan,frame);
    svg = doc.createElementNS(NS,'svg'); svg.classList.add('ai-label-click-overlay'); svg.setAttribute('viewBox',`0 0 ${frame.w} ${frame.h}`);
    for (const object of objects) {
      const group = doc.createElementNS(NS,'g'); group.dataset.aiLabelId = object.aiSourceLabelId;
      group.setAttribute('role','button'); group.setAttribute('tabindex','0'); group.setAttribute('aria-label',`라벨 ${object.text} 편집`);
      const b = labelEditBounds(object), pad = frame.h*.005, hit = doc.createElementNS(NS,'rect');
      hit.classList.add('ai-label-edit-hit');
      for (const [k,v] of Object.entries({x:b.x-pad,y:b.y-pad,width:Math.max(b.w+pad*2,frame.w*.015),height:Math.max(b.h+pad*2,frame.h*.025)})) hit.setAttribute(k,v);
      group.append(hit); svg.append(group);
    }
    paintedKey = key; stage.append(svg); resizeObserver?.observe(stage); resizeObserver?.observe(image); geometry();
  }
  function refresh() {
    const item = getTarget(); entry.disabled = !eligible(item) || isBusy() || panel.dataset.aiSharingMode === 'view';
    if (active && (panel.hidden || item && !eligible(item))) { setActive(false); return; }
    if (!active) { refreshPassive(); return; }
    // Restoring another task briefly empties the result list. Keep the chosen
    // editor open through that transition, without retaining its old handles.
    if (!item) { owner = null; selectedId = null; removeOverlay(); return; }
    if (owner !== item) { owner = item; selectedId = null; removeOverlay(true); }
    const nextStage = item.card?.querySelector('.ai-preview-stage'), nextImage = nextStage?.querySelector(':scope > img');
    if (!nextImage?.naturalWidth) return;
    if (stage !== nextStage || image !== nextImage) {
      removeOverlay(true); stage = nextStage; image = nextImage;
      frame = labelEditFrame(image.naturalWidth,image.naturalHeight,artboard());
      svg = doc.createElementNS(NS,'svg'); svg.classList.add('ai-label-edit-overlay'); svg.dataset.aiCommentDragPreview = '';
      svg.setAttribute('viewBox',`0 0 ${frame.w} ${frame.h}`); stage.append(svg);
      resizeObserver?.observe(stage); resizeObserver?.observe(image);
    }
    const plan = getPlan(item);
    if (presentedItem !== item) return;
    if (preparedFontKey !== fontKey(plan)) return;
    if (selectedId && !selected(plan)) selectedId = null;
    const key = JSON.stringify(plan);
    if (key !== paintedKey && !gesture) {
      paintedKey = key; paint(plan);
    }
    if (!gesture) paintSelection(plan);
    syncFields(plan);
    section.querySelectorAll('input,textarea,select,button').forEach(control => {
      if (control.matches('[data-label-close]')) return;
      control.disabled = isBusy() || applying || panel.dataset.aiSharingMode === 'view'
        || control === q('spacing') && selected(plan)?.contentMode === 'formula'
        || control.matches('[data-label-arrow],[data-label-dash],[data-label-anchor-x],[data-label-anchor-y]') && selected(plan)?.mode !== 'leader';
    });
    geometry();
  }
  async function change(fn) {
    if (!editable()) return;
    const item = getTarget(), plan = structuredClone(getPlan(item));
    try {
      preserveLabelPresentation(plan,objects,frame); fn(plan);
      labelEditObjects(plan,frame); // Validate before adding an undo entry.
      applying = true;
      await apply(item,plan);
    } catch (error) { status(error.message,'error'); }
    finally { applying = false; paintedKey = ''; refresh(); }
  }
  function changeSelected(fn) {
    return change(plan => {
      const label = selected(plan); if (!label) throw new Error('편집할 라벨을 선택하세요.');
      const object = objects.find(object => object.aiSourceLabelId === selectedId);
      label.manualStyle ||= { size:(object?.fontSize || object?.labelSize || 3.5)/frame.h };
      label.typography ||= { role:'text' }; fn(label,plan);
    });
  }
  function add(leader) {
    return change(plan => {
      if (plan.labels.length >= 128) throw new Error('라벨은 128개까지 추가할 수 있습니다.');
      selectedId = `manual-${crypto.randomUUID()}`;
      plan.labels.push({ id:selectedId,text:'라벨',mode:leader?'leader':'text',contentMode:'plain',scope:'general',
        anchor:{x:leader ? .35 : .5,y:leader ? .65 : .5},position:{x:.5,y:.5},typography:{role:'text'},
        manualStyle:{size:24/image.naturalHeight},leaderArrowHead:'none' });
    });
  }
  listen(entry,'click',() => setActive(!active)); listen(q('close'),'click',() => setActive(false));
  listen(q('add'),'click',() => void add(false)); listen(q('add-leader'),'click',() => void add(true));
  listen(q('text'),'change',() => void changeSelected(label => changeLabelText(label,q('text').value)));
  for (const key of ['content','role','font','size','rotation','spacing','line-height','mode','arrow','dash','x','y','anchor-x','anchor-y']) {
    listen(q(key),'change',() => void changeSelected(label => {
      const value = q(key).value;
      if (q(key).type === 'number' && (!value.trim() || !q(key).checkValidity())) throw new Error('입력 범위 안의 숫자를 입력하세요.');
      if (key === 'content') { label.contentMode = value; delete label.typography.runs; delete label.typography.letterSpacing; }
      else if (key === 'role') {
        if (label.manualStyle.defaultFontPinned) {
          delete label.typography.font; delete label.typography.fontProfile; delete label.typography.italic;
          delete label.manualStyle.defaultFontPinned;
        }
        label.typography.role = value; delete label.typography.runs;
      }
      else if (key === 'font') {
        delete label.typography.fontProfile; delete label.manualStyle.defaultFontPinned;
        if (value) label.typography.font = value; else delete label.typography.font;
      }
      else if (key === 'size') label.manualStyle.size = Number(value)/image.naturalHeight;
      else if (key === 'rotation') label.typography.rotation = Number(value);
      else if (key === 'spacing') label.typography.letterSpacing = Number(value);
      else if (key === 'line-height') label.typography.lineHeight = Number(value);
      else if (key === 'mode') {
        label.mode = value;
        if (value === 'text') { label.anchor = {...label.position}; for (const k of ['leaderRoutes','elbow','extraAnchors']) delete label[k]; }
        else label.anchor = { x:point(label.position.x-.15),y:point(label.position.y+.15) };
      } else if (key === 'arrow') { label.leaderArrowHead = 'none'; label.leaderRoutes ||= [{kind:'straight',attachment:'label',start:{...label.position},target:{...label.anchor},controls:[],end:value}]; for (const r of label.leaderRoutes) r.end = value; }
      else if (key === 'dash') { label.leaderDash = value; }
      else {
        const part = key.startsWith('anchor') ? 'anchor' : 'position', axis = key.endsWith('x') ? 'x' : 'y';
        moveLabel(label,axis === 'x' ? Number(value)/100-label[part].x : 0,axis === 'y' ? Number(value)/100-label[part].y : 0,part);
      }
    }));
  }
  listen(q('bold'),'click',() => void changeSelected(label => { label.typography.fontWeight = label.typography.fontWeight === 'bold' ? 'normal' : 'bold'; }));
  listen(q('italic'),'click',() => void changeSelected(label => { delete label.manualStyle.defaultFontPinned; label.typography.italic = label.typography.italic !== true; }));
  for (const [key,symbol] of [['sub','_'],['sup','^']]) listen(q(key),'click',() => {
    const input = q('text'), a = input.selectionStart, b = input.selectionEnd;
    if (a === b) { status('첨자로 바꿀 글자를 문구에서 선택하세요.','warn'); input.focus(); return; }
    const next = input.value.slice(0,a)+symbol+'{'+input.value.slice(a,b)+'}'+input.value.slice(b);
    void changeSelected(label => { changeLabelText(label,next); label.contentMode = 'formula'; delete label.typography.letterSpacing; }).then(() => { input.value = next; input.focus(); input.setSelectionRange(a+2,b+2); });
  });
  listen(q('script-role'),'change',() => {
    const input = q('text');
    void changeSelected(label => {
      const spans = getFormulaScriptSpans(label.text).filter(span => span.start < input.selectionEnd && span.end > input.selectionStart);
      if (!spans.length) throw new Error('문구에서 서체를 바꿀 첨자를 선택하세요.');
      label.typography.scriptStyles = [...(label.typography.scriptStyles || []).filter(style => !spans.some(span => span.start === style.start && span.end === style.end)),
        ...spans.map(span => ({start:span.start,end:span.end,kind:span.kind,role:q('script-role').value}))];
    });
  });
  listen(q('duplicate'),'click',() => void change(plan => {
    if (plan.labels.length >= 128) throw new Error('라벨은 128개까지 추가할 수 있습니다.');
    const label = structuredClone(selected(plan)); if (!label) return;
    label.id = selectedId = `manual-${crypto.randomUUID()}`; moveLabel(label,.03,.03); plan.labels.push(label);
  }));
  const deleteSelected = () => change(plan => {
    plan.labels = plan.labels.filter(label => label.id !== selectedId);
    plan.relationGroups = (plan.relationGroups || []).map(group => ({...group,labelIds:group.labelIds.filter(id => id !== selectedId)})).filter(group => group.labelIds.length > 1);
    selectedId = null;
  });
  listen(q('delete'),'click',() => void deleteSelected());
  function normalized(event) { const r = image.getBoundingClientRect(); return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height}; }
  listen(panel,'pointerdown',event => {
    const target = event.target.closest?.('[data-ai-label-id]');
    if (!target || !svg?.contains(target) || event.button !== 0) return;
    if (!active) {
      if (isBusy() || panel.dataset.aiLocalEraseActive === 'true' || panel.dataset.aiSharingMode === 'view') return;
      event.preventDefault(); event.stopImmediatePropagation(); selectedId = target.dataset.aiLabelId; setActive(true); return;
    }
    if (!editable()) return;
    event.preventDefault(); event.stopImmediatePropagation(); selectedId = target.dataset.aiLabelId;
    refresh(); const plan = structuredClone(getPlan(getTarget()));
    gesture = { plan,item:getTarget(),part:event.target.dataset.aiLabelHandle || 'position',start:normalized(event),pointerId:event.pointerId,moved:false };
    try { stage.setPointerCapture(event.pointerId); } catch {}
  },{capture:true});
  listen(panel,'pointermove',event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!editable() || getTarget() !== gesture.item) { gesture = null; magnifier.hide(); refresh(); return; }
    event.preventDefault(); event.stopImmediatePropagation(); const end = normalized(event), g = gesture;
    const plan = structuredClone(g.plan), label = selected(plan), dx = end.x-g.start.x, dy = end.y-g.start.y;
    if (Math.hypot(dx,dy) < .001) return; g.moved = true;
    if (['position','anchor'].includes(g.part)) moveLabel(label,dx,dy,g.part);
    else moveLeaderHandle(label,g.part,dx,dy);
    g.next = plan;
    if (!paintFrame) paintFrame = win.requestAnimationFrame(() => { paintFrame = 0; if (gesture === g) paint(g.next); });
    if (endpointDragging()) magnifier.move({x:event.clientX,y:event.clientY});
  },{capture:true});
  function finishGesture(event,accept) {
    const g = gesture; if (!g || g.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation(); gesture = null;
    magnifier.hide();
    if (paintFrame) win.cancelAnimationFrame(paintFrame); paintFrame = 0;
    try { stage.releasePointerCapture(g.pointerId); } catch {}
    if (accept && g.moved && editable() && getTarget() === g.item) void change(plan => Object.assign(plan,g.next));
    else { if (g.moved) paintedKey = ''; refresh(); }
  }
  listen(panel,'pointerup',event => finishGesture(event,true),{capture:true});
  listen(panel,'pointercancel',event => finishGesture(event,false),{capture:true});
  listen(panel,'keydown',event => {
    if (event.target.closest?.('input,textarea,select') || panel.querySelector('dialog[open]')) return;
    const group = event.target.closest?.('[data-ai-label-id]');
    if (!active) {
      if (group && ['Enter',' '].includes(event.key) && !event.repeat && !entry.disabled) { event.preventDefault(); event.stopImmediatePropagation(); selectedId = group.dataset.aiLabelId; setActive(true); }
      return;
    }
    if (group && ['Enter',' '].includes(event.key)) { event.preventDefault(); selectedId = group.dataset.aiLabelId; refresh(); q('text').focus(); }
    else if (selectedId && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation(); const step = event.shiftKey ? 10 : 1;
      void changeSelected(label => moveLabel(label,event.key === 'ArrowLeft' ? -step/image.naturalWidth : event.key === 'ArrowRight' ? step/image.naturalWidth : 0,
        event.key === 'ArrowUp' ? -step/image.naturalHeight : event.key === 'ArrowDown' ? step/image.naturalHeight : 0));
    } else if (selectedId && ['Delete','Backspace'].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); void deleteSelected(); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setActive(false); }
  },{capture:true});
  listen(panel,'5e:ai-workbench-geometry-change',geometry);
  listen(panel,'load',event => { if (event.target === getTarget()?.card?.querySelector('.ai-preview-stage > img')) refresh(); },{capture:true});
  const switchTarget = () => { if (active) { owner = null; setActive(true); } };
  listen(panel,'5e:ai-candidate-select',switchTarget);
  listen(win,'5e:ai-task-change',switchTarget);
  listen(panel,'5e:ai-local-erase-tool-change',() => { if (panel.dataset.aiLocalEraseActive === 'true' && active) setActive(false); });
  listen(panel,'click',event => { if (event.target.closest?.('[data-ai-side-tab],[data-ai-comment-tool]') && active) setActive(false); });
  const observer = new win.MutationObserver(() => { if (panel.hidden && active) setActive(false); else refresh(); });
  observer.observe(panel,{attributes:true,attributeFilter:['hidden','inert','data-ai-busy']});
  return { prepare, presented, refresh, active:() => active, activeFor:item => active && getTarget() === item,
    close:() => setActive(false), destroy() { destroyed = true; active = false; removeOverlay(); magnifier.destroy(); lifetime.abort(); observer.disconnect(); section.remove(); entry.remove(); delete panel.dataset.aiLabelEditing; } };
}
