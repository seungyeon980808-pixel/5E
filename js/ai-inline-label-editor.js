import { snapKey, modKey, keyLabel, shortcutKey, isComposingKey, SNAP_LABEL } from './platform.js?v=1.7.0-four-session-integration';
import { TEXT_FONTS } from './state.js?v=1.7.0-four-session-integration';
import { getFormulaScriptSpans } from './formula.js?v=1.7.0-four-session-integration';
import { renderObject } from './render/scene.js?v=1.7.0-four-session-integration';
import { prepareEditableLabelFonts } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { getImageStageGeometry } from './ai-image-comments.js?v=1.7.0-four-session-integration';
import { createPointerMagnifier, svgMagnifierSample, rasterMagnifierSample, cropMagnifierEnabled } from './tools/pointer-magnifier.js?v=1.7.0-four-session-integration';
import { changeLabelText, labelEditFrame, labelEditObjects, labelEditBounds, moveLabel, moveLeaderHandle, snappedLeaderDelta, preserveLabelPresentation } from './ai-label-edit-model.js?v=1.7.0-four-session-integration';

const NS = 'http://www.w3.org/2000/svg';
const roles = [['text','일반 글자'],['name','물체·점 이름'],['quantity','물리량'],['chemical','화학식'],['unit','단위'],['number','숫자'],['symbol','기호']];
const point = n => Math.max(0,Math.min(1,n));
// 시안 v6: 가로 정렬은 같은 높이(y), 세로 정렬은 같은 X 위치. 첫 선택 라벨이 기준.
const alignTools = [
  {axis:'y', label:'가로 정렬', key:'W', tip:'같은 높이에 정렬', path:'M2 12h20M5 9h4v6H5zM15 6h4v12h-4z'},
  {axis:'x', label:'세로 정렬', key:'H', tip:'같은 X 위치에 정렬', path:'M12 2v20M9 5h6v4H9zM6 15h12v4H6z'},
];
const stepButtons = (key,[downName,upName],prefix) => [[-1,downName,'['],[1,upName,']']].map(([delta,name,bracket]) =>
  `<button type="button" data-label-step="${key}" data-delta="${delta}" aria-label="${name}" aria-keyshortcuts="${prefix}${bracket}" data-tip="${name} (${prefix}${bracket})">${delta < 0 ? '−' : '+'}</button>`).join('');

