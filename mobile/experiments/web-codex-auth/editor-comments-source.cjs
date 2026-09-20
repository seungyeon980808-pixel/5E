function editorCommentsSource(source) {
  const replacements = [
    ['const box = normalizeCommentBox(comment);\n      if (!box) continue;', `const box = entry.drag?.type === 'move' && entry.drag.comment === comment
        ? entry.drag.box : normalizeCommentBox(comment);
      if (!box) continue;`],
    ["outline.dataset.aiCommentMarker = '';", "outline.dataset.aiCommentMarker = String(comment.number);"],
    ["outline.style.pointerEvents = 'none';", "outline.style.pointerEvents = isBusy() ? 'none' : 'auto';\n        outline.style.cursor = 'move';\n        outline.style.touchAction = 'none';"],
    ["pin.dataset.aiCommentMarker = '';", "pin.dataset.aiCommentMarker = String(comment.number);\n      pin.style.cursor = 'move';\n      pin.style.touchAction = 'none';"],
    ["pin.title = commentText(comment) || '코멘트 입력';", "pin.title = `${commentText(comment) || '코멘트 입력'} · 드래그하여 위치 이동`;"],
    ["if (event.target.closest?.('[data-ai-comment-marker]')) return;", `const marker = event.target.closest?.('[data-ai-comment-marker]');
      if (marker) {
        const comment = item.comments?.find(value => String(value.number) === marker.dataset.aiCommentMarker);
        const box = normalizeCommentBox(comment);
        const rect = img.getBoundingClientRect();
        if (!comment || !box || !(rect.width > 0 && rect.height > 0)) return;
        event.preventDefault(); event.stopPropagation();
        selected = commentKey(item, comment);
        entry.drag = { type: 'move', pointerId: event.pointerId, comment, box: { ...box }, original: box,
          x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
        try { stage.setPointerCapture?.(event.pointerId); } catch { /* detached pointer */ }
        activateTab('comments'); render();
        return;
      }`],
    ["if (isBusy()) { clearDrag(entry); return; }", "if (isBusy()) { clearDrag(entry); renderMarkers(item); return; }\n      if (drag.type === 'move') {\n        event.preventDefault();\n        drag.box = { ...drag.original,\n          x: Math.max(0, Math.min(100 - drag.original.w, drag.original.x + (event.clientX - drag.x) / drag.width * 100)),\n          y: Math.max(0, Math.min(100 - drag.original.h, drag.original.y + (event.clientY - drag.y) / drag.height * 100)) };\n        renderMarkers(item);\n        return;\n      }"],
    ["clearDrag(entry);\n      if (drag.type === 'pan' || isBusy()) return;", `clearDrag(entry);
      if (drag.type === 'move') {
        event.preventDefault(); event.stopPropagation();
        if (!isBusy() && allowed().includes(item) && item.comments?.includes(drag.comment)
            && (drag.box.x !== drag.original.x || drag.box.y !== drag.original.y)) {
          Object.assign(drag.comment, drag.box);
          changed();
        }
        render();
        return;
      }
      if (drag.type === 'pan' || isBusy()) return;`],
    ["on(stage, 'pointercancel', () => clearDrag(entry));", "on(stage, 'pointercancel', () => { clearDrag(entry); renderMarkers(item); });"],
    ["on(stage, 'lostpointercapture', () => clearDrag(entry));", "on(stage, 'lostpointercapture', () => { clearDrag(entry); renderMarkers(item); });"],
  ];
  for (const [before, after] of replacements) {
    if (source.split(before).length !== 2) throw new Error('AI comment source changed');
    source = source.replace(before, after);
  }
  return source;
}
module.exports = { editorCommentsSource };
