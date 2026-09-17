import { PackValidationError } from "./pack-store.js?v=1.6.0-preview-labeler-0917-1111";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_IMPORT_FILES = 512;
const MAX_IMPORT_FILE_BYTES = 256 * 1024 * 1024;
const MAX_IMPORT_TOTAL_BYTES = 768 * 1024 * 1024;

function frozenSnapshot(status, packs, error = null) {
  return Object.freeze({ status, packs: Object.freeze([...packs]), error });
}

export function createPackManagement({ store, onChange = () => {} }) {
  let snapshot = frozenSnapshot("idle", []);
  const listeners = new Set([onChange]);
  const emit = (next) => {
    snapshot = next;
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  };
  const run = async (operation) => {
    emit(frozenSnapshot("working", snapshot.packs));
    try {
      await operation();
      return emit(frozenSnapshot("ready", await store.list()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit(frozenSnapshot("error", snapshot.packs, message));
      throw error;
    }
  };
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); listener(snapshot); return () => listeners.delete(listener); },
    refresh: () => run(async () => {}),
    install: (bundle) => run(() => store.install(bundle)),
    setEnabled: (packId, enabled) => run(() => store.setEnabled(packId, enabled)),
    remove: (packId) => run(() => store.remove(packId)),
  });
}

function relativeFileMap(fileList) {
  const files = [...fileList];
  if (files.length === 0 || files.length > MAX_IMPORT_FILES + 2) throw new PackValidationError("import", "select one pack directory");
  const packFile = files.find((file) => /(^|\/)pack\.json$/u.test(file.webkitRelativePath || file.name));
  if (!packFile) throw new PackValidationError("import", "pack.json is missing");
  const packRelative = packFile.webkitRelativePath || packFile.name;
  const root = packRelative.slice(0, -"pack.json".length);
  const entries = new Map();
  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    if (!relative.startsWith(root)) continue;
    entries.set(relative.slice(root.length), file);
  }
  return entries;
}

async function parseSmallJson(file, name) {
  if (!file || file.size > MAX_MANIFEST_BYTES) throw new PackValidationError(name, `missing or exceeds ${MAX_MANIFEST_BYTES} bytes`);
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    throw new PackValidationError(name, "expected valid JSON");
  }
}

