"use strict";
// 맥 메뉴 막대(설치판). 11-14: 앱 메뉴가 없으면 ⌘Q(끝내기)·⌘H(가리기)가 먹지 않는다.
// 1.7.1: 「편집」 메뉴가 없으면 ⌘A·⌘C·⌘V·⌘X·⌘Z가 아무 데서도 편집 명령이 되지 않았다 — 키는 화면에 오지만
// 글 칸이 반응하지 않고, 5E 클립보드가 기대는 copy·cut·paste 이벤트도 생기지 않았다(실기 확인, 2단계 K 보고서).
// 화면이 keydown에서 preventDefault한 키(캔버스 ⌘Z·⇧⌘Z·⌘A 등)는 메뉴 명령이 따로 돌지 않는다(실기 확인).
// ⇧⌘V(5E 클립보드 열기)와 겹치지 않게 「스타일 없이 붙여넣기」(⌥⇧⌘V)·「삭제」는 넣지 않는다.
// PATHFIX(11-20): 「도움말 > AI 오류 기록 열기」 — 화면에서 사라진 AI 실패도 ai-turns.log에서 찾을 수 있게.
function appMenuTemplate(name, { onOpenErrorLog = null } = {}) {
  const help = typeof onOpenErrorLog === "function"
    ? [{ label: "도움말", role: "help", submenu: [{ label: "AI 오류 기록 열기", click: () => onOpenErrorLog() }] }]
    : [];
  return [
    { label: name, submenu: [
      { role: "about", label: "5E 정보" }, { type: "separator" },
      { role: "hide", label: "5E 가리기" }, { role: "hideOthers", label: "기타 가리기" }, { role: "unhide", label: "모두 보기" },
      { type: "separator" }, { role: "quit", label: "5E 끝내기" },
    ] },
    { label: "편집", submenu: [
      { role: "undo", label: "실행 취소" }, { role: "redo", label: "다시 실행" }, { type: "separator" },
      { role: "cut", label: "오려 두기" }, { role: "copy", label: "복사하기" }, { role: "paste", label: "붙여넣기" },
      { role: "selectAll", label: "모두 선택" },
    ] },
    ...help,
  ];
}
// 윈도우는 창 메뉴를 숨기고(setMenu(null)) 편집 키를 Chromium이 직접 처리하므로 메뉴를 두지 않는다.
function installAppMenu({ Menu, app, platform = process.platform, onOpenErrorLog = null }) {
  if (platform !== "darwin" || typeof Menu.buildFromTemplate !== "function") { Menu.setApplicationMenu(null); return null; }
  const menu = Menu.buildFromTemplate(appMenuTemplate(app.name, { onOpenErrorLog }));
  Menu.setApplicationMenu(menu);
  return menu;
}
module.exports = { appMenuTemplate, installAppMenu };
