const PLACEMENTS = new Set(["separate", "together", "advanced"]);

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

function ensureStylesheet() {
  if (document.querySelector('link[data-workbench-assignment-style]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../css/library-workbench-assignment.css?v=1.6.0-preview-runtime-bundle-0918-1356", import.meta.url).href;
  link.dataset.workbenchAssignmentStyle = "";
  document.head.append(link);
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

export function chooseWorkbenchAssignment({ references, host, returnFocus } = {}) {
  const items = Array.isArray(references) ? references : [];
  if (!items.length) return Promise.resolve(null);
  ensureStylesheet();

  return new Promise((resolve) => {
    const mount = host instanceof Element ? host : document.body;
    const focusReturn = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "workbench-assignment-overlay";
    overlay.innerHTML = `<section class="workbench-assignment" role="dialog" aria-modal="true" aria-labelledby="workbench-assignment-title">
      <header><h2 id="workbench-assignment-title">AI 작업대 배정</h2><button type="button" class="workbench-assignment-icon" data-action="cancel" aria-label="닫기">×</button></header>
      <div class="workbench-assignment-modes" role="group" aria-label="배정 방법">
        <button type="button" data-placement="separate">이미지마다 따로</button><button type="button" data-placement="together">한 작업대에 함께</button><button type="button" data-placement="advanced">직접 나누기</button>
      </div>
      <div class="workbench-assignment-summary" data-summary></div>
      <div class="workbench-assignment-advanced" data-advanced hidden><section class="workbench-assignment-reference-panel"><h3>크롭 이미지 <span data-reference-count></span>개</h3><div class="workbench-assignment-references" data-references></div></section><section class="workbench-assignment-bench-panel"><div class="workbench-assignment-bench-heading"><h3>작업대</h3><button type="button" data-action="add-bench">+ 작업대 추가</button></div><div class="workbench-assignment-benches" data-benches></div></section></div>
      <p class="workbench-assignment-error" data-error role="status" aria-live="polite"></p>
      <footer><button type="button" data-action="cancel">취소</button><button type="button" class="workbench-assignment-primary" data-action="continue">AI 작업으로 보내기</button></footer>
    </section>`;
    const dialog = overlay.querySelector(".workbench-assignment");
    const advanced = overlay.querySelector("[data-advanced]");
    const summary = overlay.querySelector("[data-summary]");
    const referenceList = overlay.querySelector("[data-references]");
    const referenceCount = overlay.querySelector("[data-reference-count]");
    const benchList = overlay.querySelector("[data-benches]");
    const addBench = overlay.querySelector('[data-action="add-bench"]');
    const error = overlay.querySelector("[data-error]");
    let placement = "separate";
    let groups = [[]];
    let selectedGroup = 0;
    let confirmation = null;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmation?.finish(false);
      overlay.remove();
      if (focusReturn instanceof HTMLElement && focusReturn.isConnected) focusReturn.focus();
      resolve(value);
    };

    const confirmAction = ({ title, message, okText }) => new Promise((confirmResolve) => {
      const focusBefore = document.activeElement;
      const layer = document.createElement("div");
      layer.className = "workbench-assignment-confirm-layer";
      layer.innerHTML = `<section class="workbench-assignment-confirm" role="alertdialog" aria-modal="true" aria-labelledby="workbench-assignment-confirm-title" aria-describedby="workbench-assignment-confirm-description"><h3 id="workbench-assignment-confirm-title"></h3><p id="workbench-assignment-confirm-description"></p><div><button type="button" data-confirm="cancel">취소</button><button type="button" class="workbench-assignment-primary" data-confirm="ok"></button></div></section>`;
      const panel = layer.querySelector("section");
      panel.querySelector("h3").textContent = title;
      panel.querySelector("p").textContent = message;
      panel.querySelector('[data-confirm="ok"]').textContent = okText;
      dialog.inert = true;
      overlay.append(layer);
      let complete = false;
      const confirmFinish = (value) => {
        if (complete) return;
        complete = true;
        layer.remove();
        dialog.inert = false;
        confirmation = null;
        if (!settled && focusBefore instanceof HTMLElement && focusBefore.isConnected) focusBefore.focus();
        confirmResolve(value);
      };
      confirmation = { element: panel, finish: confirmFinish };
      layer.querySelector('[data-confirm="cancel"]').addEventListener("click", () => confirmFinish(false));
      layer.querySelector('[data-confirm="ok"]').addEventListener("click", () => confirmFinish(true));
      layer.querySelector('[data-confirm="cancel"]').focus();
    });

    const render = () => {
      for (const button of overlay.querySelectorAll("[data-placement]")) {
        const active = button.dataset.placement === placement;
        button.setAttribute("aria-pressed", String(active));
      }
      const editable = placement === "advanced";
      const displayGroups = editable ? groups : assignmentForPlacement(items.length, placement);
      advanced.hidden = false;
      advanced.classList.toggle("is-editable", editable);
      summary.hidden = true;
      summary.textContent = placement === "together"
        ? `${items.length}개 이미지를 작업대 1개에 함께 넣습니다.`
        : `${items.length}개 이미지를 각각 별도 작업대에 넣습니다.`;
      addBench.hidden = !editable;
      referenceCount.textContent = String(items.length);
      referenceList.replaceChildren();
      items.forEach((reference, referenceIndex) => {
        const assigned = displayGroups.flatMap((group, groupIndex) => group.includes(referenceIndex) ? [groupIndex] : []);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "workbench-assignment-reference";
        button.dataset.reference = String(referenceIndex);
        button.classList.toggle("is-assigned", assigned.length > 0);
        button.disabled = !editable;
        button.setAttribute("aria-pressed", String(editable && (groups[selectedGroup]?.includes(referenceIndex) ?? false)));
        const image = document.createElement("img");
        image.src = String(reference?.dataUrl || ""); image.alt = ""; image.width = 104; image.height = 84;
        const copy = document.createElement("span"); copy.className = "workbench-assignment-reference-copy";
        const label = document.createElement("strong"); label.textContent = `이미지 ${referenceIndex + 1}`;
        const benches = document.createElement("span"); benches.className = "workbench-assignment-reference-status";
        benches.textContent = assigned.length ? assigned.map((index) => `작업대 ${index + 1}`).join(" · ") : "미배정";
        copy.append(label, benches);
        button.setAttribute("aria-label", `${label.textContent}, ${benches.textContent}`);
        button.append(image, copy); referenceList.append(button);
      });
      benchList.replaceChildren();
      displayGroups.forEach((group, groupIndex) => {
        const bench = document.createElement("section");
        bench.className = "workbench-assignment-bench";
        bench.classList.toggle("is-selected", editable && groupIndex === selectedGroup);
        const heading = document.createElement("div"); heading.className = "workbench-assignment-bench-title";
        const select = document.createElement("button");
        select.type = "button"; select.className = "workbench-assignment-bench-select"; select.dataset.bench = String(groupIndex);
        select.disabled = !editable;
        select.setAttribute("aria-pressed", String(editable && groupIndex === selectedGroup));
        const title = document.createElement("strong"); title.textContent = `작업대 ${groupIndex + 1}`;
        const count = document.createElement("span"); count.textContent = `${group.length}개`;
        select.append(title, count); heading.append(select); bench.append(heading);
        const assignedReferences = document.createElement("div"); assignedReferences.className = "workbench-assignment-bench-references";
        group.forEach((referenceIndex) => {
          const reference = items[referenceIndex];
          const thumbnail = document.createElement("div"); thumbnail.className = "workbench-assignment-bench-thumbnail";
          const image = document.createElement("img");
          image.src = String(reference?.dataUrl || ""); image.alt = ""; image.width = 116; image.height = 86;
          const label = document.createElement("span"); label.textContent = `이미지 ${referenceIndex + 1}`;
          thumbnail.append(image, label);
          if (editable) {
            const remove = document.createElement("button");
            remove.type = "button"; remove.dataset.action = "remove-reference";
            remove.dataset.group = String(groupIndex); remove.dataset.reference = String(referenceIndex);
            remove.setAttribute("aria-label", `작업대 ${groupIndex + 1}에서 이미지 ${referenceIndex + 1} 제거`); remove.textContent = "×";
            thumbnail.append(remove);
          }
          assignedReferences.append(thumbnail);
        });
        bench.append(assignedReferences); benchList.append(bench);
      });
    };

    overlay.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button || confirmation) return;
      error.textContent = "";
      if (button.dataset.action === "cancel") { finish(null); return; }
      if (button.dataset.placement && PLACEMENTS.has(button.dataset.placement)) { placement = button.dataset.placement; render(); return; }
      if (button.dataset.action === "add-bench") { groups = [...groups, []]; selectedGroup = groups.length - 1; render(); return; }
      if (button.dataset.action === "remove-reference") {
        groups = removeReferenceAssignment(groups, Number(button.dataset.group), Number(button.dataset.reference));
        render(); return;
      }
      if (button.dataset.bench) { selectedGroup = Number(button.dataset.bench); render(); return; }
      if (button.dataset.reference) {
        const referenceIndex = Number(button.dataset.reference);
        if (groups[selectedGroup].includes(referenceIndex)) groups = removeReferenceAssignment(groups, selectedGroup, referenceIndex);
        else {
          const otherGroups = groups.flatMap((group, index) => index !== selectedGroup && group.includes(referenceIndex) ? [index] : []);
          if (otherGroups.length && !await confirmAction({ title: "다른 작업대에도 추가할까요?", message: `이미지 ${referenceIndex + 1}은 이미 ${otherGroups.map((index) => `작업대 ${index + 1}`).join(", ")}에 있습니다. 같은 이미지를 현재 작업대에도 추가합니다.`, okText: "추가" })) return;
          if (settled) return;
          groups = assignReference(groups, selectedGroup, referenceIndex);
        }
        render(); return;
      }
      if (button.dataset.action === "continue") {
        const resultGroups = placement === "advanced" ? groups.filter((group) => group.length) : assignmentForPlacement(items.length, placement);
        if (!resultGroups.length) { error.textContent = "이미지를 하나 이상 작업대에 배정하세요."; return; }
        if (placement === "advanced" && assignmentHasUnassignedReferences(resultGroups, items.length)) {
          const proceed = await confirmAction({ title: "미배정 이미지를 제외할까요?", message: "작업대에 넣지 않은 이미지는 이번 AI 작업에서 제외됩니다.", okText: "제외하고 계속" });
          if (!proceed || settled) return;
        }
        finish({ placement, groups: resultGroups.map((group) => [...group]) });
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        if (confirmation) confirmation.finish(false); else finish(null);
        return;
      }
      trapTab(event, confirmation?.element || dialog);
    });
    mount.append(overlay);
    render();
    overlay.querySelector('[data-placement="separate"]').focus();
  });
}
