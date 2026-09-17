import {normalizeReferenceComposition} from "./ai-source-tasking.js?v=1.6.0-preview-labeler-0917-1111";
import {planReferenceLayout} from "./ai-reference-composite.js?v=1.6.0-preview-labeler-0917-1111";

function imageFor(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({sourceId: source.id, width: image.naturalWidth, height: image.naturalHeight, image, name: source.name});
    image.onerror = () => reject(new Error("배치할 이미지를 불러오지 못했습니다."));
    image.src = source.dataUrl || source.data || source.aiTransport?.transportDataUrl || "";
  });
}

export async function openAiCompositionEditor({sources = [], composition = {}} = {}) {
  const normalized = normalizeReferenceComposition(composition, sources);
  const decoded = await Promise.all(normalized.sourceOrder.map(id => imageFor(sources.find(source => source.id === id))));
  if (!decoded.length) return null;
  const initial = planReferenceLayout(decoded, normalized.orientation, normalized.layout);
  let layout = {width: initial.width, height: initial.height, placements: initial.rects.map(rect => ({...rect}))};
  const dialog = document.createElement("dialog");
  dialog.className = "ai-composition-editor";
  dialog.setAttribute("aria-labelledby", "ai-composition-title");
  dialog.innerHTML = `<header><h2 id="ai-composition-title">원본 자유 배치</h2><button type="button" data-close aria-label="닫기">×</button></header><p>이미지를 끌어 위치를 바꾸고 오른쪽 아래 손잡이로 크기를 조절하세요. 방향키로 이동, Shift + 방향키로 크기를 조절할 수 있습니다.</p><div class="ai-composition-tools"><label>캔버스 비율 <select aria-label="캔버스 비율"><option value="original">현재 비율</option value="1">1 : 1</option><option value="1.41421356">가로 A4</option><option value="0.70710678">세로 A4</option><option value="1.77777778">16 : 9</option></select></label><button type="button" data-reset>자동 배치</button></div><div class="ai-composition-stage"><div class="ai-composition-canvas"></div></div><footer><button type="button" data-cancel>취소</button><button type="button" data-save class="primary">배치 적용</button></footer>`;
  const canvas = dialog.querySelector(".ai-composition-canvas");
  const clamp = rect => {
    const source = decoded.find(item => item.sourceId === rect.sourceId);
    rect.width = Math.max(Math.min(20, layout.width), Math.min(rect.width, layout.width, layout.height * source.width / source.height));
    rect.height = rect.width * source.height / source.width;
    rect.x = Math.max(0, Math.min(layout.width - rect.width, rect.x));
    rect.y = Math.max(0, Math.min(layout.height - rect.height, rect.y));
  };
  const render = () => {
    const stage = dialog.querySelector(".ai-composition-stage");
    const availableWidth = Math.max(1, stage.clientWidth - 24);
    const availableHeight = Math.max(1, stage.clientHeight - 24);
    const factor = Math.min(availableWidth / layout.width, availableHeight / layout.height);
    canvas.style.width = `${layout.width * factor}px`;
    canvas.style.height = `${layout.height * factor}px`;
    for (const [index, rect] of layout.placements.entries()) {
      const item = canvas.children[index];
      item.style.left = `${rect.x / layout.width * 100}%`;
      item.style.top = `${rect.y / layout.height * 100}%`;
      item.style.width = `${rect.width / layout.width * 100}%`;
      item.style.height = `${rect.height / layout.height * 100}%`;
    }
  };
  decoded.forEach((source, index) => {
    const item = document.createElement("div");
    item.className = "ai-composition-item";
    item.tabIndex = 0;
    item.setAttribute("role", "group");
    item.setAttribute("aria-label", `${source.name || `원본 ${index + 1}`} 배치`);
    source.image.alt = source.name || `원본 ${index + 1}`;
    source.image.draggable = false;
    const handle = document.createElement("span");
    handle.className = "ai-composition-resize";
    handle.setAttribute("aria-hidden", "true");
    item.append(source.image, handle);
    item.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      event.preventDefault();
      item.focus();
      item.setPointerCapture(event.pointerId);
      const rect = layout.placements[index];
      const start = {...rect};
      const startX = event.clientX;
      const startY = event.clientY;
      const scale = layout.width / canvas.getBoundingClientRect().width;
      const resize = event.target === handle;
      const move = point => {
        if (resize) rect.width = start.width + (point.clientX - startX) * scale;
        else { rect.x = start.x + (point.clientX - startX) * scale; rect.y = start.y + (point.clientY - startY) * scale; }
        clamp(rect);
        render();
      };
      const end = () => {
        item.removeEventListener("pointermove", move);
        item.removeEventListener("pointerup", end);
        item.removeEventListener("pointercancel", end);
      };
      item.addEventListener("pointermove", move);
      item.addEventListener("pointerup", end);
      item.addEventListener("pointercancel", end);
    });
    item.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const rect = layout.placements[index];
      const delta = layout.width / 100;
      if (event.shiftKey) rect.width += ["ArrowRight", "ArrowDown"].includes(event.key) ? delta : -delta;
      else { rect.x += event.key === "ArrowRight" ? delta : event.key === "ArrowLeft" ? -delta : 0; rect.y += event.key === "ArrowDown" ? delta : event.key === "ArrowUp" ? -delta : 0; }
      clamp(rect);
      render();
    });
    canvas.append(item);
  });
  dialog.querySelector("select").addEventListener("change", event => {
    const ratio = event.target.value === "original" ? initial.width / initial.height : Number(event.target.value);
    layout.height = Math.round(layout.width / ratio);
    layout.placements.forEach(clamp);
    render();
  });
  dialog.querySelector("[data-reset]").addEventListener("click", () => {
    const automatic = planReferenceLayout(decoded, "auto");
    layout = {width: automatic.width, height: automatic.height, placements: automatic.rects};
    dialog.querySelector("select").value = "original";
    render();
  });
  document.body.append(dialog);
  const previousFocus = document.activeElement;
  dialog.showModal();
  render();
  const observer = new ResizeObserver(render);
  observer.observe(dialog.querySelector(".ai-composition-stage"));
  return new Promise(resolve => {
    const finish = result => { observer.disconnect(); dialog.close(); dialog.remove(); previousFocus?.focus(); resolve(result); };
    dialog.querySelectorAll("[data-close], [data-cancel]").forEach(button => button.addEventListener("click", () => finish(null)));
    dialog.addEventListener("cancel", event => {event.preventDefault(); finish(null);});
    dialog.querySelector("[data-save]").addEventListener("click", () => finish(normalizeReferenceComposition({...normalized, orientation: "free", layout}, sources)));
  });
}
