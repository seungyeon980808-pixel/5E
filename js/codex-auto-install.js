// 11-22 시안(2026-11-22_설치-업데이트): Codex가 없으면 묻지 않고 바로 설치 → 로그인으로 잇는다.
// 오른쪽 위 「AI」 카드와 AI 작업대가 같은 설치를 함께 본다(두 곳에서 눌러도 설치는 한 번).
// 단계: download(Codex 받기) → install(설치하기) → done. 실패하면 { ok:false, code, message }.
const listeners = new Set();
let current = null; // { promise, step, startedAt }

export const INSTALL_STEPS = Object.freeze([
  ['download', 'Codex 받기'],
  ['install', '설치하기'],
]);

export function codexInstallState() {
  return current ? { running: true, step: current.step, startedAt: current.startedAt } : { running: false };
}

export function onCodexInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const notify = () => { const state = codexInstallState(); for (const fn of listeners) { try { fn(state); } catch {} } };

export function canAutoInstallCodex(desktop = globalThis.fiveEDesktop) {
  return Boolean(desktop && !desktop.web && typeof desktop.installCodex === 'function');
}

export function installCodex(desktop = globalThis.fiveEDesktop) {
  if (current) return current.promise;
  if (!canAutoInstallCodex(desktop)) return Promise.resolve({ ok: false, code: 'CODEX_INSTALL_UNSUPPORTED', message: '이 화면에서는 자동 설치를 할 수 없어요.' });
  const startedAt = Date.now();
  const off = desktop.onInstallStep?.(info => {
    if (!current || !info?.step) return;
    current.step = info.step; notify();
  });
  const promise = (async () => {
    let result;
    try { result = await desktop.installCodex(); }
    catch (error) { result = { ok: false, code: 'CODEX_INSTALL_FAILED', message: 'Codex를 설치하지 못했어요.', detail: String(error?.message || error) }; }
    return result || { ok: false, code: 'CODEX_INSTALL_FAILED', message: 'Codex를 설치하지 못했어요.' };
  })().finally(() => {
    try { off?.(); } catch {}
    current = null; notify();
    try { window.dispatchEvent(new CustomEvent('5e:codex-installed')); } catch {}
  });
  current = { promise, step: 'download', startedAt };
  notify();
  return promise;
}

export async function cancelCodexInstall(desktop = globalThis.fiveEDesktop) {
  try { await desktop?.cancelInstallCodex?.(); } catch {}
}

// 실패 이유 한 줄(카드 부제). 코드가 없으면 기본 문구.
export function installFailureText(result) {
  return String(result?.message || 'Codex를 설치하지 못했어요.');
}

export const elapsedText = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
