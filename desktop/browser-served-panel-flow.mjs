import { initAiPanel } from "../js/ai-panel.js";
import { state } from "../js/state.js";

function browserAdapter(captured) {
  const listeners = new Set();
  return {
    status: async () => ({ server: true, login: { loggedIn: true } }),
    models: async () => ({ data: [] }),
    account: async () => ({}),
    send: async (payload) => {
      captured.push(structuredClone(payload));
      listeners.forEach((listener) => listener(captured.length));
      return { turnId: `browser-turn-${captured.length}`, threadId: `browser-thread-${captured.length}` };
    },
    onProbeCapture: (listener) => listeners.add(listener),
    onEvent: () => {}, onLog: () => {}, onState: () => {},
  };
}

function pixelData(color) {
  const canvas = document.createElement("canvas");
  canvas.width = 1; canvas.height = 1;
  canvas.getContext("2d").fillStyle = color;
  canvas.getContext("2d").fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png");
}

function references() {
  return [
    { src: pixelData("#f00"), name: "blocked-local-name.png", sourceKind: "local-pdf-crop",
      comments: [{ number: 1, x: 1, y: 2, w: 3, h: 4, text: "blocked-local-comment" }] },
    { src: pixelData("#0f0"), name: "confirmed-crop-name.png", sourceKind: "local-pdf-crop-confirmed",
      comments: [{ number: 1, x: 5, y: 6, w: 7, h: 8, text: "confirmed-crop-comment" }] },
    { src: pixelData("#00f"), name: "automatic-picker-name.png", sourceKind: "auto",
      comments: [{ number: 1, x: 9, y: 10, w: 11, h: 12, text: "automatic-picker-comment" }] },
  ];
}

export async function runPanelTransportFlow(mode, adapterKind) {
  const original = document.getElementById("ai-image-panel");
  window.__phase0PanelTemplate ||= original.cloneNode(true);
  const panel = window.__phase0PanelTemplate.cloneNode(true);
  original.replaceWith(panel);
  const captured = [];
  if (adapterKind === "browser") window.fiveEDesktop = browserAdapter(captured);
  const controller = initAiPanel(state);
  const inputs = references();
  await controller.open({ references: inputs, prompt: "phase0 transport probe" });
  const expectedCalls = mode === "single" ? 1 : inputs.length;
  const completed = new Promise((resolve) => {
    window.fiveEDesktop.onProbeCapture((count) => { if (count >= expectedCalls) resolve(); });
  });
  panel.querySelector(mode === "single" ? "[data-ai-chat-send]" : "[data-ai-batch]").click();
  await completed;
  return { captured, markers: Object.fromEntries(inputs.map((item) => [item.name, item.src])) };
}

export async function prepareTextlessCapture() {
  const { createAiReferenceSearch } = await import("../js/ai-reference-search.js");
  document.querySelectorAll(".modal-overlay, .tut-welcome-overlay").forEach((element) => element.remove());
  const desktop = {
    pickLocalImageFolder: async () => ({ folder: "C:\\시험" }),
    listLocalImages: async () => ({
      folder: "C:\\시험", items: [],
      pdfs: [{ path: "C:\\시험\\스캔-물리-모의시험.pdf", name: "스캔-물리-모의시험.pdf",
        relativePath: "시험/스캔-물리-모의시험.pdf", size: 4096, modifiedAt: 1, kind: "pdf" }],
    }),
    readLocalPdf: async () => new Uint8Array(await (await fetch("/__phase0-textless.pdf")).arrayBuffer()),
  };
  const searchUi = createAiReferenceSearch({ desktop });
  await searchUi.open();
  document.querySelector("[data-ai-local-pick]").click();
  const folder = document.querySelector("[data-ai-local-folder] span");
  await new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!folder.textContent.replaceAll(" ", " ").includes("검색 가능한 텍스트 없음")) return;
      observer.disconnect(); clearTimeout(timer); resolve();
    });
    observer.observe(folder, { childList: true, characterData: true, subtree: true });
    const timer = setTimeout(() => { observer.disconnect(); reject(new Error("textless notice did not render")); }, 10_000);
  });
  const input = document.querySelector(".ai-reference-search-query input");
  input.value = "prism";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}
