const { app, BrowserWindow } = require("electron");
const os = require("node:os");
const path = require("node:path");

const width = Number(process.argv[2]) || 1366;
const height = Number(process.argv[3]) || 768;
const root = path.resolve(__dirname, "..");

app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.setPath("userData", path.join(os.tmpdir(), `5e-ai-visual-qa-${process.pid}`));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.setContentSize(width, height);
  await win.loadFile(path.join(root, "index.html"));
  const result = await win.webContents.executeJavaScript(`(async () => {
    const nextPaint = () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const title of document.querySelectorAll(".modal-overlay .modal-title")) {
      if (["작업 복구", "찾아 주셔서 고맙습니다"].includes(title.textContent?.trim())) {
        title.closest(".modal-overlay")?.querySelector(".modal-btn")?.click();
      }
    }
    document.getElementById("ai-image-install-open")?.click();
    await nextPaint();

    const panel = document.getElementById("ai-image-panel");
    const modal = panel?.querySelector(".modal-ai");
    const results = panel?.querySelector(".ai-results");
    const conversation = panel?.querySelector(".ai-conversation");
    const sources = panel?.querySelector(".ai-sources");
    const input = panel?.querySelector("[data-ai-input]");
    const generating = panel?.querySelector("[data-ai-generating]");
    const status = panel?.querySelector("[data-ai-status]");
    const rect = (node) => {
      const box = node?.getBoundingClientRect();
      return box ? {
        left: Math.round(box.left), top: Math.round(box.top),
        width: Math.round(box.width), height: Math.round(box.height),
        right: Math.round(box.right), bottom: Math.round(box.bottom),
      } : null;
    };
    const fitsHorizontally = (node) => node && node.scrollWidth <= node.clientWidth + 1;
    const overflowOwner = (node) => ["auto", "scroll"].includes(getComputedStyle(node).overflowY);

    input?.focus();
    const keyboardFocus = document.activeElement === input;
    const visibleButtons = Array.from(panel?.querySelectorAll("button:not([hidden])") || [])
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return box.width > 0 && box.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });
    const unnamedButtons = visibleButtons
      .filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim() || button.title))
      .map((button) => button.outerHTML.slice(0, 120));

    generating.hidden = false;
    await nextPaint();
    const loadingVisible = rect(generating)?.height > 0 &&
      Boolean(generating.querySelector("[data-ai-progress-title]")) &&
      Boolean(panel.querySelector('[data-ai-elapsed][role="timer"]'));
    generating.hidden = true;
    status.dataset.kind = "error";
    status.textContent = "검증용 오류 상태";
    await nextPaint();
    const statusStyle = getComputedStyle(status);
    const errorVisible = rect(status)?.width > 0 &&
      statusStyle.visibility !== "hidden" && statusStyle.color !== "rgba(0, 0, 0, 0)";

    const beforeObjects = (await import("./js/state.js?v=1.4.0")).state.get().objects.length;
    const stateModule = await import("./js/state.js?v=1.4.0");
    const pasteModule = await import("./js/image-paste.js?v=1.5.0-phase4-labels");
    const insertionModule = await import("./js/ai-canvas-insertion.mjs");
    const imageData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="24"><path d="M2 12h28M24 6l6 6-6 6" fill="none" stroke="black" stroke-width="2"/></svg>'
    );
    const inserted = await insertionModule.performCanvasInsertion({
      insert: async () => {
        const id = await pasteModule.insertImageFromSrc(stateModule.state, imageData);
        return { selectedIds: [id] };
      },
      close: () => panel.querySelector("[data-ai-close]")?.click(),
    });
    const selectedAfterInsert = stateModule.state.get().selectedIds;
    const insertionSuccess = inserted.ok && panel.hidden &&
      stateModule.state.get().objects.length === beforeObjects + 1 &&
      selectedAfterInsert.length === 1;

    document.getElementById("ai-image-install-open")?.click();
    await nextPaint();
    let recoveryMessage = "";
    let failureCloseCalled = false;
    const failed = await insertionModule.performCanvasInsertion({
      insert: async () => { throw new Error("검증용 삽입 실패"); },
      onFailure: (message) => { recoveryMessage = message; },
      close: () => { failureCloseCalled = true; },
    });
    const insertionFailureRecovery = !failed.ok && !panel.hidden && !failureCloseCalled &&
      recoveryMessage.includes("창은 그대로 유지됩니다") && recoveryMessage.includes("다시 시도");

    const resultRect = rect(results);
    const conversationRect = rect(conversation);
    const sourcesRect = rect(sources);
    const modalRect = rect(modal);
    const inputRect = rect(input);
    const threePane = innerWidth > 1180;
    const orderCorrect = threePane
      ? resultRect.left < conversationRect.left && conversationRect.left < sourcesRect.left
      : resultRect.top <= conversationRect.top && conversationRect.top <= sourcesRect.top;

    return {
      viewport: { width: innerWidth, height: innerHeight },
      mode: threePane ? "three-pane" : "stacked",
      panelOpen: panel.hidden === false,
      modal: modalRect,
      panes: { results: resultRect, conversation: conversationRect, sources: sourcesRect },
      orderCorrect,
      resultDominant: threePane
        ? resultRect.width > conversationRect.width && resultRect.width > sourcesRect.width
        : resultRect.width === conversationRect.width,
      noHorizontalOverflow: [modal, results, conversation, sources].every(fitsHorizontally),
      independentScroll: threePane
        ? [results, conversation, sources].every(overflowOwner)
        : overflowOwner(modal) || overflowOwner(panel.querySelector(".ai-workspace")),
      bottomInputVisible: inputRect.bottom <= modalRect.bottom && inputRect.top >= modalRect.top,
      modalFitsViewport: modalRect.left >= 0 && modalRect.top >= 0 &&
        modalRect.right <= innerWidth && modalRect.bottom <= innerHeight,
      keyboardFocus,
      unnamedButtons,
      loadingVisible,
      errorVisible,
      insertionSuccess,
      insertionFailureRecovery,
    };
  })()`, true);
  console.log(`AI_VISUAL_QA ${JSON.stringify(result)}`);
  await win.close();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
