import { PackValidationError } from "./pack-store.js";

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

export function mountPackManagement({ host, store, onChange = () => {}, onUpdateCandidate = null }) {
  let candidate = null;
  const controller = createPackManagement({ store, onChange: (snapshot) => { render(snapshot); onChange(snapshot); } });
  host.innerHTML = `
    <div class="pdflib-pack-toolbar">
      <button type="button" class="modal-btn" data-pack-install>자료팩 폴더 설치</button>
      <input type="file" data-pack-files webkitdirectory multiple hidden>
      <span data-pack-status></span>
    </div>
    <div data-pack-candidate></div>
    <div data-pack-list></div>
    <p class="pdflib-pack-safety">자료팩을 삭제해도 프로젝트와 사용자 폴더의 파일은 삭제되지 않습니다.</p>`;
  const input = host.querySelector("[data-pack-files]");
  const status = host.querySelector("[data-pack-status]");
  const list = host.querySelector("[data-pack-list]");
  const candidateHost = host.querySelector("[data-pack-candidate]");
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
  void controller.refresh();
  return Object.freeze({
    ...controller,
    setCandidate(value) { candidate = value; render(controller.getSnapshot()); },
  });
}
