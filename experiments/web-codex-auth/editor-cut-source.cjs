function editorCutSource(source) {
  const replacements = [
    ['const target = _lastMouseWorld\n        ? _lastMouseWorld',
      'const target = _lastMouseWorld &&\n        _lastMouseWorld.x >= s.viewBox.x && _lastMouseWorld.x <= s.viewBox.x + s.viewBox.w &&\n        _lastMouseWorld.y >= s.viewBox.y && _lastMouseWorld.y <= s.viewBox.y + s.viewBox.h\n        ? _lastMouseWorld'],
    ['/* -- Keyboard shortcuts: Delete, Arrow nudge, Ctrl+C/V, PageUp/Down, F (flipY) -- */\n  window.addEventListener("keydown", (e) => {', '/* -- Keyboard shortcuts: Delete, Arrow nudge, Ctrl+C/V, PageUp/Down, F (flipY) -- */\n  const handleCanvasShortcut = (e) => {'],
    ['  });\n\n  /* -- Arrow keyup:', `  };
  window.addEventListener("keydown", handleCanvasShortcut);
  for (const [eventName, key] of [["cut", "x"], ["copy", "c"], ["paste", "v"]]) {
    window.addEventListener(eventName, event => {
      if (event.defaultPrevented) return;
      handleCanvasShortcut({ key, metaKey: true, ctrlKey: false, shiftKey: false,
        altKey: false, isComposing: false, repeat: false, target: event.target,
        preventDefault: () => event.preventDefault() });
    });
  }

  /* -- Arrow keyup:`],
    ['export function initTransform(svg, state) {', `export function initTransform(svg, state) {
  const cutSelection = createCutHandler({ state, setClipboard: objects => { _clipboard = objects; } });`],
    ['    // Ctrl+C ??copy selected objects into module-level clipboard', `    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && !e.shiftKey && !e.altKey && !e.isComposing) {
      if (!selectedIds.length || e.repeat || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      void cutSelection();
      return;
    }

    // Ctrl+C ??copy selected objects into module-level clipboard`],
  ];
  let output = source;
  for (const [before, after] of replacements) {
    if (!output.includes(before)) throw new Error(`Cut source anchor missing: ${before.slice(0, 70)}`);
    output = output.replace(before, after);
  }
  return 'import { createCutHandler } from "/editor-cut.mjs";\n' + output;
}
function editorImagePasteSource(source) {
  const before = 'import { hasInternalClipboard, getLastMouseWorld } from "./transform.js?v=1.4.0";';
  const after = 'import { hasInternalClipboard, getLastMouseWorld } from "./transform.js?v=1.4.2";';
  if (!source.includes(before)) throw new Error('Image paste clipboard import anchor missing');
  return source.replace(before, after);
}
module.exports = { editorCutSource, editorImagePasteSource };
