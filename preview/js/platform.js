import { previewStorage as localStorage } from './preview-storage.js?v=1.6.0-preview-labeler-0917-1111';
/* ===== PLATFORM =====
 * Mac과 Windows는 수식키 규칙이 다르다. 이 파일이 그 차이를 한곳에 모은다.
 *
 *  - 단축키(저장·되돌리기 등):  Windows = Ctrl,  Mac = Command(⌘)
 *  - 마우스 보조동작(각도 스냅): Windows = Ctrl,  Mac = Option(⌥)
 *    → Mac에서 Ctrl+클릭은 OS가 '우클릭'으로 가로채므로 Ctrl을 쓰면 안 된다.
 *
 * 규칙을 각 파일에 흩어 두면 새 기능마다 한쪽 플랫폼이 조용히 깨지므로,
 * 판별은 반드시 아래 헬퍼를 거친다.
 */

// userAgentData가 있으면 그쪽이 정확하고(platform이 deprecated), 없으면 구형 경로로 떨어진다.
const _nativePlatform =
  (typeof navigator !== "undefined" && (navigator.userAgentData?.platform || navigator.platform)) ||
  "";
const SHORTCUT_PLATFORM_KEY = "5e.shortcutPlatform";
const SHORTCUT_PLATFORMS = new Set(["auto", "mac", "windows"]);
let shortcutPlatform = "auto";
try { shortcutPlatform = localStorage.getItem(SHORTCUT_PLATFORM_KEY) || "auto"; } catch (_) { /* ignore */ }
if (!SHORTCUT_PLATFORMS.has(shortcutPlatform)) shortcutPlatform = "auto";
let IS_MAC = shortcutPlatform === "mac" || (shortcutPlatform === "auto" && /mac/i.test(_nativePlatform));

/** 단축키용 수식키: Mac이면 ⌘, 그 외엔 Ctrl. */
function modKey(e) {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}

/** 마우스 보조동작(각도 스냅·직선 고정 등)용 수식키.
 *  양쪽을 다 받아들인다 — Windows 사용자는 익숙한 Ctrl을, Mac 사용자는 Ctrl이
 *  우클릭으로 먹히므로 Option(⌥)을 쓴다. 둘 다 허용하면 플랫폼 분기 없이 통한다. */
function snapKey(e) {
  return !!(e.altKey || e.ctrlKey);
}

/** 화면에 보여줄 수식키 이름. 안내 문구·툴팁에 쓴다. */
let MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";
let ALT_LABEL = IS_MAC ? "⌥" : "Alt";
let SNAP_LABEL = IS_MAC ? "⌥" : "Ctrl";

function getShortcutPlatform() { return shortcutPlatform; }

function setShortcutPlatform(value) {
  shortcutPlatform = SHORTCUT_PLATFORMS.has(value) ? value : "auto";
  IS_MAC = shortcutPlatform === "mac" || (shortcutPlatform === "auto" && /mac/i.test(_nativePlatform));
  MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";
  ALT_LABEL = IS_MAC ? "⌥" : "Alt";
  SNAP_LABEL = IS_MAC ? "⌥" : "Ctrl";
  try { localStorage.setItem(SHORTCUT_PLATFORM_KEY, shortcutPlatform); } catch (_) {}
  document.documentElement?.setAttribute("data-shortcut-platform", IS_MAC ? "mac" : "windows");
  if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("5e:shortcut-platform-change", { detail: { mode: shortcutPlatform, isMac: IS_MAC } }));
  }
  return shortcutPlatform;
}

function shortcutKey(e) {
  return /^Key[A-Z]$/.test(e.code || "") ? e.code.slice(3).toLowerCase() : String(e.key || "").toLowerCase();
}

function isEditingTarget(target) {
  return !!target && (/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(target.tagName) || target.isContentEditable === true);
}

function isComposingKey(e) {
  return !!e.isComposing || e.keyCode === 229;
}

function blocksCanvasShortcut(e) {
  return !!e.defaultPrevented || isComposingKey(e) || isEditingTarget(e.target) ||
    !!document.querySelector(".modal-overlay:not([hidden])");
}

/** "Ctrl+S"·"Alt+P" 같은 구조화된 단축키 문자열을 현재 플랫폼 표기로 바꾼다.
 *  Mac 관례대로 ⌘·⌥ 뒤의 '+'는 떼고 붙여 쓴다(⌘S, ⌥P). */
function keyLabel(text) {
  if (!text) return text;
  const source = String(text);
  let neutral = source
    .replace(/⌘\s*(?:\+\s*)?(?=[\p{L}\p{N}])/gu, "Ctrl+")
    .replace(/⌥\s*(?:\+\s*)?(?=[\p{L}\p{N}])/gu, "Alt+")
    .replace(/⌘(?=\s*:)/g, "Ctrl")
    .replace(/⌥(?=\s*:)/g, "Alt");
  if (source.trim() === "⌘") neutral = source.replace("⌘", "Ctrl");
  if (source.trim() === "⌥") neutral = source.replace("⌥", "Alt");
  if (!IS_MAC) return neutral;
  let localized = neutral
    .replace(/\bCtrl\s*\+\s*(?=[\p{L}\p{N}])/gu, "⌘")
    .replace(/\bAlt\s*\+\s*(?=[\p{L}\p{N}])/gu, "⌥")
    .replace(/\bCtrl(?=\s*:)/g, "⌘")
    .replace(/\bAlt(?=\s*:)/g, "⌥");
  if (neutral.trim() === "Ctrl") localized = neutral.replace("Ctrl", "⌘");
  if (neutral.trim() === "Alt") localized = neutral.replace("Alt", "⌥");
  return localized;
}

/** 문서 전체를 훑어 눈에 보이는 Ctrl/Alt/⌘/⌥ 단축키 표기를 현재 플랫폼으로 바꾼다.
 *  텍스트 노드와 툴팁용 속성만 건드리고, 코드는 손대지 않는다. */
function localizeShortcutLabels(root = document.body) {
  if (!root) return;
  const ATTRS = ["title", "aria-label", "placeholder", "data-tip"];
  root.querySelectorAll("*").forEach((el) => {
    if (el.closest?.("[data-shortcut-label-fixed]")) return;
    ATTRS.forEach((a) => {
      const v = el.getAttribute && el.getAttribute(a);
      const localized = v && /(Ctrl|⌘|Alt|⌥)/.test(v) ? keyLabel(v) : v;
      if (localized && localized !== v) el.setAttribute(a, localized);
    });
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue && /(Ctrl|⌘|Alt|⌥)/.test(n.nodeValue) && !n.parentElement?.closest?.("[data-shortcut-label-fixed]")) hits.push(n);
  }
  hits.forEach((n) => {
    const localized = keyLabel(n.nodeValue);
    if (localized !== n.nodeValue) n.nodeValue = localized;
  });
}

export { IS_MAC, modKey, snapKey, keyLabel, localizeShortcutLabels, MOD_LABEL, ALT_LABEL, SNAP_LABEL, shortcutKey, isEditingTarget, isComposingKey, blocksCanvasShortcut, getShortcutPlatform, setShortcutPlatform, SHORTCUT_PLATFORM_KEY };
