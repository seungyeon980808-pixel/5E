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
const _plat =
  (navigator.userAgentData && navigator.userAgentData.platform) ||
  navigator.platform ||
  "";
const IS_MAC = /mac/i.test(_plat);

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
const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";
const ALT_LABEL = IS_MAC ? "⌥" : "Alt";

/** "Ctrl+S" 같은 문자열을 현재 플랫폼 표기로 바꾼다. Windows에선 원문 그대로.
 *  Mac 관례대로 ⌘ 뒤의 '+'는 떼고 붙여 쓴다(⌘S). */
function keyLabel(text) {
  if (!IS_MAC || !text) return text;
  return String(text).replace(/Ctrl\s*\+\s*/g, "⌘").replace(/\bCtrl\b/g, "⌘");
}

/** 문서 전체를 훑어 눈에 보이는 "Ctrl" 표기를 현재 플랫폼 표기로 바꾼다.
 *  텍스트 노드와 title/aria-label/placeholder 속성만 건드리고, 코드는 손대지 않는다.
 *  Windows에선 아무 일도 하지 않으므로 호출 비용이 사실상 없다. */
function localizeShortcutLabels(root = document.body) {
  if (!IS_MAC || !root) return;
  const ATTRS = ["title", "aria-label", "placeholder"];
  root.querySelectorAll("*").forEach((el) => {
    ATTRS.forEach((a) => {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && v.includes("Ctrl")) el.setAttribute(a, keyLabel(v));
    });
  });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue && n.nodeValue.includes("Ctrl")) hits.push(n);
  }
  hits.forEach((n) => { n.nodeValue = keyLabel(n.nodeValue); });
}

export { IS_MAC, modKey, snapKey, keyLabel, localizeShortcutLabels, MOD_LABEL, ALT_LABEL };
