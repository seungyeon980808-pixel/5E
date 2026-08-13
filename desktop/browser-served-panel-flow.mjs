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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("captured transport image did not decode"));
    image.src = src;
  });
}

async function countFixturePixels(attachments) {
  const totals = { red: 0, green: 0, blue: 0 };
  for (const attachment of attachments) {
    const image = await loadImage(attachment.data);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red > 200 && green < 50 && blue < 50) totals.red += 1;
      if (green > 200 && red < 50 && blue < 50) totals.green += 1;
      if (blue > 200 && red < 50 && green < 50) totals.blue += 1;
    }
  }
  return totals;
}

export async function summarizeCapturedPayloads(payloads) {
  const attachments = payloads.flatMap((payload) => payload.attachments || []);
  const pixels = await countFixturePixels(attachments);
  const prompt = payloads.map((payload) => payload.text || "").join("\n");
  const attachmentNames = attachments.map((item) => item.name);
  const flag = (name, comment, color) => ({
    nameInPrompt: prompt.includes(name),
    nameInAttachments: attachmentNames.includes(name),
    commentInPrompt: prompt.includes(comment),
    pixels: pixels[color],
  });
  return {
    calls: payloads.length,
    purposes: payloads.map((payload) => payload.purpose),
    requestPromptCount: payloads.filter((payload) => payload.text.includes("phase0-transport-request")).length,
    attachmentNames,
    blocked: flag("blocked-local-name.png", "blocked-local-comment", "red"),
    confirmed: flag("confirmed-crop-name.png", "confirmed-crop-comment", "green"),
    automatic: flag("automatic-picker-name.png", "automatic-picker-comment", "blue"),
  };
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
  await controller.open({ references: inputs, prompt: "phase0-transport-request" });
  panel.querySelector('[data-ai-output-engine="raster"]').click();
  const expectedCalls = mode === "single" ? 1 : inputs.length;
  const completed = new Promise((resolve) => {
    window.fiveEDesktop.onProbeCapture((count) => { if (count >= expectedCalls) resolve(); });
  });
  panel.querySelector(mode === "single" ? "[data-ai-send]" : "[data-ai-batch]").click();
  await completed;
  return { captured };
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
