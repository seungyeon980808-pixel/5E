/* ===== 공용 다이얼로그: 프로그램 양식의 알림/확인 창 =====
 * 브라우저 기본 alert()/confirm() 대신 앱 모달과 같은 모양을 쓴다.
 *   showAlert(message, { title })            → Promise<void>
 *   showConfirm(message, { title, okText })  → Promise<boolean>
 */

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
        <h2 class="modal-title">${title}</h2>
        <p class="objectify-description" style="margin:0 0 4px;white-space:pre-line;">${message}</p>
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
