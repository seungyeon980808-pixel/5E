function editorCutSource(source) {
  const before = '    const target = getLastMouseWorld() || { x: s.viewBox.x + s.viewBox.w / 2, y: s.viewBox.y + s.viewBox.h / 2 };';
  const after = `    const pointer = getLastMouseWorld();
    const target = pointer &&
      pointer.x >= s.viewBox.x && pointer.x <= s.viewBox.x + s.viewBox.w &&
      pointer.y >= s.viewBox.y && pointer.y <= s.viewBox.y + s.viewBox.h
      ? pointer : { x: s.viewBox.x + s.viewBox.w / 2, y: s.viewBox.y + s.viewBox.h / 2 };`;
  if (!source.includes(before)) throw new Error('Cut source clipboard insertion anchor missing');
  return source.replace(before, after);
}
function editorImagePasteSource(source) {
  const before = '    if (isEditingFieldTarget(event.target) || blocksCanvasShortcut(event)) return;';
  const after = '    if (event.defaultPrevented || isEditingFieldTarget(event.target) || blocksCanvasShortcut(event)) return;';
  if (!source.includes(before)) throw new Error('Image paste clipboard event anchor missing');
  return source.replace(before, after);
}
module.exports = { editorCutSource, editorImagePasteSource };
