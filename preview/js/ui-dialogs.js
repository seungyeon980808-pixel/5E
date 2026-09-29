import { registerEscapeLayer } from "./escape-layers.js?v=1.7.0-preview-0930";

/* ===== 공용 다이얼로그: 프로그램 양식의 알림/확인 창 =====
 * 브라우저 기본 alert()/confirm() 대신 앱 모달과 같은 모양을 쓴다.
 *   showAlert(message, { title })            → Promise<void>
 *   showConfirm(message, { title, okText })  → Promise<boolean>
 */

// title/message에는 페이지·오브젝트·배경 이름 등 사용자가 자유 입력한 문자열이 그대로
// 섞여 들어온다(예: pages.js의 삭제 확인 "'{이름}' 페이지를 삭제할까요?"). innerHTML에
// 이스케이프 없이 꽂으면 그 이름에 담긴 HTML/스크립트가 그대로 실행된다 — 반드시 이스케이프.
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

let dialogSequence = 0;

function dialogIdentity() {
  const id = `app-dialog-${++dialogSequence}`;
  return { titleId: `${id}-title`, descriptionId: `${id}-description` };
}

function buildDialog({ title, message, buttons, wide = false, dismissValue = buttons[0].value }) {
  return new Promise((resolve) => {
    const { titleId, descriptionId } = dialogIdentity();
    const overlay = document.createElement("div");
    overlay.className = wide ? "modal-overlay mode-switch-dialog" : "modal-overlay";
    const btnHtml = buttons.map((b, i) =>
      `<button type="button" class="modal-btn${b.primary ? " modal-btn-primary" : ""}" data-i="${i}">${escapeHtml(b.label)}</button>`
    ).join("");
    overlay.innerHTML = `
      <div class="modal" role="${buttons.length > 1 ? "alertdialog" : "dialog"}" aria-modal="true"
           aria-labelledby="${titleId}" aria-describedby="${descriptionId}"${wide ? ' tabindex="-1"' : ''}
           style="width:min(${wide ? 520 : 320}px, calc(100vw - 32px))">
        <h2 class="modal-title"><span id="${titleId}">${escapeHtml(title)}</span></h2>
        <p class="objectify-description" id="${descriptionId}" style="margin:0 0 4px;white-space:pre-line;">${escapeHtml(message)}</p>
        <div class="modal-actions">${btnHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    const previousFocus = document.activeElement;
    const done = (value) => { overlay.remove(); previousFocus?.focus(); resolve(value); };
    const dialog = overlay.querySelector('[role="dialog"], [role="alertdialog"]');
    registerEscapeLayer(dialog, () => done(dismissValue));
    overlay.querySelectorAll(".modal-btn").forEach((b) => {
      b.addEventListener("click", () => done(buttons[Number(b.dataset.i)].value));
    });
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) done(dismissValue); });
    overlay.addEventListener("keydown", (e) => {
      if (wide && e.key === 'Tab') {
        const controls = [...overlay.querySelectorAll('.modal-btn')];
        const index = controls.indexOf(document.activeElement);
        e.preventDefault();
        controls[index < 0 ? (e.shiftKey ? controls.length - 1 : 0) : (index + (e.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
      }
      if (e.key === "Escape") { e.stopPropagation(); done(dismissValue); }
      if (!wide && e.key === "Enter" && !e.target.closest("button")) { e.preventDefault(); done(buttons[buttons.length - 1].value); }
    });
    if (wide) dialog.focus({ preventScroll: true });
    else overlay.querySelector(".modal-btn:last-child")?.focus();
  });
}

export function showAlert(message, { title = "안내" } = {}) {
  return buildDialog({ title, message, buttons: [{ label: "확인", value: undefined, primary: true }] });
}

export function showConfirm(message, { title = "확인", okText = "예", cancelText = "아니오", dismissValue = false } = {}) {
  return buildDialog({
    title, message, dismissValue,
    buttons: [
      { label: cancelText, value: false },
      { label: okText, value: true, primary: true },
    ],
  });
}

/* 텍스트 입력 다이얼로그(브라우저 prompt() 대체) → Promise<string|null>.
 * 확인=입력값, 취소/Esc/바깥클릭=null. */
export function showPrompt(message, { title = "입력", value = "", placeholder = "", okText = "확인", cancelText = "취소", maxLength } = {}) {
  return new Promise((resolve) => {
    const { titleId, descriptionId } = dialogIdentity();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}"
           ${message ? `aria-describedby="${descriptionId}"` : ""} style="width:min(340px, calc(100vw - 32px))">
        <h2 class="modal-title"><span id="${titleId}">${escapeHtml(title)}</span></h2>
        <div class="modal-field">
          ${message ? `<label class="modal-label" id="${descriptionId}">${escapeHtml(message)}</label>` : ""}
          <input type="text" class="modal-input" />
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-btn" data-act="cancel">${cancelText}</button>
          <button type="button" class="modal-btn modal-btn-primary" data-act="ok">${okText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector(".modal-input");
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    if (maxLength) input.maxLength = maxLength;
    const done = (val) => { overlay.remove(); resolve(val); };
    registerEscapeLayer(overlay.querySelector('[role="dialog"]'), () => done(null));
    overlay.querySelector('[data-act="ok"]').addEventListener("click", () => done(input.value));
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", () => done(null));
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) done(null); });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(null); }
      if (e.key === "Enter") { e.preventDefault(); done(input.value); }
    });
    input.focus();
    input.select();
  });
}

export function showModeSwitch(target) {
  return buildDialog({
    title: `${target}로 전환`,
    message: '현재 작업을 이어서 사용할까요, 새 작업으로 시작할까요?\n새 작업을 선택해도 이전 도면은 복구용으로 보관됩니다. AI 작업은 작업 목록에 남습니다.',
    wide: true,
    buttons: [
      { label: '취소', value: 'cancel' },
      { label: '새 작업으로 전환', value: 'new' },
      { label: '유지하고 전환', value: 'keep', primary: true },
    ],
  });
}

function formatRecoveryTime(ts) {
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "저장 시간 미상";
  }
}

export function showRecoveryCheckpointDialog(checkpoints, { legacyStatus = "empty" } = {}) {
  const available = Array.isArray(checkpoints) ? checkpoints.filter(checkpoint => (
    Number.isInteger(checkpoint?.id)
      && (checkpoint.source === "preview" || checkpoint.source === "legacy")
  )) : [];
  if (available.length === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    const { titleId, descriptionId } = dialogIdentity();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay recovery-checkpoint-dialog";
    const choices = available.map((checkpoint, index) => `
      <label class="recovery-checkpoint-row">
        <input type="radio" name="recovery-checkpoint" data-recovery-checkpoint
          data-id="${checkpoint.id}" data-source="${checkpoint.source}"${index === 0 ? " checked" : ""}>
        <span class="recovery-checkpoint-copy">
          <strong>${escapeHtml(checkpoint.label || "이전 작업")}</strong>
          <span>${Number(checkpoint.pageCount) || 1}쪽 · ${escapeHtml(formatRecoveryTime(checkpoint.ts))}${checkpoint.source === "legacy" ? " · 이전 버전" : ""}</span>
        </span>
      </label>`).join("");
    const legacyNote = legacyStatus === "unavailable"
      ? '<p class="recovery-checkpoint-note" role="status">이전 버전의 복구 저장소는 확인할 수 없었습니다.</p>'
      : "";
    overlay.innerHTML = `
      <section class="modal recovery-checkpoint-modal" role="dialog" aria-modal="true" tabindex="-1"
        aria-labelledby="${titleId}" aria-describedby="${descriptionId}">
        <h2 class="modal-title"><span id="${titleId}">보관된 작업 복구</span></h2>
        <p class="objectify-description" id="${descriptionId}">모드 전환 전에 보관한 작업이 있습니다. 복구할 작업을 선택하세요.</p>
        <div class="recovery-checkpoint-list" role="radiogroup" aria-label="복구할 작업">${choices}</div>
        ${legacyNote}
        <div class="modal-actions">
          <button type="button" class="modal-btn" data-act="cancel">지금은 복구하지 않음</button>
          <button type="button" class="modal-btn modal-btn-primary" data-act="restore">선택한 작업 복구</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);
    const previousFocus = document.activeElement;
    const dialog = overlay.querySelector('[role="dialog"]');
    const done = (value) => {
      overlay.remove();
      previousFocus?.focus();
      resolve(value);
    };
    const cancel = () => done("deferred");
    registerEscapeLayer(dialog, cancel);
    overlay.querySelector('[data-act="cancel"]').addEventListener("click", cancel);
    overlay.querySelector('[data-act="restore"]').addEventListener("click", () => {
      const selected = overlay.querySelector('[data-recovery-checkpoint]:checked')?.dataset;
      done(selected ? { id: Number(selected.id), source: selected.source } : null);
    });
    overlay.addEventListener("mousedown", event => { if (event.target === overlay) cancel(); });
    overlay.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...overlay.querySelectorAll('input:not(:disabled), button:not(:disabled)')];
      const index = controls.indexOf(document.activeElement);
      event.preventDefault();
      controls[index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    dialog.focus({ preventScroll: true });
  });
}
