import { createBatchQueue } from "./ai-batch-queue.js";
import { createBatchStore } from "./ai-batch-store.js";

const LABELS = Object.freeze({ queued: "대기 중", running: "변환 중", completed: "완료", failed: "실패", cancelled: "취소" });
const DB_NAME = "5e-ai-batch-v1";

export function describeBatchView({ jobs, pending }) {
  const activeJobs = Array.isArray(jobs) ? jobs : [];
  const pendingSources = Array.isArray(pending) ? pending : [];
  const counts = Object.fromEntries(Object.keys(LABELS).map((key) => [key, activeJobs.filter((job) => job.state === key).length]));
  const total = activeJobs.length + pendingSources.length;
  const pendingCount = pendingSources.length;
  const queuedLabel = pendingCount ? `${counts.queued} 대기 · 시작 전 ${pendingCount}` : `${counts.queued} 대기`;
  const rows = [
    ...activeJobs.map((job) => ({
      id: job.id,
      name: job.sourceSnapshot.name,
      state: job.state,
      label: LABELS[job.state],
      detail: job.error || (job.state === "completed" ? "저장 가능" : `시도 ${job.attempt}`),
      job,
    })),
    ...pendingSources.map((source, index) => ({
      id: `pending:${index}`,
      name: source.name,
      state: "pending",
      label: "시작 전",
      detail: "대기열 시작 전",
    })),
  ];
  return Object.freeze({
    summary: `${counts.completed}/${total} 완료 · ${counts.running} 변환 중 · ${queuedLabel}`,
    heading: pendingCount ? `시작 전 미리보기 · ${pendingCount}개` : "변환 대기열",
    rows,
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("5e.preview:" + DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scopes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createIndexedDbBatchStore() {
  return createBatchStore({
    async read(key) {
      const db = await openDatabase();
      const value = await requestResult(db.transaction("scopes").objectStore("scopes").get(key));
      db.close();
      return value;
    },
    async write(key, value) {
      const db = await openDatabase();
      const transaction = db.transaction("scopes", "readwrite");
      transaction.objectStore("scopes").put(value, key);
      await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
      db.close();
    },
  });
}

const asDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
  reader.readAsDataURL(file);
});

function safeName(value) {
  return String(value || "output").replace(/\.[^.]+$/u, "").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").slice(0, 100) || "output";
}

export function mountDurableBatchUi({ panel, generation, scope = { sessionId: "local", workspaceId: "main" }, onCompleted = () => {} }) {
  const grid = panel.querySelector("[data-ai-batch-grid]");
  const summary = panel.querySelector("[data-ai-batch-summary]");
  const preview = panel.querySelector("[data-ai-batch-preview]");
  const heading = panel.querySelector("[data-ai-batch-heading]");
  const filesInput = panel.querySelector("[data-ai-batch-files]");
  const directoryInput = panel.querySelector("[data-ai-batch-directory]");
  const selected = new Set();
  let pending = [];
  let outputDirectory = "";
  let renderTail = Promise.resolve();
  const queue = createBatchQueue({
    store: createIndexedDbBatchStore(),
    maxRunning: 10,
    generation: {
      start(job, emit) {
        generation.start(job, async (event) => { await emit(event); await render(); });
      },
      interrupt: (job) => generation.interrupt?.(job),
    },
  });

  async function render() {
    renderTail = renderTail.then(async () => {
      const jobs = await queue.list(scope);
      const view = describeBatchView({ jobs, pending });
      summary.textContent = view.summary;
      heading.textContent = view.heading;
      grid.replaceChildren(...view.rows.map((row) => {
        const card = document.createElement(row.job ? "button" : "article");
        if (row.job) card.type = "button";
        card.className = "ai-batch-card";
        card.dataset.state = row.state;
        card.dataset.batchSource = row.job ? "queued" : "pending";
        card.dataset.jobId = row.id;
        if (row.job) card.setAttribute("aria-pressed", String(selected.has(row.id)));
        card.innerHTML = `<strong></strong><span></span><small></small>`;
        card.querySelector("strong").textContent = row.name;
        card.querySelector("span").textContent = row.label;
        card.querySelector("small").textContent = row.detail;
        if (row.job) card.addEventListener("click", () => { selected.has(row.id) ? selected.delete(row.id) : selected.add(row.id); void render(); });
        return card;
      }));
      panel.querySelector("[data-ai-batch-panel]").hidden = view.rows.length === 0;
    });
    return renderTail;
  }

  async function acceptFiles(files) {
    const images = [...files].filter((file) => file.type.startsWith("image/")).slice(0, 25);
    pending = await Promise.all(images.map(async (file) => ({ name: file.webkitRelativePath || file.name, dataUrl: await asDataUrl(file), originalPath: null })));
    preview.textContent = `변환 대상 ${pending.length}개 · 시작 시 최대 10개 실행`;
    await render();
  }
  filesInput.addEventListener("change", () => void acceptFiles(filesInput.files));
  directoryInput.addEventListener("change", () => void acceptFiles(directoryInput.files));
  panel.querySelector("[data-ai-batch-folder]").addEventListener("click", async () => {
    window.dispatchEvent(new CustomEvent("5e:local-folder-intent"));
    if (!window.fiveEDesktop) return;
    const chosen = await window.fiveEDesktop.pickLocalImageFolder();
    if (!chosen?.folder) return;
    const listed = await window.fiveEDesktop.listLocalImages(chosen.folder);
    pending = await Promise.all((listed.items || []).slice(0, 25).map(async (item) => ({ name: item.relativePath || item.name, dataUrl: await window.fiveEDesktop.readLocalImage(item.path), originalPath: item.path })));
    preview.textContent = `변환 대상 ${pending.length}개 · 시작 시 최대 10개 실행`;
    await render();
  });
  panel.querySelector("[data-ai-batch-cancel]").addEventListener("click", async () => {
    for (const id of selected) await queue.cancel(id);
    selected.clear();
    await render();
  });
  panel.querySelector("[data-ai-batch-retry]").addEventListener("click", async () => {
    for (const job of await queue.list(scope)) if (job.state === "failed") await queue.retryFailed(job.id);
    await render();
  });
  panel.querySelector("[data-ai-batch-output]").addEventListener("click", async () => {
    const completed = (await queue.list(scope)).filter((job) => job.state === "completed" && job.result?.generation?.dataUrl);
    if (window.fiveEDesktop?.batchOutput) {
      if (!outputDirectory) outputDirectory = (await window.fiveEDesktop.batchOutput.pickFolder()).folder || "";
      if (!outputDirectory) return;
      for (const job of completed) await window.fiveEDesktop.batchOutput.save({ outputDirectory, sourceName: job.sourceSnapshot.name, originalPath: job.sourceSnapshot.originalPath, dataUrl: job.result.generation.dataUrl, extension: ".png" });
      return;
    }
    for (const [index, job] of completed.entries()) {
      const anchor = document.createElement("a");
      anchor.href = job.result.generation.dataUrl;
      anchor.download = `${safeName(job.sourceSnapshot.name)}-converted${index ? ` (${index + 1})` : ""}.png`;
      anchor.click();
    }
  });

  return Object.freeze({
    async enqueue(sources, options) {
      const items = (pending.length ? pending : sources).slice(0, 25);
      if (!items.length) return [];
      pending = [];
      preview.textContent = "변환 대상 0개";
      const jobs = await queue.enqueue({ ...scope, sources: items, options });
      await render();
      return jobs;
    },
    async completed(job, result) { await queue.handleEvent({ jobId: job.id, attempt: job.attempt, type: "completed", result }); await render(); onCompleted(result); },
    async failed(job, error) { await queue.handleEvent({ jobId: job.id, attempt: job.attempt, type: "failed", error }); await render(); },
    async resume() { const jobs = await queue.resume(scope); await render(); return jobs; },
  });
}
