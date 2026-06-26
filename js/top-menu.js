/* ===== TOP MENU (mutually-exclusive 파일 / 설정 dropdowns) ===== */
//
// Single source of truth for which top-left dropdown is open. The 파일 and 설정
// menus register here instead of each owning independent open/close logic, so at
// most one can be open at a time (activeTopMenu). Clicking a menu's own button
// toggles it; opening one closes the other; outside-click and Escape close
// whichever is open.

const menus = new Map();      // name -> { btn, list, onOpen, onClose }
let activeTopMenu = null;     // null | "file" | "settings"

function closeMenu(name) {
  const m = menus.get(name);
  if (!m) return;
  m.list.hidden = true;
  m.btn.setAttribute("aria-expanded", "false");
  if (activeTopMenu === name) activeTopMenu = null;
  if (m.onClose) m.onClose();
}

function openMenu(name) {
  // mutual exclusivity: close any other open menu first
  if (activeTopMenu && activeTopMenu !== name) closeMenu(activeTopMenu);
  const m = menus.get(name);
  if (!m) return;
  m.list.hidden = false;
  m.btn.setAttribute("aria-expanded", "true");
  activeTopMenu = name;
  if (m.onOpen) m.onOpen();
}

export function registerTopMenu(name, btn, list, opts = {}) {
  if (!btn || !list) return;
  menus.set(name, { btn, list, onOpen: opts.onOpen, onClose: opts.onClose });

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeTopMenu === name) closeMenu(name);
    else openMenu(name);
  });

  // Any item click dismisses the menu.
  list.addEventListener("click", () => closeMenu(name));
}

// Global outside-click + Escape, registered once for all top menus.
document.addEventListener("click", (e) => {
  if (!activeTopMenu) return;
  const m = menus.get(activeTopMenu);
  if (m && !m.list.contains(e.target) && e.target !== m.btn) closeMenu(activeTopMenu);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeTopMenu) closeMenu(activeTopMenu);
});
