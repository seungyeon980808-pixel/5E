import { markSpaceAction, loadSpaceActionStyle } from './space-action.js?v=1.7.0-four-session-integration';
import { createAssignmentMotion } from './assignment-motion.js?v=1.7.0-four-session-integration';

export function assignmentForPlacement(referenceCount, placement) {
  const count = Math.max(0, Number.isInteger(referenceCount) ? referenceCount : 0);
  if (placement === "together") return count ? [Array.from({ length: count }, (_, index) => index)] : [];
  if (placement === "separate") return Array.from({ length: count }, (_, index) => [index]);
  return [];
}

export function assignReference(groups, groupIndex, referenceIndex) {
  return groups.map((group, index) => index === groupIndex && !group.includes(referenceIndex)
    ? [...group, referenceIndex]
    : [...group]);
}

export function removeReferenceAssignment(groups, groupIndex, referenceIndex) {
  return groups.map((group, index) => index === groupIndex
    ? group.filter((value) => value !== referenceIndex)
    : [...group]);
}

export function assignmentHasUnassignedReferences(groups, referenceCount) {
  const assigned = new Set(groups.flat());
  return Array.from({ length: referenceCount }, (_, index) => index).some((index) => !assigned.has(index));
}

function waitForStylesheet(link) {
  if (link.sheet || link.dataset.loadSettled === "true") return Promise.resolve();
  return new Promise((resolve) => {
    const settle = () => {
      link.dataset.loadSettled = "true";
      resolve();
    };
    link.addEventListener("load", settle, { once: true });
    link.addEventListener("error", settle, { once: true });
  });
}

function ensureStylesheet() {
  const existing = document.querySelector('link[data-workbench-assignment-style]');
  if (existing) return waitForStylesheet(existing);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../css/library-workbench-assignment.css?v=1.7.0-four-session-integration", import.meta.url).href;
  link.dataset.workbenchAssignmentStyle = "";
  document.head.append(link);
  return waitForStylesheet(link);
}

function focusable(container) {
  return [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest("[hidden], [inert]") && element.getAttribute("aria-hidden") !== "true");
}