export async function bundleFromFileList(fileList) {
  const files = relativeFileMap(fileList);
  const pack = await parseSmallJson(files.get("pack.json"), "pack.json");
  const checksums = await parseSmallJson(files.get("checksums.json"), "checksums.json");
  const paths = Object.keys(checksums.files ?? {});
  if (paths.length === 0 || paths.length > MAX_IMPORT_FILES) throw new PackValidationError("checksums.json", "invalid asset count");
  let totalBytes = 0;
  const assets = [];
  for (const path of paths) {
    const file = files.get(path);
    if (!file || file.size > MAX_IMPORT_FILE_BYTES) throw new PackValidationError(path, "missing or too large");
    totalBytes += file.size;
    if (totalBytes > MAX_IMPORT_TOTAL_BYTES) throw new PackValidationError("import", "pack is too large");
    assets.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  return { pack, checksums, assets };
}

const SUBJECT_NAMES = Object.freeze({ phy1: "물리학 I", phy2: "물리학 II", che1: "화학 I", che2: "화학 II", bio1: "생명과학 I", bio2: "생명과학 II", ear1: "지구과학 I", ear2: "지구과학 II" });
const VERIFIED_PACK_BYTES = Object.freeze({ "ebsi.recent-three.science@1.0.0": 140405401 });
const formatBytes = (bytes) => Number.isFinite(bytes) && bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : "용량 정보 없음";
const packBytes = (pack) => Number(pack?.bytes) || VERIFIED_PACK_BYTES[`${pack?.id}@${pack?.version}`] || null;

export function mountPackManagement({
  host,
  driveHost = host,
  store,
  onChange = () => {},
  onUpdateCandidate = null,
  googleDrive = null,
  onProvidedStatus = () => {},
}) {
  let candidate = null;
  let driveConnection = null;
  const controller = createPackManagement({ store, onChange: (snapshot) => { render(snapshot); onChange(snapshot); } });
  let retryProvided = null;
  const driveMarkup = `
    <div class="pdflib-drive-connect" ${googleDrive?.provided ? "" : "hidden"}><strong>기본 제공 Google Drive</strong><p data-provided-drive-status role="status">제공 자료를 연결하는 중…</p><button type="button" class="modal-btn" data-provided-drive-retry hidden>다시 연결</button></div>
    <form class="pdflib-drive-connect" data-drive-form>
      <label for="pdflib-drive-url">개인 Google Drive 공개 폴더 추가</label><p>사전 검색 색인이 준비된 공개 폴더를 연결할 수 있습니다.</p>
      <div class="pdflib-drive-controls">
        <input id="pdflib-drive-url" type="url" inputmode="url" autocomplete="url" placeholder="https://drive.google.com/drive/folders/…" data-drive-url>
        <button type="submit" class="modal-btn modal-btn-primary" data-drive-connect>연결</button>
        <button type="button" class="modal-btn" data-drive-disconnect hidden>연결 해제</button>
      </div>
      <span class="pdflib-drive-status" data-drive-status role="status"></span>
    </form>`;
  const packMarkup = `
    <div class="pdflib-pack-toolbar">
      <button type="button" class="modal-btn" data-pack-install>자료팩 폴더 설치</button>
      <input type="file" data-pack-files webkitdirectory multiple hidden>
      <span data-pack-status></span>
    </div>
    <div data-pack-candidate></div>
    <div data-pack-list></div>
    <p class="pdflib-pack-safety">자료팩을 삭제해도 프로젝트와 사용자 폴더의 파일은 삭제되지 않습니다.</p>`;
  host.innerHTML = driveHost === host ? `${driveMarkup}${packMarkup}` : packMarkup;
  if (driveHost !== host) driveHost.innerHTML = driveMarkup;
  const input = host.querySelector("[data-pack-files]");
  const status = host.querySelector("[data-pack-status]");
  const list = host.querySelector("[data-pack-list]");
  const candidateHost = host.querySelector("[data-pack-candidate]");
  const providedStatus = driveHost.querySelector("[data-provided-drive-status]");
  const providedRetry = driveHost.querySelector("[data-provided-drive-retry]");
  providedRetry.addEventListener("click", () => retryProvided?.());
  const driveForm = driveHost.querySelector("[data-drive-form]");
  const driveUrl = driveHost.querySelector("[data-drive-url]");
  const driveConnect = driveHost.querySelector("[data-drive-connect]");
  const driveDisconnect = driveHost.querySelector("[data-drive-disconnect]");
  const driveStatus = driveHost.querySelector("[data-drive-status]");
  const renderDrive = (message = "", error = false) => {
    driveUrl.disabled = Boolean(driveConnection);
    driveConnect.hidden = Boolean(driveConnection);
    driveDisconnect.hidden = !driveConnection;
    driveStatus.classList.toggle("is-error", error);
    driveStatus.textContent = message || (driveConnection
      ? `${driveConnection.pack.title} · ${driveConnection.pack.documentCount}개 PDF 연결됨`
      : googleDrive?.gatewayConfigured ? "링크가 있는 모든 사용자에게 공개된 읽기 전용 폴더를 연결합니다." : "운영자용 Drive 연결 서비스 설정이 필요합니다.");
  };
  function render(snapshot) {
    if (!status || !list) return;
    status.textContent = snapshot.error || (snapshot.status === "working" ? "처리 중…" : `${snapshot.packs.length}개 설치됨`);
    if (candidate) {
      const installed = snapshot.packs.find((pack) => pack.id === candidate.id);
      const years = (candidate.academicYears || []).join("–") || "연도 정보 없음";
      const subjects = (candidate.subjects || []).map((value) => SUBJECT_NAMES[value] || value).join(" · ") || "과목 정보 없음";
      candidateHost.innerHTML = `<article class="pdflib-pack-card"><div><strong></strong><span></span><small></small></div><button type="button" class="modal-btn" data-pack-update></button></article>`;
      candidateHost.querySelector("strong").textContent = `${candidate.title} · v${candidate.version}`;
      candidateHost.querySelector("span").textContent = `${years}학년도 · ${subjects}`;
      candidateHost.querySelector("small").textContent = `${candidate.documentCount || 0}개 PDF · ${candidate.pageCount || 0}쪽 · ${formatBytes(packBytes(candidate))} · ${installed ? "설치됨" : "배포 후보 사용 중"}`;
      const update = candidateHost.querySelector("[data-pack-update]");
      update.textContent = installed ? "업데이트" : "업데이트 확인";
      update.disabled = typeof onUpdateCandidate !== "function";
      update.addEventListener("click", async () => {
        update.disabled = true;
        status.textContent = "업데이트 확인 중…";
        try { await onUpdateCandidate(); status.textContent = "최신 자료팩을 확인했습니다."; }
        catch (error) { status.textContent = `업데이트 실패 · 기존 자료팩을 계속 사용합니다. (${error instanceof Error ? error.message : error})`; }
        finally { update.disabled = false; }
      });
    } else candidateHost.replaceChildren();
    list.replaceChildren(...snapshot.packs.map((pack) => {
      const row = document.createElement("div");
      row.className = "pdflib-pack-row";
      const label = document.createElement("span");
      label.textContent = `${pack.title} · v${pack.version} · ${(pack.academicYears || []).join("–") || "연도 정보 없음"}학년도 · ${(pack.subjects || []).map((value) => SUBJECT_NAMES[value] || value).join(" · ") || "과목 정보 없음"} · ${pack.documentCount || 0}개 PDF · ${formatBytes(packBytes(pack))}`;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "modal-btn";
      toggle.textContent = pack.enabled ? "비활성화" : "활성화";
      toggle.addEventListener("click", () => controller.setEnabled(pack.id, !pack.enabled));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "modal-btn";
      remove.textContent = "삭제";
      remove.addEventListener("click", () => {
        if (globalThis.confirm?.(`‘${pack.title}’ 자료팩을 삭제할까요? 프로젝트와 사용자 폴더의 파일은 삭제되지 않습니다.`)) controller.remove(pack.id);
      });
      row.append(label, toggle, remove);
      return row;
    }));
  }
  host.querySelector("[data-pack-install]")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => { // no-excuse-ok: catch
    try { await controller.install(await bundleFromFileList(input.files)); }
    catch (error) { if (!(error instanceof Error)) throw error; }
    finally { input.value = ""; }
  });
  driveForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!googleDrive?.connect || driveConnection) return;
    if (!driveUrl.value.trim()) { renderDrive("Google Drive 폴더 링크를 입력하세요.", true); return; }
    driveConnect.disabled = true;
    renderDrive("파일 목록과 검색 색인을 읽는 중…");
    try {
      driveConnection = await googleDrive.connect(driveUrl.value);
      driveUrl.value = driveConnection.folder.folderUrl;
      renderDrive();
    } catch (error) {
      renderDrive(error instanceof Error ? error.message : String(error), true);
    } finally {
      driveConnect.disabled = false;
    }
  });
  driveDisconnect?.addEventListener("click", async () => {
    driveDisconnect.disabled = true;
    try {
      await googleDrive?.disconnect?.();
      driveConnection = null;
      renderDrive("Google Drive 폴더 연결을 해제했습니다.");
    } catch (error) {
      renderDrive(error instanceof Error ? error.message : String(error), true);
    } finally {
      driveDisconnect.disabled = false;
    }
  });
  driveUrl.value = googleDrive?.savedFolderUrl?.() || "";
  renderDrive();
  if (driveUrl.value && googleDrive?.gatewayConfigured) queueMicrotask(() => driveForm.requestSubmit());
  void controller.refresh();
  return Object.freeze({
    ...controller,
    setProvidedRetry(callback) { retryProvided = callback; },
    setProvidedStatus(message, error = false) { onProvidedStatus(message); providedStatus.textContent = message; providedStatus.classList.toggle("is-error", error); providedRetry.hidden = !error; },
    setCandidate(value) { candidate = value; render(controller.getSnapshot()); },
    setDriveConnection(value) { driveConnection = value; renderDrive(); },
  });
}
