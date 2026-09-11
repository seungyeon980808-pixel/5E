import { showConfirm } from "./ui-dialogs.js?v=1.4.0";

export const DESKTOP_RELEASE_URL = "https://github.com/seungyeon980808-pixel/5E/releases/latest";
const STORAGE_KEY = "5e.desktopHandoff.v1";
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function validReleaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch (_) {
    return null;
  }
}

function loadState(storage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { dismissed: false, remindUntil: 0, installStarted: false };
    return {
      dismissed: value.dismissed === true,
      remindUntil: Number.isFinite(value.remindUntil) ? value.remindUntil : 0,
      installStarted: value.installStarted === true,
    };
  } catch (_) {
    return { dismissed: false, remindUntil: 0, installStarted: false };
  }
}

function saveState(storage, state) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

export function createDesktopHandoff({
  storage = globalThis.localStorage,
  now = () => Date.now(),
  isDesktop = () => Boolean(globalThis.fiveEDesktop),
  onPrompt,
  saveProject,
  openExternal,
  openDesktopPanel,
  openProjectChooser,
  releaseUrl = DESKTOP_RELEASE_URL,
  remindAfterMs = REMIND_AFTER_MS,
} = {}) {
  const state = loadState(storage);
  let promptVisible = false;
  let promptToken = 0;

  const active = (token) => token === promptToken && promptVisible;
  const close = (token) => {
    if (!active(token)) return false;
    promptVisible = false;
    return true;
  };
  const openDesktop = () => {
    try { openDesktopPanel?.(); } catch (_) {}
    return { kind: "desktop-opened" };
  };
  const openChooser = () => {
    try { openProjectChooser?.(); } catch (_) {}
    return { kind: "project-chooser-opened" };
  };
  const dismiss = (token = promptToken) => {
    if (!close(token)) return false;
    state.dismissed = true;
    saveState(storage, state);
    return true;
  };
  const remindLater = (token = promptToken) => {
    if (!close(token)) return false;
    state.remindUntil = Number(now()) + Math.max(0, Number(remindAfterMs) || 0);
    saveState(storage, state);
    return true;
  };
  const install = async (token = promptToken) => {
    if (!active(token)) return { kind: "stale" };
    if (isDesktop()) {
      close(token);
      openDesktop();
      openChooser();
      return { kind: "desktop-opened" };
    }
    const safeUrl = validReleaseUrl(releaseUrl);
    if (!safeUrl) return { kind: "blocked" };
    if (typeof saveProject !== "function") return { kind: "save-unavailable" };
    let saved;
    try { saved = await saveProject(); } catch (_) { return { kind: "save-failed" }; }
    if (saved !== true) return { kind: "save-cancelled" };
    let opened = true;
    try { if (typeof openExternal === "function") opened = await openExternal(safeUrl); } catch (_) { opened = false; }
    if (opened === false) return { kind: "blocked" };
    close(token);
    state.installStarted = true;
    saveState(storage, state);
    return { kind: "release-opened", url: safeUrl };
  };
  const present = (reason, force = false) => {
    if (isDesktop()) return openDesktop();
    const current = Number(now());
    if (promptVisible || (!force && (state.dismissed || state.installStarted || state.remindUntil > current))) {
      return { kind: "suppressed" };
    }
    promptVisible = true;
    const token = ++promptToken;
    const prompt = Object.freeze({
      reason,
      title: "설치형 5E 안내",
      message: "웹 편집은 계속 사용할 수 있습니다. 설치형에서는 로컬 폴더와 로컬 저장소를 편리하게 연결할 수 있습니다. 현재 프로젝트는 먼저 파일로 저장한 뒤 설치형에서 열 수 있으며, 자료팩은 설치형에서 다시 연결합니다.",
      dismiss: () => dismiss(token),
      remindLater: () => remindLater(token),
      install: () => install(token),
      openProjectChooser: () => active(token) ? openChooser() : { kind: "stale" },
    });
    try { onPrompt?.(prompt); } catch (_) { close(token); return { kind: "suppressed" }; }
    return { kind: "prompt", prompt };
  };

  return Object.freeze({
    reportAiSuccess: () => present("ai-success"),
    reportLocalFolderIntent: () => present("local-folder"),
    requestManual: () => present("manual", true),
    dismiss,
    remindLater,
    install,
    openProjectChooser: openChooser,
    status: () => ({ ...state, promptVisible }),
  });
}

export function initAiInstallGuide(options = {}) {
  const guide = createDesktopHandoff({
    ...options,
    isDesktop: options.isDesktop || (() => Boolean(window.fiveEDesktop)),
    openExternal: options.openExternal || ((url) => Boolean(window.open(url, "_blank", "noopener,noreferrer"))),
    onPrompt: options.onPrompt || ((prompt) => {
      void showConfirm(prompt.message, { title: prompt.title, okText: "프로젝트 저장 후 설치", cancelText: "나중에" })
        .then((accepted) => accepted ? prompt.install() : prompt.remindLater());
    }),
  });
  return guide;
}