export function createInlineLabelEditor({ panel, getTarget, getPlan, isBusy, artboard, apply, displayChanged, enableLabels, labelsVisible, cancelTools, status }) {
  const doc = panel.ownerDocument, win = doc.defaultView, lifetime = new AbortController();
  let active = false, selection = [], owner = null, svg = null, stage = null, image = null;
  let frame = null, objects = [], gesture = null, paintFrame = 0, paintedKey = '', destroyed = false, applying = false, displayEpoch = 0;
  let preparedFontKey = '', fontPromise = null, pendingFontKey = '', paintedSelection = '';
  let presentedItem = null, lastClick = null;
  // 11-26 시안 v6 도구: select(선택)·text(텍스트)·leader(지시선 라벨)·dimension(길이 표시). 텍스트·지시선·길이 표시는 하나 만들면 선택으로 돌아간다.
  let tool = 'select', leaderPoints = [], leaderHover = null, drawPreview = null;
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
  const section = doc.createElement('section'); section.className = 'ai-label-edit-panel'; section.dataset.aiInlineLabelEditor = ''; section.dataset.escapeFieldScope = '';
  section.setAttribute('aria-label','라벨 편집'); section.hidden = true;
  section.innerHTML = `<header><strong>라벨 편집</strong><button type="button" data-label-close aria-label="라벨 편집 닫기">닫기</button></header>
    <div class="ai-label-edit-tools"><button type="button" data-label-add>라벨 추가</button><button type="button" data-label-add-leader>지시선 라벨</button>${alignTools.map(a =>
      `<button type="button" class="ai-label-edit-align" data-label-align="${a.axis}" aria-disabled="true" aria-keyshortcuts="${a.key}" aria-label="${a.label} (${a.key})" data-tip="${a.label} (${a.key}) · 라벨 두 개 이상 선택"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${a.path}"/></svg>${a.label}</button>`).join('')}</div>
    <p class="ai-label-edit-hint">라벨과 지시선 끝점을 드래그해 옮기세요. 빈 곳을 드래그하거나 ${keyLabel('Ctrl')} 클릭으로 여러 라벨을 고릅니다. ${SNAP_LABEL}를 누르고 끌면 지시선 각도가 15°씩 맞춰집니다. 편집을 마치면 수정 저장을 누르세요.</p>
    <div data-label-fields hidden>
      <p class="ai-label-edit-count" data-label-count hidden></p>
      <label class="ai-label-edit-text" data-label-single>문구<textarea data-label-text aria-label="라벨 문구" maxlength="1000" rows="2"></textarea></label>
      <div class="ai-label-edit-grid">
        <label data-label-single>표현<select data-label-content aria-label="라벨 표현"><option value="plain">텍스트</option><option value="formula">수식</option></select></label>
        <label data-label-single>종류<select data-label-role aria-label="라벨 종류"></select></label>
        <label class="ai-label-edit-wide">글꼴<select data-label-font aria-label="라벨 글꼴"><option value="">종류에 맞게</option><option value="__mixed" data-label-font-mixed disabled hidden>혼합</option></select></label>
        <div class="ai-label-edit-stepped"><span data-tip="크기 줄이기 [ · 키우기 ]">크기(pt)</span><span class="ai-label-edit-step"><input type="number" min="3" max="72" step="0.5" data-label-size aria-label="라벨 크기(pt)">${stepButtons('size',['글씨 크기 줄이기','글씨 크기 키우기'],'')}</span></div>
        <div class="ai-label-edit-stepped"><span data-tip="자간 좁히기 Shift+[ · 넓히기 Shift+]">자간(em)</span><span class="ai-label-edit-step"><input type="number" min="-0.1" max="0.5" step="0.01" data-label-spacing aria-label="라벨 자간">${stepButtons('spacing',['자간 좁히기','자간 넓히기'],'Shift+')}</span></div>
        <label data-label-single>회전(°)<input type="number" min="-180" max="180" step="1" data-label-rotation aria-label="라벨 회전"></label>
      </div>
      <div class="ai-label-edit-tools"><button type="button" data-label-bold aria-pressed="false">굵게</button><button type="button" data-label-italic aria-pressed="false">기울임</button><button type="button" data-label-halo aria-pressed="false" title="글자 뒤에 흰 테두리(할로)를 둘러, 거리 표시 화살표 같은 선 위에 글자를 끼워 넣습니다">할로</button><button type="button" data-label-sub data-label-single>아래첨자</button><button type="button" data-label-sup data-label-single>위첨자</button></div>
      <details class="ai-label-edit-detail" data-label-single><summary>위치·지시선·세부 서식</summary><div class="ai-label-edit-grid">
        <label>가로(%)<input type="number" min="0" max="100" step="0.1" data-label-x aria-label="라벨 가로 위치"></label>
        <label>세로(%)<input type="number" min="0" max="100" step="0.1" data-label-y aria-label="라벨 세로 위치"></label>
        <label>줄 간격<input type="number" min="0.8" max="2.5" step="0.1" data-label-line-height aria-label="라벨 줄 간격"></label>
        <label>지시선<select data-label-mode aria-label="라벨 지시선"><option value="text">없음</option><option value="leader">사용</option></select></label>
        <label>끝 모양<select data-label-arrow aria-label="지시선 끝 모양"><option value="none">없음</option><option value="open-arrow">열린 화살표</option><option value="filled-arrow">화살표</option><option value="circle">원형</option></select></label>
        <label>선 모양<select data-label-dash aria-label="지시선 선 모양"><option value="solid">실선</option><option value="dashed">파선</option><option value="dotted">점선</option></select></label>
        <label>첨자 서체<select data-label-script-role aria-label="선택한 첨자 서체"></select></label>
        <label>연결 가로(%)<input type="number" min="0" max="100" step="0.1" data-label-anchor-x aria-label="지시선 연결 가로 위치"></label>
        <label>연결 세로(%)<input type="number" min="0" max="100" step="0.1" data-label-anchor-y aria-label="지시선 연결 세로 위치"></label>
      </div></details>
      <div class="ai-label-edit-tools ai-label-edit-removal"><button type="button" data-label-duplicate data-label-single>복제</button><button type="button" data-label-delete>라벨 삭제</button></div>
    </div>`;
  // 11-15: 오른쪽 칸이 「그림 설정」으로 바뀌며 옛 탭 줄(.ai-side-tabs)이 없어져 편집 칸이 붙지 않았다(「라벨 편집」을 누르면 오른쪽이 텅 빔) — 칸 제목 아래에 붙인다.
  { const tabs = panel.querySelector('.ai-side-tabs'); if (tabs) tabs.after(section); else (panel.querySelector('.ai-conversation-caption') || panel.querySelector('.ai-conversation')?.firstElementChild)?.after(section); }
  // 크기는 pt — 카드·한글에 넣을 때와 같은 기준(그림 폭 100mm)으로 바꿔 보인다. 저장은 지금처럼 그림 높이에 대한 비율.
  const ptOf = r => +(r * 100 * image.naturalHeight / image.naturalWidth * 72 / 25.4).toFixed(1);
  const ratioOf = pt => pt * 25.4 / 72 / (100 * image.naturalHeight / image.naturalWidth);
  const q = name => section.querySelector(`[data-label-${name}]`);
  for (const [value,label] of roles) for (const name of ['role','script-role']) {
    const option = doc.createElement('option'); option.value = value; option.textContent = label; q(name).append(option);
  }
  for (const font of TEXT_FONTS) { const option = doc.createElement('option'); option.value = font.label; option.textContent = font.label; q('font').append(option); }
  const listen = (node,event,callback,options = {}) => node?.addEventListener(event,callback,{ ...options, signal:lifetime.signal });
  const eligible = item => item?.kind === 'generated' && !item.graphResult && !item.sceneResult && /^data:image\/png;/.test(item.data || '');
  // 여러 라벨 선택(시안 v6): 고른 순서를 지킨다 — 정렬은 첫 선택 라벨이 기준.
  const selectedLabels = plan => selection.map(id => plan.labels.find(label => label.id === id)).filter(Boolean);
  const selected = plan => selection.length === 1 ? plan.labels.find(label => label.id === selection[0]) : undefined;
  const objectOf = id => objects.find(object => object.aiSourceLabelId === id);
  const editable = () => active && !destroyed && !isBusy() && !applying && panel.dataset.aiSharingMode !== 'view';
  const resizeObserver = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(geometry) : null;
  const endpointDragging = () => editable() && Boolean(gesture && !['position','box'].includes(gesture.part));
  const magnifier = createPointerMagnifier({
    surface: panel, id: 'ai-label-endpoint-magnifier', available: endpointDragging,
    sample: pointer => svg?.querySelector(`#${magnifierSceneId}`)
      ? { ...svgMagnifierSample(svg,pointer), href:`#${magnifierSceneId}` } : null,
  });

  // 11-26 사용자: 텍스트·지시선·길이 표시로 점을 찍을 때도 확대경(지우개와 같은 켬/끔). 만드는 중인 선도 확대경 안에 보인다.
  let placeTrail = [];
  const placeMagnifier = createPointerMagnifier({
    surface: panel, id: 'ai-label-place-magnifier',
    // 11-26 사용자: 텍스트에는 확대경을 쓰지 않는다 — 점을 정확히 찍는 지시선·길이 표시만.
    available: () => active && ['leader','dimension'].includes(tool) && cropMagnifierEnabled('erase') && Boolean(image?.isConnected),
    sample: pointer => {
      const source = rasterMagnifierSample(image, pointer); if (!source) return null;
      const W = image.naturalWidth, H = image.naturalHeight;
      if (placeTrail.length > 1) {
        const path = doc.createElementNS(NS,'path');
        path.setAttribute('d',placeTrail.map((p,i) => `${i ? 'L' : 'M'}${p.x*W} ${p.y*H}`).join(' '));
        path.setAttribute('vector-effect','non-scaling-stroke');
        Object.assign(path.style,{ fill:'none', stroke:'#3479d0', strokeWidth:'1.8px', strokeDasharray:'6 4' });
        source.overlays = [path];
      }
      return source;
    },
  });
  function removeOverlay(preservePresentation = false) {
    if (inPlace) { inPlace.input.remove(); inPlace = null; }
    magnifier.hide(); placeMagnifier.hide();
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
    if (!active && tool !== 'select') setTool('select');
    section.hidden = !active; entry.setAttribute('aria-pressed',String(active));
    const epoch = ++displayEpoch;
    if (active) {
      applying = true;
      // Controls start disabled, even before the first bitmap/font presentation
      // reaches refresh(). Only the completed display may enable editing.
      section.querySelectorAll('input,textarea,select,button').forEach(control => {
        if (!control.matches('[data-label-close]')) control.disabled = true;
      });
    }
    if (active) { cancelTools(); enableLabels(); }
    refresh();
    void Promise.resolve(displayChanged(getTarget())).finally(() => { if (!destroyed && displayEpoch === epoch) { applying = false; refresh(); } });
  }
  function paint(plan) {
    if (!svg || !frame) return;
    const fragment = doc.createDocumentFragment();
    objects = labelEditObjects(plan,frame);
    const groups = new Map();
    for (const object of objects) {
      const id = object.aiSourceLabelId;
      // 길이 표시 선은 같은 라벨 묶음에 글자 뒤로 넣는다(선택·끌기는 글자 묶음 하나로).
      if (object.aiDimensionLine && groups.has(id)) { groups.get(id).prepend(renderObject(object)); continue; }
      const group = doc.createElementNS(NS,'g'); group.dataset.aiLabelId = id; groups.set(id,group);
      group.dataset.aiCommentDragPreview = ''; group.setAttribute('role','button'); group.setAttribute('tabindex','0');
      group.setAttribute('aria-label',`라벨 ${object.text}`); group.append(renderObject(object));
      const b = labelEditBounds(object), pad = frame.h * .005;
      const hit = doc.createElementNS(NS,'rect'); hit.classList.add('ai-label-edit-hit');
      for (const [key,value] of Object.entries({x:b.x-pad,y:b.y-pad,width:Math.max(b.w+pad*2,frame.w*.015),height:Math.max(b.h+pad*2,frame.h*.025)})) hit.setAttribute(key,value);
      hit.setAttribute('vector-effect','non-scaling-stroke'); group.append(hit);
      fragment.append(group);
    }
    // A selection change updates handles only; it must not rebuild glyphs.
    svg.replaceChildren(fragment); if (drawPreview) svg.append(drawPreview);
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
    const key = selection.join('\n') || '-';
    if (!svg || paintedSelection === key) return;
    for (const group of svg.querySelectorAll('[data-ai-label-id]')) {
      const chosen = selection.includes(group.dataset.aiLabelId);
      group.classList.toggle('is-selected',chosen);
      group.querySelectorAll('.ai-label-edit-handle').forEach(handle => handle.remove());
      group.classList.toggle('is-multi-selected', chosen && selection.length > 1);
      // 11-26: 캔버스 글자 선택과 같은 표시 — 파란 1px 테두리만(여러 개면 점선). 크기 손잡이는 두지 않는다(크기는 [ ]·칸으로).
      // 끝점 손잡이는 라벨 하나만 골랐을 때만 보인다.
      if (chosen && selection.length === 1) {
        const label = selected(plan), handles = [];
        if (label.dimension) handles.push(['dim:a',label.dimension.a],['dim:b',label.dimension.b]);
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
    paintedSelection = key;
    panel.dispatchEvent(new CustomEvent('5e:ai-label-selection-change'));
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
  function fieldValues(label) {
    const object = objectOf(label.id);
    const typography = label.typography || {};
    const values = { text:label.text, content:label.contentMode, role:typography.role || object?.aiLabelRole || 'text',
      font:object?.aiScriptRuns ? '' : label.manualStyle ? typography.font || '' : TEXT_FONTS.find(font => font.css === object?.fontFamily)?.label || '', // 조각 글꼴로 그린 라벨은 「종류에 맞게」(11-25 밤샘 검수)
      size:ptOf(label.manualStyle?.size || (object?.fontSize || object?.labelSize || 3.5)/frame.h),
      rotation:typography.rotation || 0, x:+(label.position.x*100).toFixed(1), y:+(label.position.y*100).toFixed(1),
      spacing:object?.letterSpacing || 0, 'line-height':object?.labelLineHeight || 1.2, mode:label.mode,
      arrow:label.leaderRoutes?.[0]?.end || (label.leaderArrowHead === 'target' ? 'filled-arrow' : 'none'), dash:label.leaderDash || 'solid',
      'anchor-x':+(label.anchor.x*100).toFixed(1),'anchor-y':+(label.anchor.y*100).toFixed(1) };
    return { values, bold:object?.fontWeight === 'bold', italic:object?.italic === true };
  }
  function haloOn(label) { return (label.haloRatio ?? .13) > 0; }
  function syncFields(plan) {
    const labels = selectedLabels(plan), single = labels.length === 1;
    q('fields').hidden = !labels.length;
    syncAlign(labels.length);
    if (!labels.length) return;
    section.querySelectorAll('[data-label-single]').forEach(node => { node.hidden = !single; });
    q('count').hidden = single; q('count').textContent = `라벨 ${labels.length}개 선택 · 글꼴·크기·자간·굵게·기울임은 모두에 적용`;
    const states = labels.map(fieldValues);
    // 값이 섞이면 칸을 비우고 「혼합」(시안 v6). 숫자를 넣고 Enter면 고른 라벨 모두에 들어간다.
    const keys = single ? Object.keys(states[0].values) : ['font','size','spacing'];
    for (const key of keys) {
      const value = states[0].values[key], mixed = states.some(state => state.values[key] !== value);
      if (q(key).type === 'number') q(key).placeholder = mixed ? '혼합' : '';
      if (key === 'font') q('font-mixed').hidden = !mixed;
      if (doc.activeElement !== q(key)) q(key).value = mixed ? key === 'font' ? '__mixed' : '' : value;
    }
    for (const key of ['bold','italic']) {
      const on = states.filter(state => state[key]).length;
      q(key).setAttribute('aria-pressed',on === states.length ? 'true' : on ? 'mixed' : 'false');
    }
    { const on = labels.filter(haloOn).length; q('halo').setAttribute('aria-pressed',on === labels.length ? 'true' : on ? 'mixed' : 'false'); }
    q('spacing').disabled = labels.every(label => label.contentMode === 'formula');
    for (const key of ['arrow','dash','anchor-x','anchor-y']) q(key).disabled = labels[0].mode !== 'leader';
  }
  function syncAlign(count) {
    for (const button of section.querySelectorAll('[data-label-align]')) {
      const tool = alignTools.find(a => a.axis === button.dataset.labelAlign);
      button.setAttribute('aria-disabled',String(count < 2 || !editable()));
      button.dataset.tip = `${tool.label} (${tool.key}) · ${count < 2 ? '라벨 두 개 이상 선택' : `${tool.tip} · 첫 선택 라벨 기준`}`;
    }
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
    if (!item) { owner = null; selection = []; removeOverlay(); return; }
    if (owner !== item) { owner = item; selection = []; removeOverlay(true); }
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
    selection = selection.filter(id => plan.labels.some(label => label.id === id));
    const key = JSON.stringify(plan);
    if (key !== paintedKey && !gesture && !inPlace) {
      paintedKey = key; paint(plan);
    }
    if (!gesture) paintSelection(plan);
    syncFields(plan);
    const labels = selectedLabels(plan);
    section.querySelectorAll('input,textarea,select,button').forEach(control => {
      // 정렬 단추는 aria-disabled로 막는다 — 막혀 있어도 마우스를 올리면 단축키가 보인다.
      if (control.matches('[data-label-close],[data-label-align]')) return;
      control.disabled = isBusy() || applying || panel.dataset.aiSharingMode === 'view'
        || control.matches('[data-label-spacing],[data-label-step="spacing"]') && labels.every(label => label.contentMode === 'formula')
        || control.matches('[data-label-arrow],[data-label-dash],[data-label-anchor-x],[data-label-anchor-y]') && labels[0]?.mode !== 'leader';
    });
    syncAlign(labels.length);
    geometry();
  }
  // 11-26: 그림 위에서 바로 고치기 — 라벨을 두 번 누르면 라벨 바로 아래(왼쪽 끝 맞춤)에 한 줄 입력창이 붙고,
  // 치는 대로 그림 속 글자가 바뀐다. 커서·한글 조합·수식 원문은 입력창에서 정확히 보인다(사용자 결정: 늘 입력창).
  // Enter·다른 곳 누르기 = 반영(실행 취소 한 단계), Esc = 처음 글자로 되돌림.
  let inPlace = null;
  const BLANK = '\u200B';
  function openInPlace(id, { fresh = false } = {}) {
    closeInPlace(false);
    const plan = getPlan(getTarget()), label = plan.labels.find(item => item.id === id);
    const group = svg && [...svg.querySelectorAll('[data-ai-label-id]')].find(node => node.dataset.aiLabelId === id);
    if (!label || !group || !stage || !editable()) return;
    const input = doc.createElement('input'); input.type = 'text'; input.className = 'ai-label-inplace';
    input.value = label.text === BLANK ? '' : label.text; input.dataset.escapeFieldScope = ''; input.setAttribute('aria-label',`라벨 ${label.text} 문구`);
    stage.append(input);
    const place = () => {
      const live = svg && [...svg.querySelectorAll('[data-ai-label-id]')].find(node => node.dataset.aiLabelId === id) || group;
      const box = live.querySelector('.ai-label-edit-hit') || live;
      const r = box.getBoundingClientRect(), s = stage.getBoundingClientRect();
      input.style.left = `${r.left - s.left}px`; input.style.top = `${r.bottom - s.top + 4}px`;
      input.style.width = `${Math.max(120,Math.min(360,(input.value.length + 3) * 9))}px`;
    };
    const startObject = objectOf(id);
    // 글자가 늘거나 줄어도 왼쪽 끝은 그 자리에 둔다(가운데 기준으로 좌우로 퍼지지 않게).
    inPlace = { id, input, fresh, original:label.text, originalMode:label.contentMode || 'plain', left: startObject ? labelEditBounds(startObject).x : null, shift: 0 };
    place();
    input.addEventListener('input',() => {
      if (doc.activeElement !== q('text')) q('text').value = input.value;
      place();
      // \the… 처럼 명령을 치는 중에는 그림을 그대로 두고, 명령이 끝나면(다음 글자) 바꿔 그린다.
      if (/\\[a-zA-Z]*$/.test(input.value.slice(0,input.selectionEnd ?? input.value.length))) return;
      const next = structuredClone(getPlan(getTarget())), target = next.labels.find(item => item.id === id);
      if (!target) return;
      try {
        preserveLabelPresentation(next,objects,frame); changeLabelText(target,input.value || BLANK);
        target.contentMode = inPlaceMode(input.value,inPlace.originalMode,input.selectionEnd);
        formulaTypography(target,inPlace.originalMode);
        const grown = labelEditObjects(next,frame).find(object => object.aiSourceLabelId === id);
        inPlace.shift = inPlace.left == null || !grown ? 0 : (inPlace.left - labelEditBounds(grown).x) / frame.w;
        if (inPlace.shift) moveLabel(target,inPlace.shift,0);
        labelEditObjects(next,frame); paint(next); place();
      } catch {}
      if (doc.activeElement !== q('text')) q('text').value = input.value;
    });
    input.addEventListener('keydown',event => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); closeInPlace(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeInPlace(false); }
    });
    input.addEventListener('blur',() => closeInPlace(true));
    input.focus(); input.select();
  }
  // 캔버스 글자 도구와 같은 규칙: \theta·v_0·x^2·frac{…} 같은 문법이 있으면 수식으로 그린다.
  // 다만 \the… 처럼 명령을 치는 중이면(커서 바로 앞이 \글자) 친 그대로 보이다가, 다음 글자에서 θ로 바뀐다.
  function inPlaceMode(value,original,caretAt = null) {
    if (/\n/.test(value)) return 'plain';
    if (caretAt !== null && /\\[a-zA-Z]*$/.test(value.slice(0,caretAt))) return 'plain';
    return /\\[a-zA-Z]/.test(value) || /\b(frac|vec|sqrt)\s*\{/.test(value) || /[_^]/.test(value) ? 'formula' : original === 'formula' && !value.trim() ? 'formula' : 'plain';
  }
  // 보통 글자 라벨이 수식으로 바뀌면 수식 글꼴(Latin Modern 기울임, 캔버스 수식과 같은 종류 'quantity')로 그린다 —
  // 바탕 글꼴(돋움)을 그대로 이어받아 θ′₀가 고딕 정자로 그려졌다(11-26).
  function formulaTypography(label,originalMode) {
    if (label.contentMode !== 'formula') return;
    label.typography ||= {}; delete label.typography.letterSpacing;
    if (originalMode === 'formula') return;
    if (!label.typography.role || ['text','name','symbol'].includes(label.typography.role)) label.typography.role = 'quantity';
    delete label.typography.font; delete label.typography.fontProfile; delete label.typography.italic; delete label.typography.runs;
    if (label.manualStyle) delete label.manualStyle.defaultFontPinned;
  }
  function closeInPlace(accept) {
    const current = inPlace; if (!current) return;
    inPlace = null; current.input.remove();
    const text = current.input.value.trim();
    // 새로 만든 라벨을 비운 채 끝내거나 Esc로 나오면 만들기를 되돌린다(빈 라벨을 남기지 않는다).
    if (current.fresh && (!accept || !text)) { selection = []; panel.querySelector('[data-ai-edit-undo]')?.click(); return; }
    if (accept && text && text !== current.original) {
      selection = [current.id];
      void changeSelected(label => {
        changeLabelText(label,text); label.contentMode = inPlaceMode(text,current.originalMode);
        formulaTypography(label,current.originalMode);
        if (current.shift) moveLabel(label,current.shift,0);
      });
    }
    else { paintedKey = ''; refresh(); }
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
  // 고른 라벨 모두에 같은 조작을 한 번에 넣는다 — 실행 취소 한 단계.
  function changeSelected(fn) {
    return change(plan => {
      const labels = selectedLabels(plan); if (!labels.length) throw new Error('편집할 라벨을 선택하세요.');
      for (const label of labels) {
        const object = objectOf(label.id);
        label.manualStyle ||= { size:(object?.fontSize || object?.labelSize || 3.5)/frame.h };
        label.typography ||= { role:'text' };
      }
      for (const label of labels) fn(label,plan,labels);
    });
  }
  // 글씨 크기 [ / ] ±1pt, 자간 Shift+[ / Shift+] ±0.01em(시안 v6 nudgeProperty).
  function nudge(key,delta) {
    if (!selection.length || !editable()) return;
    if (key === 'spacing' && selectedLabels(getPlan(getTarget())).every(label => label.contentMode === 'formula')) return;
    return changeSelected(label => {
      if (key === 'size') label.manualStyle.size = ratioOf(Math.min(72,Math.max(3,Math.round((ptOf(label.manualStyle.size)+delta)*10)/10)));
      else if (label.contentMode !== 'formula') {
        const now = Number.isFinite(label.typography.letterSpacing) ? label.typography.letterSpacing : objectOf(label.id)?.letterSpacing || 0;
        label.typography.letterSpacing = Math.min(.5,Math.max(-.1,Math.round((now+delta*.01)*100)/100));
      }
    });
  }
  function align(axis) {
    if (selection.length < 2 || !editable()) return;
    const baseId = selection[0];
    return changeSelected((label,plan) => {
      const base = plan.labels.find(item => item.id === baseId);
      if (label !== base) moveLabel(label,axis === 'x' ? base.position.x-label.position.x : 0,axis === 'y' ? base.position.y-label.position.y : 0);
    }).then(() => status(`첫 선택 라벨에 맞춰 ${axis === 'y' ? '가로' : '세로'}로 정렬했습니다.`));
  }
  function setTool(next) {
    tool = ['text','leader','dimension'].includes(next) ? next : 'select';
    leaderPoints = []; leaderHover = null; clearPreview(); placeMagnifier.hide(); // 만들기를 끝내면 확대경도 닫는다
    if (stage) stage.dataset.aiLabelTool = tool;
    panel.dataset.aiLabelTool = tool;
    panel.dispatchEvent(new CustomEvent('5e:ai-label-tool-change',{detail:{tool}}));
  }
  function clearPreview() { drawPreview?.remove(); drawPreview = null; placeTrail = []; }
  function showPreview(points) {
    placeTrail = points;
    if (!svg || !frame || points.length < 2) { clearPreview(); return; }
    if (!drawPreview) { drawPreview = doc.createElementNS(NS,'path'); drawPreview.classList.add('ai-label-draw-preview'); drawPreview.setAttribute('vector-effect','non-scaling-stroke'); }
    drawPreview.setAttribute('d',points.map((p,i) => `${i ? 'L' : 'M'}${p.x*frame.w} ${p.y*frame.h}`).join(' '));
    if (drawPreview.parentNode !== svg) svg.append(drawPreview);
  }
  // 캔버스 snapAngle과 같은 15° 맞춤(Ctrl·⌥) — 그림 픽셀 기준으로 각을 잰다.
  function leaderPoint(pivot,p,event) {
    if (!pivot || !(event.ctrlKey || event.altKey || snapKey(event))) return p;
    const w = image.naturalWidth, h = image.naturalHeight, dx = (p.x-pivot.x)*w, dy = (p.y-pivot.y)*h, length = Math.hypot(dx,dy);
    const step = Math.round(Math.atan2(dy,dx)/(Math.PI/12)), angle = step*Math.PI/12;
    return { x:pivot.x + (Math.abs(step)%12 === 6 ? 0 : Math.cos(angle)*length/w), y:pivot.y + (step%12 === 0 ? 0 : Math.sin(angle)*length/h) };
  }
  // 새 라벨 크기는 그림에 이미 있는 라벨들의 가운데 크기(없으면 24px)— 24px 고정이면 큰 그림에서 너무 작았다.
  function typicalSize() {
    const sizes = objects.filter(o => !o.aiDimensionLine).map(o => (o.fontSize || o.labelSize) / frame.h).filter(v => Number.isFinite(v) && v > 0).sort((x,y) => x-y);
    return sizes.length ? sizes[Math.floor(sizes.length/2)] : Math.max(24/image.naturalHeight,.04); // 라벨이 없으면 그림 높이의 4%
  }
  function addAt(kind,{position,points,a,b}) {
    let id = null;
    return change(plan => {
      if (plan.labels.length >= 128) throw new Error('라벨은 128개까지 추가할 수 있습니다.');
      id = `manual-${crypto.randomUUID()}`; selection = [id];
      const base = { ...(panel.dataset.aiCreateUi === 'true' && kind !== 'dimension' ? { haloRatio: 0 } : {}), id, contentMode:'plain', scope:'general',
        typography:{role:'text'}, manualStyle:{size:typicalSize()}, leaderArrowHead:'none' };
      // 11-26 사용자: 「텍스트」「지시선 라벨」 같은 글자를 미리 넣지 않는다 — 캔버스 라벨 도구처럼 빈 글자에서 바로 친다(빈 칸은 보이지 않는 글자로 둔다).
      if (kind === 'text') plan.labels.push({ ...base, text:BLANK, mode:'text', anchor:{...position}, position:{...position} });
      else if (kind === 'leader') plan.labels.push({ ...base, text:BLANK, mode:'leader', anchor:{...points[0]}, position:{...points.at(-1)},
        ...(points.length === 3 ? { elbow:{...points[1]} } : {}) });
      else {
        const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
        plan.labels.push({ ...base, text:'L', contentMode:'formula', typography:{role:'quantity'}, mode:'text', anchor:{...mid}, position:{...mid}, dimension:{ a:{...a}, b:{...b} } });
      }
    }).then(() => {
      setTool('select');
      if (id && getPlan(getTarget()).labels.some(label => label.id === id)) { refresh(); openInPlace(id,{ fresh: kind !== 'dimension' }); }
    });
  }
  function finishLeader() {
    if (leaderPoints.length < 2) return;
    const points = leaderPoints; leaderPoints = []; leaderHover = null; clearPreview(); placeMagnifier.hide();
    void addAt('leader',{points});
  }
  function add(leader) {
    return change(plan => {
      if (plan.labels.length >= 128) throw new Error('라벨은 128개까지 추가할 수 있습니다.');
      const id = `manual-${crypto.randomUUID()}`; selection = [id];
      // 11-25 밤샘 검수: 새 라벨이 늘 같은 자리에 생겨 앞 라벨을 덮었다 — 겹치면 오른쪽 아래로 조금씩 비켜 놓는다.
      const near = (a,b) => Math.abs(a.x-b.x) < .035 && Math.abs(a.y-b.y) < .035;
      let shift = 0;
      while (shift < 6 && plan.labels.some(label => near(label.position,{x:.5+shift*.07,y:.5+shift*.07})
        || leader && label.mode === 'leader' && near(label.anchor,{x:.35+shift*.07,y:point(.65+shift*.07)}))) shift++;
      const step = (shift % 6)*.07;
      plan.labels.push({ ...(panel.dataset.aiCreateUi === 'true' ? { haloRatio: 0 } : {}), id,text:'라벨',mode:leader?'leader':'text',contentMode:'plain',scope:'general',
        anchor:{x:point((leader ? .35 : .5)+step),y:point((leader ? .65 : .5)+step)},position:{x:.5+step,y:.5+step},typography:{role:'text'},
        manualStyle:{size:24/image.naturalHeight},leaderArrowHead:'none' });
    });
  }
  listen(entry,'click',() => setActive(!active)); listen(q('close'),'click',() => setActive(false));
  listen(q('add'),'click',() => void add(false)); listen(q('add-leader'),'click',() => void add(true));
  listen(q('text'),'change',() => void changeSelected(label => changeLabelText(label,q('text').value)));
  for (const key of ['content','role','font','size','rotation','spacing','line-height','mode','arrow','dash','x','y','anchor-x','anchor-y']) {
    listen(q(key),'change',() => void changeSelected((label,plan) => {
      const value = q(key).value;
      if (key === 'font' && value === '__mixed') return;
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
      else if (key === 'size') label.manualStyle.size = ratioOf(Number(value));
      else if (key === 'rotation') label.typography.rotation = Number(value);
      else if (key === 'spacing') { if (label.contentMode !== 'formula') label.typography.letterSpacing = Number(value); }
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
  // 여러 개를 고르면 모두 켜져 있을 때만 끄고, 아니면 모두 켠다(시안 v6). 켤지 끌지는 바꾸기 전에 한 번만 정한다.
  const toggleFace = (isOn,set) => change(plan => {
    const labels = selectedLabels(plan); if (!labels.length) throw new Error('편집할 라벨을 선택하세요.');
    for (const label of labels) { label.manualStyle ||= { size:(objectOf(label.id)?.fontSize || objectOf(label.id)?.labelSize || 3.5)/frame.h }; label.typography ||= { role:'text' }; }
    const on = !labels.every(isOn);
    for (const label of labels) set(label,on);
  });
  listen(q('bold'),'click',() => void toggleFace(label => label.typography.fontWeight === 'bold',(label,on) => { label.typography.fontWeight = on ? 'bold' : 'normal'; }));
  listen(q('italic'),'click',() => void toggleFace(label => label.typography.italic === true,(label,on) => {
    // 조각 글꼴로 그린 라벨은 글꼴을 그대로 두고 기울임만 바꾼다(11-25 밤샘 검수).
    if (!objectOf(label.id)?.aiScriptRuns) delete label.manualStyle.defaultFontPinned;
    label.typography.italic = on;
  }));
  // 11-26: 할로 켬/끔 — 켜면 거리 표시 선 위 글자와 같은 굵은 흰 테두리(0.34), 끄면 없음(0). 고른 라벨 모두에 한 번에.
  listen(q('halo'),'click',() => void change(plan => {
    const labels = selectedLabels(plan); if (!labels.length) throw new Error('편집할 라벨을 선택하세요.');
    const on = !labels.every(haloOn);
    for (const label of labels) label.haloRatio = on ? .34 : 0;
  }));
  for (const button of section.querySelectorAll('[data-label-step]')) listen(button,'click',() => void nudge(button.dataset.labelStep,Number(button.dataset.delta)));
  for (const button of section.querySelectorAll('[data-label-align]')) listen(button,'click',() => { if (button.getAttribute('aria-disabled') === 'false') void align(button.dataset.labelAlign); });
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
    label.id = `manual-${crypto.randomUUID()}`; selection = [label.id]; moveLabel(label,.03,.03); plan.labels.push(label);
  }));
  const deleteSelected = () => { const ids = new Set(selection); return change(plan => {
    plan.labels = plan.labels.filter(label => !ids.has(label.id));
    plan.relationGroups = (plan.relationGroups || []).map(group => ({...group,labelIds:group.labelIds.filter(id => !ids.has(id))})).filter(group => group.labelIds.length > 1);
    selection = [];
  }); };
  listen(q('delete'),'click',() => void deleteSelected());
  function normalized(event) { const r = image.getBoundingClientRect(); return {x:(event.clientX-r.left)/r.width,y:(event.clientY-r.top)/r.height}; }
  const manualAllowed = () => panel.dataset.aiResultMode !== 'chat' && panel.dataset.aiLocalEraseActive !== 'true';
  // 빈 곳을 끌면 사각 안에 걸친 라벨을 고른다. Shift·Ctrl/⌘이면 있던 선택에 더한다(시안 v6 'box').
  function boxSelect(g,end) {
    const x1 = Math.min(g.start.x,end.x)*frame.w, x2 = Math.max(g.start.x,end.x)*frame.w;
    const y1 = Math.min(g.start.y,end.y)*frame.h, y2 = Math.max(g.start.y,end.y)*frame.h;
    const hits = objects.filter(object => { const b = labelEditBounds(object); return b.x <= x2 && b.x+b.w >= x1 && b.y <= y2 && b.y+b.h >= y1; })
      .map(object => object.aiSourceLabelId);
    selection = [...new Set([...g.base,...hits])];
    if (!g.rect) { g.rect = doc.createElementNS(NS,'rect'); g.rect.classList.add('ai-label-edit-marquee'); g.rect.setAttribute('vector-effect','non-scaling-stroke'); }
    for (const [key,value] of Object.entries({x:x1,y:y1,width:x2-x1,height:y2-y1})) g.rect.setAttribute(key,value);
    if (!g.rect.isConnected) svg?.append(g.rect);
    paintSelection(getPlan(g.item)); syncFields(getPlan(g.item));
  }
  listen(panel,'pointerdown',event => {
    if (event.button !== 0) return;
    const target = event.target.closest?.('[data-ai-label-id]');
    if (active && tool !== 'select' && svg && stage && editable() && manualAllowed()
      && (stage.contains(event.target) || getTarget()?.card?.contains(event.target))
      && !event.target.closest?.('.ai-label-inplace,button,input,select,textarea,summary,[role="button"]:not([data-ai-label-id])')) {
      const p = normalized(event);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (tool === 'text') { void addAt('text',{position:p}); return; }
      if (tool === 'leader') {
        if (leaderPoints.length === 3) leaderPoints.pop();
        leaderPoints.push(leaderPoint(leaderPoints.at(-1),p,event)); leaderHover = null; showPreview(leaderPoints);
        status(leaderPoints.length < 2 ? '글자 자리를 클릭하세요.' : 'Enter 또는 Space로 완성합니다. 한 번 더 클릭하면 꺾인 지시선이 됩니다.','ok');
        return;
      }
      gesture = { part:'dimension', item:getTarget(), start:p, end:p, pointerId:event.pointerId, moved:false };
      try { stage.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    if (active && !target && svg && stage && editable() && manualAllowed() && [image,stage,svg].includes(event.target)) {
      const start = normalized(event);
      if (start.x < 0 || start.x > 1 || start.y < 0 || start.y > 1) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      gesture = { part:'box', item:getTarget(), start, pointerId:event.pointerId, moved:false, base:additive ? [...selection] : [] };
      try { stage.setPointerCapture(event.pointerId); } catch {}
      return;
    }
    if (!target || !svg?.contains(target)) return;
    if (!active) {
      if (panel.dataset.aiResultMode === 'chat') return;
      if (isBusy() || panel.dataset.aiLocalEraseActive === 'true' || panel.dataset.aiSharingMode === 'view') return;
      event.preventDefault(); event.stopImmediatePropagation(); selection = [target.dataset.aiLabelId]; setActive(true); return;
    }
    if (!editable() || !manualAllowed()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const id = target.dataset.aiLabelId, handle = event.target.dataset.aiLabelHandle;
    // Ctrl/⌘ 클릭은 놓을 때 선택에 더하거나 뺀다. 고른 라벨 중 하나를 잡으면 고른 것을 함께 옮긴다.
    const toggle = (event.metaKey || event.ctrlKey) && !handle, previous = [...selection];
    if (handle || !selection.includes(id) && !toggle) selection = [id];
    refresh(); const plan = structuredClone(getPlan(getTarget()));
    gesture = { plan,item:getTarget(),part:handle || 'position',start:normalized(event),pointerId:event.pointerId,moved:false,
      id,toggle,previous,ids:!handle && !toggle && selection.includes(id) ? [...selection] : [id] };
    try { stage.setPointerCapture(event.pointerId); } catch {}
  },{capture:true});
  listen(panel,'pointermove',event => {
    if (!gesture && active && tool === 'leader' && leaderPoints.length && image) {
      leaderHover = leaderPoint(leaderPoints.at(-1),normalized(event),event); showPreview([...leaderPoints,leaderHover]); placeMagnifier.move({x:event.clientX,y:event.clientY}); return;
    }
    if (gesture?.part === 'dimension' && gesture.pointerId === event.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation();
      gesture.end = leaderPoint(gesture.start,normalized(event),event); gesture.moved = true; showPreview([gesture.start,gesture.end]); placeMagnifier.move({x:event.clientX,y:event.clientY}); return;
    }
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!editable() || getTarget() !== gesture.item) { gesture?.rect?.remove(); gesture = null; magnifier.hide(); refresh(); return; }
    event.preventDefault(); event.stopImmediatePropagation(); const end = normalized(event), g = gesture;
    let dx = end.x-g.start.x, dy = end.y-g.start.y;
    if (Math.hypot(dx,dy) < .001) return;
    if (g.part === 'box') { g.moved = true; boxSelect(g,end); return; }
    if (!g.moved && (g.toggle || snapKey(event) && g.ids.length > 1)) {
      // 시안 v6: Ctrl/⌘·각도 맞춤 키를 누른 채 끌면 잡은 라벨 하나만 옮긴다.
      selection = [g.id]; g.ids = [g.id]; paintedSelection = ''; paintSelection(g.plan); syncFields(g.plan);
    }
    g.moved = true;
    const plan = structuredClone(g.plan);
    if (g.ids.length === 1) {
      const label = plan.labels.find(item => item.id === g.id);
      if ((snapKey(event) || event.ctrlKey || event.altKey) && (label.mode === 'leader' || label.dimension && g.part.startsWith('dim:'))) ({dx,dy} = snappedLeaderDelta(label,g.part,dx,dy,frame));
      if (['position','anchor'].includes(g.part)) moveLabel(label,dx,dy,g.part);
      else moveLeaderHandle(label,g.part,dx,dy);
    } else for (const label of plan.labels) if (g.ids.includes(label.id)) moveLabel(label,dx,dy);
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
    if (g.part === 'dimension') {
      clearPreview(); placeMagnifier.hide();
      const end = g.end || normalized(event), px = Math.hypot((end.x-g.start.x)*image.getBoundingClientRect().width,(end.y-g.start.y)*image.getBoundingClientRect().height);
      if (accept && px >= 3) void addAt('dimension',{a:g.start,b:{x:Math.max(0,Math.min(1,end.x)),y:Math.max(0,Math.min(1,end.y))}});
      return;
    }
    if (g.part === 'box') {
      g.rect?.remove();
      if (!accept) selection = g.base; else if (!g.moved) selection = g.base; // 빈 곳 클릭은 선택을 비운다.
      paintedSelection = ''; refresh(); return;
    }
    if (accept && g.moved && editable() && getTarget() === g.item) { lastClick = null; void change(plan => Object.assign(plan,g.next)); return; }
    if (g.moved) paintedKey = '';
    else if (accept && g.part === 'position') {
      if (g.toggle) selection = g.previous.includes(g.id) ? g.previous.filter(id => id !== g.id) : [...g.previous,g.id];
      else selection = [g.id];
      // 라벨을 두 번 누르면 문구 칸에서 바로 고친다.
      const now = event.timeStamp, again = !g.toggle && lastClick?.id === g.id && now-lastClick.time < 450;
      lastClick = again || g.toggle ? null : {id:g.id,time:now};
      if (again) { refresh(); openInPlace(g.id); return; }
    }
    refresh();
  }
  listen(panel,'pointerup',event => finishGesture(event,true),{capture:true});
  listen(panel,'pointercancel',event => finishGesture(event,false),{capture:true});
  // 11-25 밤샘 검수: 문구·서식 칸에서 Esc는 그 칸에 쓰던 것을 버리고 칸에서 나온다(창은 닫지 않는다).
  let fieldStart = null;
  listen(section,'focusin',event => { if (event.target.matches?.('input,textarea,select')) fieldStart = {field:event.target, value:event.target.value}; });
  listen(section,'keydown',event => {
    if (event.isComposing) return;
    // 숫자 칸에서 Enter는 값을 넣고(고른 라벨 모두) 칸에서 나온다 — 바로 [ ] W H를 쓸 수 있게.
    if (event.key === 'Enter' && event.target.matches?.('input')) { event.preventDefault(); event.target.blur(); return; }
    if (event.key !== 'Escape' || !event.target.matches?.('input,textarea,select')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (fieldStart?.field === event.target) event.target.value = fieldStart.value;
    event.target.blur();
  });
  // 라벨 단축키. 그림 쪽(본문)이나 AI 창 안에 포커스가 있을 때만 받고, 글 입력 칸에서는 글자로 들어간다.
  listen(doc,'keydown',event => {
    const t = event.target;
    if (panel.hidden || panel.inert || !(panel.contains(t) || t === doc.body || t === doc.documentElement)) return;
    if (t.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])') || isComposingKey(event)) return;
    if (doc.querySelector('dialog[open],.modal-overlay:not([hidden]):not(#ai-image-panel)')) return;
    const group = t.closest?.('[data-ai-label-id]'), key = shortcutKey(event), plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    const take = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (!active) {
      if (group && ['Enter',' '].includes(event.key) && !event.repeat && !entry.disabled) { take(); selection = [group.dataset.aiLabelId]; setActive(true); }
      return;
    }
    if (!manualAllowed()) return;
    if (tool === 'leader' && ['Enter',' '].includes(event.key) && leaderPoints.length) { take(); finishLeader(); return; }
    if (tool !== 'select' && event.key === 'Escape') { take(); setTool('select'); status('선택 도구로 돌아왔습니다.','ok'); return; }
    if (group && ['Enter',' '].includes(event.key)) { event.preventDefault(); selection = [group.dataset.aiLabelId]; refresh(); q('text').focus(); }
    else if (modKey(event) && !event.altKey && !event.shiftKey && key === 'a') {
      take(); selection = getPlan(getTarget()).labels.map(label => label.id); refresh();
    }
    else if (plain && !event.shiftKey && ['w','h'].includes(key)) {
      if (selection.length < 2) return;
      take(); if (!event.repeat) void align(key === 'w' ? 'y' : 'x');
    }
    else if (plain && selection.length && ['BracketLeft','BracketRight'].includes(event.code)) {
      take(); void nudge(event.shiftKey ? 'spacing' : 'size',event.code === 'BracketLeft' ? -1 : 1);
    }
    else if (selection.length && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      take(); const step = event.shiftKey ? 10 : 1;
      void changeSelected(label => moveLabel(label,event.key === 'ArrowLeft' ? -step/image.naturalWidth : event.key === 'ArrowRight' ? step/image.naturalWidth : 0,
        event.key === 'ArrowUp' ? -step/image.naturalHeight : event.key === 'ArrowDown' ? step/image.naturalHeight : 0));
    } else if (selection.length && ['Delete','Backspace'].includes(event.key)) { take(); void deleteSelected(); }
    else if (event.key === 'Escape' && panel.contains(t)) { take(); setActive(false); }
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
    setTool, tool:() => tool, align:axis => align(axis), alignAvailable:() => selection.length >= 2 && editable(),
    close:() => setActive(false), destroy() { destroyed = true; active = false; removeOverlay(); magnifier.destroy(); placeMagnifier.destroy(); lifetime.abort(); observer.disconnect(); section.remove(); entry.remove(); delete panel.dataset.aiLabelEditing; } };
}
