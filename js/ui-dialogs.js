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

function buildDialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const btnHtml = buttons.map((b, i) =>
      `<button type="button" class="modal-btn${b.primary ? " modal-btn-primary" : ""}" data-i="${i}">${b.label}</button>`
    ).join("");
    overlay.innerHTML = `
      <div class="modal" role="${buttons.length > 1 ? "alertdialog" : "dialog"}" aria-modal="true"
           style="width:min(320px, calc(100vw - 32px))">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <p class="objectify-description" style="margin:0 0 4px;white-space:pre-line;">${escapeHtml(message)}</p>
        <div class="modal-actions">${btnHtml}</div>
      </div>`;
    document.body.appendChild(overlay);
    const done = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelectorAll(".modal-btn").forEach((b) => {
      b.addEventListener("click", () => done(buttons[Number(b.dataset.i)].value));
    });
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) done(buttons[0].value); });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); done(buttons[0].value); }
      if (e.key === "Enter") { e.preventDefault(); done(buttons[buttons.length - 1].value); }
    });
    // 마지막(주) 버튼에 포커스
    overlay.querySelector(".modal-btn:last-child")?.focus();
  });
}

export function showAlert(message, { title = "안내" } = {}) {
  return buildDialog({ title, message, buttons: [{ label: "확인", value: undefined, primary: true }] });
}

export function showConfirm(message, { title = "확인", okText = "예", cancelText = "아니오" } = {}) {
  return buildDialog({
    title, message,
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
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="width:min(340px, calc(100vw - 32px))">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <div class="modal-field">
          ${message ? `<label class="modal-label">${escapeHtml(message)}</label>` : ""}
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
