import { registerEscapeLayer } from "./escape-layers.js?v=1";

export function showProjectCloseDialog({ aiHasWork = false } = {}) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay project-close-overlay";
    overlay.style.cssText = "z-index:100100;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)";
    overlay.innerHTML = `
      <section class="modal" role="alertdialog" aria-modal="true"
        aria-labelledby="project-close-title" aria-describedby="project-close-description"
        style="width:min(440px,calc(100vw - 32px));box-sizing:border-box">
        <h2 class="modal-title" id="project-close-title">작업을 저장하고 종료할까요?</h2>
        <p class="objectify-description" id="project-close-description" style="margin:0 0 16px;white-space:pre-line"></p>
        <div class="modal-actions" style="flex-wrap:wrap">
          <button type="button" class="modal-btn" data-choice="2">취소</button>
          <button type="button" class="modal-btn" data-choice="1">저장하지 않고 종료</button>
          <button type="button" class="modal-btn modal-btn-primary" data-choice="0">저장 후 종료</button>
        </div>
      </section>`;
    overlay.querySelector("p").textContent = "저장하지 않은 캔버스 작업이 있습니다.\n" + (aiHasWork
      ? "AI 작업은 이 기기의 별도 복구 저장소에 보관했습니다. 프로젝트 파일에는 포함되지 않습니다."
      : "프로젝트 파일을 저장하면 다음에 이어서 편집할 수 있습니다.");
    let settled = false;
    const done = (choice) => {
      if (settled) return;
      settled = true;
      unregister();
      overlay.remove();
      if (opener?.isConnected) opener.focus();
      resolve(choice);
    };
    const unregister = registerEscapeLayer(overlay.querySelector("section"), () => done(2));
    const buttons = [...overlay.querySelectorAll("button")];
    buttons.forEach((button) => button.addEventListener("click", () => done(Number(button.dataset.choice))));
    overlay.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        done(2);
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
    });
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) done(2); });
    document.body.appendChild(overlay);
    buttons.at(-1).focus();
  });
}
