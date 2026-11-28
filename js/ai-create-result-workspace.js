// Keep the original controls and their handlers when moving between workflows.
export function createResultWorkspace({panel, stopEditing, signal, hasUnsavedEdit = () => false, onUnsavedEdit = () => {}}) {
  const doc = panel.ownerDocument;
  const caption = panel.querySelector('.ai-conversation-caption');
  const modes = doc.createElement('div');
  modes.className = 'ai-result-modes';
  modes.setAttribute('role','group');
  modes.setAttribute('aria-label','생성 결과 작업 방식');
  modes.innerHTML = '<button type="button" data-result-mode="chat">AI와 대화</button><button type="button" data-result-mode="manual">직접 편집</button>';
  modes.hidden = true;
  caption.prepend(modes);
  const tools = doc.createElement('div');
  tools.className = 'ai-manual-tools';
  tools.hidden = true;
  caption.after(tools);
  const footer = doc.createElement('footer');
  footer.className = 'ai-create-result-footer';
  footer.setAttribute('aria-label','생성 이미지 내보내기');
  footer.hidden = true;
  panel.querySelector('.ai-result-pane').append(footer);

  const placements = [];
  function relocate(selector, destination, { first = false } = {}) {
    const control = panel.querySelector(selector);
    if (!control || !destination) return;
    const home = doc.createComment(selector);
    control.before(home);
    placements.push({control,home,destination,first});
  }
  relocate('.ai-output-actions',footer);
  relocate('[data-ai-label-edit]',tools);
  relocate('[data-ai-local-erase]',tools);
  // 11-26 시안 v6: 「편집 취소 · 수정 저장」은 오른쪽 칸 맨 아래.
  const editActions = doc.createElement('div');
  editActions.className = 'ai-manual-actions';
  editActions.hidden = true;
  (caption.parentElement || panel).append(editActions);
  relocate('[data-ai-edit-discard]',editActions);
  relocate('[data-ai-edit-save]',editActions);
  relocate('[data-ai-local-erase-options]',tools);
  relocate('.ai-output-more',tools);
  // 11-26 시안(생성 화면 정리 5): 생성 화면은 결과가 있든 없든 도구줄 한 줄 — 결과 이름 줄을 없애고
  // 판 고르기는 도구줄 맨 앞, 「＋ 레퍼런스」는 그 옆, 라벨 켜기는 코멘트 켜기 옆에 늘 둔다(쓸 수 없으면 흐리게).
  const heading = panel.querySelector('.ai-compare-heading');
  const layerSeg = panel.querySelector('.ai-annotation-toolbar [data-ai-comment-visibility]')?.parentElement;
  const rowPlacements = [];
  const rowWanted = [];
  // 「＋ 레퍼런스」처럼 이 모듈보다 늦게 만들어지는 단추도 있으니, 처음 한 줄로 바꿀 때 찾는다.
  const placeInRow = (selector, destination, first) => rowWanted.push({selector,destination,first});
  const claimRowControls = () => {
    for (let i = rowWanted.length - 1; i >= 0; i--) {
      const {selector,destination,first} = rowWanted[i], control = panel.querySelector(selector);
      if (!control || !destination) continue;
      const home = doc.createComment(selector); control.before(home); rowPlacements.push({control,home,destination,first});
      rowWanted.splice(i,1);
    }
  };
  placeInRow('.ai-result-pane .ai-version-picker',heading,true);
  placeInRow('.ai-result-pane [data-ai-create-add-ref]',heading,false);
  // 11-27 사용자: 변환도 생성처럼 — 라벨 켜기는 위 도구줄의 「● 라벨 ● 코멘트」 자리에, 결과 칸 머리의 지우개·라벨 편집은 빼고(직접 편집 도구 격자로),
  // 코멘트 도구는 점·박스만. 이 줄 모양은 data-ai-layer-row(변환·생성 공통)로 켠다.
  const labelView = panel.querySelector('.ai-result-pane [data-ai-label-view]');
  const labelViewHome = labelView && doc.createComment('label-view');
  labelView?.before(labelViewHome);
  let layerRowOn = false;
  function syncLayerRow() {
    const on = panel.dataset.aiCreateUi === 'true' || panel.dataset.aiWorkflow === 'image';
    if (panel.hasAttribute('data-ai-layer-row') !== on) panel.toggleAttribute('data-ai-layer-row', on);
    if (on === layerRowOn || !labelView || !layerSeg) return;
    layerRowOn = on;
    if (on) layerSeg.prepend(labelView); else labelViewHome.after(labelView);
    // 코멘트 켜기 글자도 같은 규칙(「코멘트」) — 코멘트 화면을 다시 그릴 때까지 기다리지 않는다.
    const visibility = layerSeg.querySelector('[data-ai-comment-visibility]');
    if (on && visibility) visibility.textContent = '코멘트';
  }
  const layerObserver = new MutationObserver(syncLayerRow);
  layerObserver.observe(panel,{attributes:true,attributeFilter:['data-ai-create-ui','data-ai-workflow']});
  signal?.addEventListener('abort',() => layerObserver.disconnect(),{once:true});
  queueMicrotask(syncLayerRow);
  let rowOn = false;
  function syncCreateRow() {
    const on = panel.dataset.aiCreateUi === 'true';
    if (on && rowWanted.length) { const before = rowPlacements.length; claimRowControls(); if (rowOn) for (const {control,destination,first} of rowPlacements.slice(before)) { const anchor = heading.querySelector(':scope > .ai-annotation-toolbar'); if (first) destination.prepend(control); else if (anchor) anchor.before(control); else destination.append(control); } }
    if (on !== rowOn) {
      rowOn = on;
      for (const {control,home,destination,first} of rowPlacements) {
        if (on) { const anchor = heading.querySelector(':scope > .ai-annotation-toolbar'); if (first) destination.prepend(control); else if (anchor) anchor.before(control); else destination.append(control); }
        else home.after(control);
      }
    }
    const turnedOn = on && !panel.hasAttribute('data-ai-create-one-row');
    panel.toggleAttribute('data-ai-create-one-row', on);
    // 생성 화면에 들어올 때만 결과 한 창으로 맞춘다(결과 카드 「비교」로 고른 비교 보기는 그대로 둔다).
    if (turnedOn && panel.dataset.aiLayout && panel.dataset.aiLayout !== 'result') panel.querySelector('[data-ai-layout-mode="result"]')?.click();
  }
  const rowObserver = new MutationObserver(syncCreateRow);
  rowObserver.observe(panel,{attributes:true,attributeFilter:['data-ai-create-ui']});
  signal?.addEventListener('abort',() => rowObserver.disconnect(),{once:true});
  queueMicrotask(syncCreateRow);
  const labelButton = panel.querySelector('[data-ai-label-edit]');
  let enabled = false;
  function mode(value) {
    panel.dataset.aiResultMode = value;
    tools.hidden = editActions.hidden = value !== 'manual';
    for (const button of modes.children) button.setAttribute('aria-pressed',String(button.dataset.resultMode === value));
  }
  modes.addEventListener('click',event => {
    const value = event.target.closest('[data-result-mode]')?.dataset.resultMode;
    if (!value || value === panel.dataset.aiResultMode) return;
    // 11-25 밤샘 검수: 저장하지 않은 수정본을 둔 채 대화로 넘어가면 「수정 저장」「편집 취소」가 숨어 내보내기·고치기가 막혔다.
    // 직접 편집에 머물고 먼저 저장하거나 취소하게 한다.
    if (value === 'chat' && hasUnsavedEdit()) { onUnsavedEdit(); return; }
    mode(value);
    if (value === 'chat') stopEditing();
    // 11-26 레이어 원칙: 라벨이 꺼져 있으면 직접 편집으로 들어가도 라벨을 켜지 않는다(라벨 편집기는 라벨 층이 보일 때만).
    else if (labelButton.getAttribute('aria-pressed') !== 'true' && panel.dataset.aiLabelLayer !== 'off') labelButton.click();
  },{signal});
  // The result card can open label editing directly as well.
  labelButton.addEventListener('click',() => { if (enabled) mode('manual'); },{signal});
  // 11-27: 변환은 내보내기 단추를 결과 칸 아래로 옮기지 않는다 — 결과 칸만 낮아져 좌우 비교에서 오른쪽 그림이 위로 밀렸다.
  // 11-27 사용자: 변환도 생성처럼 내보내기는 수정본(결과) 칸 아래에만. 좌우 비교에서 두 그림 높이가 어긋나지 않게
  // 원본 칸 아래에는 같은 높이의 빈 자리(보이지 않음)를 둔다.
  const sourcePane = panel.querySelector('.ai-original-pane');
  const spacer = doc.createElement('div');
  spacer.className = 'ai-result-footer-spacer'; spacer.setAttribute('aria-hidden','true'); spacer.hidden = true;
  sourcePane?.append(spacer);
  // 높이는 ResizeObserver가 알려 준 값만 쓴다 — 작업을 바꿀 때마다 offsetHeight를 읽으면 배치를 강제로 다시 계산해 느려진다(11-28 성능 기준).
  let spacerHeight = '';
  const fitSpacer = entries => {
    const size = entries?.at(-1)?.borderBoxSize?.[0]?.blockSize;
    const next = `${Math.round(size ?? (footer.hidden ? 0 : footer.offsetHeight))}px`;
    if (next !== spacerHeight) spacer.style.height = spacerHeight = next;
  };
  const footerSize = typeof ResizeObserver === 'function' ? new ResizeObserver(fitSpacer) : null;
  footerSize?.observe(footer);
  signal?.addEventListener('abort',() => footerSize?.disconnect(),{once:true});
  let footerPlaced = false;
  function placeFooter() {
    const want = enabled;
    if (footer.hidden === want) footer.hidden = !want;
    const hideSpacer = !want || panel.dataset.aiCreateUi === 'true';
    if (spacer.hidden !== hideSpacer) spacer.hidden = hideSpacer;
    if (want === footerPlaced) return;
    footerPlaced = want;
    for (const {control,home,destination,first} of placements) {
      if (destination !== footer) continue;
      if (want) { if (first) destination.prepend(control); else destination.append(control); }
      else home.after(control);
    }
    if (!footerSize) fitSpacer();
  }
  const footerObserver = new MutationObserver(placeFooter);
  footerObserver.observe(panel,{attributes:true,attributeFilter:['data-ai-create-ui']});
  signal?.addEventListener('abort',() => footerObserver.disconnect(),{once:true});
  // show: 결과가 없어도 「AI와 대화 / 직접 편집」은 자리에 두고(11-27 사용자: 없다가 생기지 않게), 직접 편집만 흐리게 한다.
  return function sync(active, locked, show = active) {
    // 같은 값은 다시 쓰지 않는다 — 속성을 쓸 때마다 패널을 지켜보는 다른 동기화(설정 단추 등)가 한 번씩 더 돈다(11-28 성능 기준).
    const set = (node, key, value) => { if (node[key] !== value) node[key] = value; };
    set(modes,'hidden',!(show || active));
    const manualButton = modes.querySelector('[data-result-mode="manual"]');
    set(manualButton,'disabled',locked || !active);
    set(manualButton,'title',active ? '' : '결과가 생기면 직접 고칠 수 있습니다.');
    if (!active && (show || active)) for (const button of modes.children) {
      const pressed = String(button.dataset.resultMode === 'chat');
      if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed',pressed);
    }
    if (active === enabled) { placeFooter(); return; }
    enabled = active;
    for (const {control,home,destination,first} of placements) {
      if (destination === footer) continue;
      if (active) { if (first) destination.prepend(control); else destination.append(control); }
      else home.after(control);
    }
    placeFooter();
    syncCreateRow();
    const wasManual = panel.dataset.aiResultMode === 'manual';
    mode(active && (panel.dataset.aiLabelEditing === 'true' || panel.dataset.aiLocalEraseActive === 'true') ? 'manual' : 'chat');
    if (!active) {
      delete panel.dataset.aiResultMode;
      if (wasManual) stopEditing();
    }
  };
}