function trapTab(event, container) {
  if (event.key !== "Tab") return;
  const controls = focusable(container);
  if (!controls.length) return;
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// Drafts contain only classification indices and hashes, never image bodies.
// Keep the current batch per owner so closing/reopening cannot mix libraries.
const assignmentDrafts = new WeakMap();
async function draftKey(items, allowConversionChoice) {
  const hashes = await Promise.all(items.map(async item => {
    const bytes = new TextEncoder().encode(JSON.stringify([item?.name, item?.source,
      item?.dataUrl || item?.data || item?.src || '']));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
  }));
  return `${allowConversionChoice}:${hashes.join(':')}`;
}

export async function chooseWorkbenchAssignment({ references, host, returnFocus, allowConversionChoice = true } = {}) {
  const items = Array.isArray(references) ? references : [];
  if (!items.length) return null;
  const mount = host instanceof Element ? host : document.body;
  const [key] = await Promise.all([draftKey(items, allowConversionChoice), ensureStylesheet()]);
  loadSpaceActionStyle();
  return new Promise(resolve => {
    const focusReturn = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'workbench-assignment-overlay';
    overlay.innerHTML = `<section class="workbench-assignment" role="dialog" aria-modal="true" aria-labelledby="workbench-assignment-title">
      <header><h2 id="workbench-assignment-title">공용 작업대 · 이미지 분류</h2><button type="button" class="workbench-assignment-icon" data-action="cancel" aria-label="닫기">×</button></header>

      <div class="workbench-assignment-advanced" data-classification>
        <section class="workbench-assignment-reference-panel" data-drop-target="pending" tabindex="0" role="group" aria-label="예비 작업대로 이동">
          <h3>예비 작업대 <button type="button" class="workbench-assignment-help" aria-label="예비 작업대 도움말" title="이미지 안의 버튼으로 분류하거나 원하는 영역으로 끌어놓으세요. 이곳으로 되돌리면 분류를 바꿀 수 있습니다.">?</button><span data-pending-count></span></h3><div class="workbench-assignment-references" data-references></div>
        </section>
        <section class="workbench-assignment-bench-panel" data-image-destination>
          <h3>AI 이미지 변환 <button type="button" class="workbench-assignment-help" aria-label="AI 이미지 변환 도움말" title="이미지를 놓으면 새 작업대가 생깁니다. 함께 쓸 이미지는 같은 작업대 안에 놓으세요.">?</button><span data-image-count></span></h3><div class="workbench-assignment-benches" data-benches></div>
          <div class="workbench-assignment-drop" data-drop-target="image" tabindex="0" role="button" aria-label="선택 이미지를 새 작업대에 넣기">여기에 놓으면 새 작업대</div>
        </section>
        <section class="workbench-assignment-bench-panel" data-graph-destination ${allowConversionChoice ? '' : 'hidden'} data-drop-target="graph" tabindex="0" role="group" aria-label="선택 이미지를 그래프 작업대에 넣기">
          <h3>AI 그래프 복원 <button type="button" class="workbench-assignment-help" aria-label="AI 그래프 복원 도움말" title="그래프는 작업대 구분 없이 한 목록으로 보냅니다. 각 이미지를 따로 복원합니다.">?</button><span data-graph-count></span></h3><div class="workbench-assignment-graph-list" data-graphs></div>
        </section>
      </div>
      <p class="workbench-assignment-error" data-error role="status" aria-live="polite"></p>
      <footer><span data-summary aria-live="polite"></span><button type="button" data-action="cancel">취소</button><button type="button" class="workbench-assignment-primary" data-action="continue">분류대로 보내기 <kbd>Space</kbd></button></footer>
    </section>`;
    const dialog = overlay.querySelector('.workbench-assignment');
    const motion = createAssignmentMotion(overlay);
    dialog.dataset.imageOnly = String(!allowConversionChoice);
    const query = selector => overlay.querySelector(selector);
    const saved = assignmentDrafts.get(mount);
    const kinds = saved?.key === key ? [...saved.kinds] : items.map(() => null);
    let groups = saved?.key === key ? saved.groups.map(group => [...group]) : [];
    let selected = new Set(), dragged = null, settled = false;
    const remember = () => assignmentDrafts.set(mount, { key, kinds: [...kinds], groups: groups.map(group => [...group]) });
    const showError = message => { query('[data-error]').textContent = message; };
    const finish = value => {
      if (settled) return;
      settled = true;
      remember();
      motion.clear();
      window.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      if (focusReturn?.isConnected && !focusReturn.matches(':disabled') && !focusReturn.closest('[hidden], [inert]')) focusReturn.focus({preventScroll:true});
      resolve(value);
    };
    const clearDrop = () => {
      for (const node of overlay.querySelectorAll('[data-drop-active]')) node.removeAttribute('data-drop-active');
    };
    const move = (indices, destination, benchIndex = null) => {
      if (!indices.length || indices.some(index => !Number.isInteger(index) || index < 0 || index >= items.length)) return;
      const moving = new Set(indices);
      const target = benchIndex === null ? [] : groups[benchIndex]?.filter(index => !moving.has(index));
      if (!target || (destination === 'graph' && !allowConversionChoice)) return;
      if (destination === 'image' && benchIndex !== null && target.length + moving.size > 10) {
        showError('한 작업대에는 최대 10개까지 넣을 수 있습니다. 새 작업대에 놓으세요.'); return;
      }
      const animate = motion.capture(indices, destination);
      groups = groups.map(group => group.filter(index => !moving.has(index)));
      for (const index of moving) kinds[index] = destination === 'pending' ? null : destination;
      if (destination === 'image') {
        if (benchIndex !== null) groups[benchIndex] = [...target, ...moving];
        else groups.push(...[...moving].map(index => [index]));
      }
      groups = groups.filter(group => group.length);
      selected.clear(); showError(''); remember(); render(); animate();
    };
    const dropMove = (target, indices) => move(indices, target.dataset.dropTarget,
      target.dataset.bench === undefined ? null : Number(target.dataset.bench));
    const card = index => {
      const node = document.createElement('div');
      node.className = 'workbench-assignment-reference'; node.dataset.reference = index;
      if (!kinds[index]) node.dataset.defaultKind = 'image';
      node.dataset.selected = String(selected.has(index)); node.draggable = true;
      const pick = document.createElement('button'); pick.type = 'button'; pick.dataset.selectReference = index;
      pick.className = 'workbench-assignment-reference-content'; pick.setAttribute('aria-pressed', String(selected.has(index)));
      pick.setAttribute('aria-label', `이미지 ${index + 1} 선택`);
      pick.title = `${items[index]?.name || `이미지 ${index + 1}`} · 선택 후 이동할 영역에서 Enter`;
      if (!kinds[index]) {
        pick.title += ' · Space로 이미지 작업대에 배치';
        pick.setAttribute('aria-description', 'Space를 누르면 이미지 작업대에 배치합니다. 변환은 실행하지 않습니다.');
      }
      const image = document.createElement('img'); image.src = String(items[index]?.dataUrl || items[index]?.data || items[index]?.src || ''); image.alt = ''; image.draggable = false;
      const label = document.createElement('span'); label.textContent = `이미지 ${index + 1}`;
      pick.append(image, label); node.append(pick);
      if (!kinds[index]) {
        const actions = document.createElement('div'); actions.className = 'workbench-assignment-card-actions';
        for (const [kind, text] of [['image', '이미지'], ['graph', '그래프']]) {
          if (kind === 'graph' && !allowConversionChoice) continue;
          const button = document.createElement('button'); button.type = 'button'; button.dataset.conversionKind = kind; button.dataset.classifyReference = index;
          button.textContent = text; button.setAttribute('aria-label', `이미지 ${index + 1} ${text}로 분류`); actions.append(button);
        }
        node.append(actions);
      } else {
        const back = document.createElement('button'); back.type = 'button'; back.dataset.unassign = index; back.className = 'workbench-assignment-return';
        back.textContent = '되돌리기'; back.setAttribute('aria-label', `이미지 ${index + 1} 예비 작업대로 되돌리기`); node.append(back);
      }
      return node;
    };
    const empty = (host, text) => {
      const message = document.createElement('p'); message.className = 'workbench-assignment-empty'; message.textContent = text; host.append(message);
    };
    const render = () => {
      const focused = document.activeElement;
      const focusIndex = focused?.closest('[data-reference]')?.dataset.reference;
      const pending = query('[data-references]'); pending.replaceChildren();
      items.forEach((_, index) => { if (!kinds[index]) pending.append(card(index)); });
      if (!pending.children.length) empty(pending, '분류 완료');
      const benches = query('[data-benches]'); benches.replaceChildren();
      groups.forEach((indices, index) => {
        const bench = document.createElement('section'); bench.className = 'workbench-assignment-bench';
        bench.dataset.dropTarget = 'image'; bench.dataset.bench = index; bench.tabIndex = 0; bench.setAttribute('role', 'group');
        bench.setAttribute('aria-label', `선택 이미지를 작업대 ${index + 1}에 함께 넣기`);
        const title = document.createElement('h4'); title.textContent = `작업대 ${index + 1}`;
        const count = document.createElement('span'); count.textContent = `${indices.length}개`; title.append(count);
        const pictures = document.createElement('div'); pictures.className = 'workbench-assignment-bench-references';
        for (const reference of indices) pictures.append(card(reference));
        bench.append(title, pictures); benches.append(bench);
      });
      const graphs = query('[data-graphs]'); graphs.replaceChildren();
      const graphIndices = kinds.flatMap((kind, index) => kind === 'graph' ? [index] : []);
      for (const index of graphIndices) graphs.append(card(index));
      if (!graphIndices.length) empty(graphs, '그래프를 여기에 놓으세요.');
      const unclassified = kinds.filter(kind => !kind).length;
      query('[data-pending-count]').textContent = `${unclassified}개`;
      query('[data-image-count]').textContent = `${kinds.filter(kind => kind === 'image').length}개`;
      query('[data-graph-count]').textContent = `${graphIndices.length}개`;
      query('[data-summary]').textContent = unclassified ? `예비 ${unclassified}개 · Space로 이미지 작업대에 배치합니다.`
        : `이미지 ${groups.length}작업대 · 그래프 ${graphIndices.length}개`;
      query('[data-action="continue"]').innerHTML = `${unclassified ? '작업대로 배치' : '작업대 열기'} <kbd>Space</kbd>`;
      query('[data-action="continue"]').disabled = false;
      markSpaceAction(dialog, query('[data-action="continue"]'));
      if (focusIndex !== undefined) query(`[data-select-reference="${focusIndex}"]`)?.focus({preventScroll:true});
    };
    overlay.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.disabled) return;
      if (button?.dataset.action === 'cancel') { finish(null); return; }
      if (button?.dataset.classifyReference !== undefined) { move([Number(button.dataset.classifyReference)], button.dataset.conversionKind); return; }
      if (button?.dataset.unassign !== undefined) { move([Number(button.dataset.unassign)], 'pending'); return; }
      if (button?.dataset.selectReference !== undefined) {
        const index = Number(button.dataset.selectReference); selected.has(index) ? selected.delete(index) : selected.add(index);
        render(); return;
      }
      if (button?.dataset.action === 'continue') {
        // First classify the pending cards in this dialog. Opening the image
        // workbench is a separate gesture, never an implicit generation request.
        const pending = kinds.flatMap((kind, index) => !kind ? [index] : []);
        if (pending.length) { move(pending, 'image'); return; }
        const imageGroups = groups;
        const graphGroups = kinds.flatMap((kind, index) => kind === 'graph' ? [[index]] : []);
        const resultGroups = [...imageGroups, ...graphGroups];
        if (assignmentHasUnassignedReferences(resultGroups, items.length)) return;
        finish({ conversionKind: graphGroups.length === items.length ? 'graph' : 'image',
          placement: imageGroups.some(group => group.length > 1) || imageGroups.length && graphGroups.length ? 'advanced' : 'separate',
          groups: resultGroups.map(group => [...group]), groupKinds: [...imageGroups.map(() => 'image'), ...graphGroups.map(() => 'graph')] });
        return;
      }
      // A click/Enter on a destination also provides a keyboard/touch alternative to dragging.
      const target = event.target.closest('[data-drop-target]');
      if (target && !event.target.closest('[data-reference]') && selected.size) dropMove(target, [...selected]);
    });
    overlay.addEventListener('dragstart', event => {
      const reference = event.target.closest('[data-reference]');
      if (!reference || event.target.closest('[data-conversion-kind], [data-unassign]')) { event.preventDefault(); return; }
      const index = Number(reference.dataset.reference);
      dragged = selected.has(index) ? [...selected] : [index];
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `5e-reference:${index}`);
      overlay.dataset.dragging = 'true';
    });
    overlay.addEventListener('dragover', event => {
      const target = event.target.closest('[data-drop-target]');
      if (!dragged || !target) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearDrop();
      target.dataset.dropActive = target.dataset.bench === undefined ? target.dataset.dropTarget : 'merge';
    });
    overlay.addEventListener('dragleave', event => {
      const target = event.target.closest('[data-drop-active]');
      if (target && !target.contains(event.relatedTarget)) target.removeAttribute('data-drop-active');
    });
    overlay.addEventListener('drop', event => {
      const target = event.target.closest('[data-drop-target]');
      if (!dragged || !target) return;
      event.preventDefault(); const indices = dragged; dragged = null; clearDrop(); delete overlay.dataset.dragging;
      dropMove(target, indices);
    });
    overlay.addEventListener('dragend', () => { dragged = null; clearDrop(); delete overlay.dataset.dragging; });
    function onKeydown(event) {
      if (!overlay.isConnected || event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(null); return; }
      if (event.key === 'Enter' && event.target.matches?.('[data-drop-target]')) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (selected.size) dropMove(event.target, [...selected]);
        return;
      }
      if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
        && !event.target.closest?.('input,textarea,select,[contenteditable="true"]')) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!event.repeat && !settled) {
          // The dialog may disappear before keyup. Keep that same physical
          // press from activating the newly focused workbench button.
          const swallow = next => {
            if (next.key !== ' ') return;
            next.preventDefault(); next.stopImmediatePropagation();
            if (next.type === 'keyup') release();
          };
          const release = () => {
            window.removeEventListener('keydown', swallow, true);
            window.removeEventListener('keyup', swallow, true);
            window.removeEventListener('blur', release);
          };
          window.addEventListener('keydown', swallow, true);
          window.addEventListener('keyup', swallow, true);
          window.addEventListener('blur', release, { once: true });
          query('[data-action="continue"]').click();
        }
        return;
      }
      trapTab(event, dialog);
    }
    mount.append(overlay); render();
    window.addEventListener('keydown', onKeydown, true);
    query('[data-action="continue"]').focus({preventScroll:true});
  });
}
