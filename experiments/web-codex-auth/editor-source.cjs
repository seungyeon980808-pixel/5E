function editorPanelSource(source) {
  const replacements = [
    ['setStatus(cancelled ? "작업 취소됨" : "요청 실패", cancelled ? "warn" : "error");', 'setStatus(cancelled ? "작업 취소됨" : error.status === 429 ? error.message : "요청 실패", cancelled ? "warn" : "error");'],
    ['if (!panel) return;', 'if (!panel) return;\n  const background = createBackgroundOptions(panel);\n  const taskFeedback = createTaskFeedback(panel);'],
    ['stage.appendChild(img);', 'stage.appendChild(img);\n    background.register(item, img);'],
    ['void insertImageFromSrc(state, item.data, {preserveBytes:true,centerArtboard:true,aiTaskId:activeTaskTabId,aiCandidateId:item.id,replaceId:replace?target.id:null})',
      'void background.output(item).then(src => insertImageFromSrc(state, src, {preserveBytes:true,at:{x:0,y:0},aiTaskId:activeTaskTabId,aiCandidateId:item.id,replaceId:replace?target.id:null}))'],
    ['const setStatus = (text, kind = "") => {', 'const setStatus = (text, kind = "") => {\n    taskFeedback(text, kind);'],
    ["setStatus('선택 영역 수정 생성 중 · 자동 검수·교정 없음', 'busy');", "currentTurnStartedAt = Date.now();\n          setGenerating(true, '선택 영역 수정 중', 'AI가 수정 이미지를 생성하고 있습니다. 원본은 유지됩니다.', 'render');\n          setStatus('선택 영역 수정 중 · AI 응답을 기다리고 있습니다.', 'busy');"],
    ['review: async proposal => {', "review: async proposal => {\n          setGenerating(false);\n          setStatus('수정 후보 준비 완료 · 비교 후 적용해 주세요.', 'ok');"],
    ['  refresh();\n\n  return {', "  refresh();\n  panel.querySelector('[data-ai-save-selected]')?.remove();\n\n  return {"],
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error('AI panel source changed');
    source = source.replace(before, after);
  }
  const reviewStart = source.indexOf("          return scopedDialog('선택 영역 수정 후보 · 아직 미적용',");
  const reviewEnd = source.indexOf("        },", reviewStart);
  if (reviewStart < 0 || reviewEnd < 0) throw new Error('Scoped review source changed');
  source = source.slice(0, reviewStart) + "          return scopedDialog('수정 결과 확인', '원하는 대로 수정되었는지 비교해 주세요. 이 결과를 사용해도 원본은 남아 있습니다.', { content: simplifyComparison(comparison), accept: '이 결과 사용' });\n" + source.slice(reviewEnd);
  const saveStart = source.indexOf('    if (item.kind === "generated" && !item.sceneResult) {');
  const saveTail = '      actions.appendChild(savePng);\n    }\n';
  const saveEnd = source.indexOf(saveTail, saveStart);
  if (saveStart < 0 || saveEnd < 0) throw new Error('AI PNG action source changed');
  source = source.slice(0, saveStart) + source.slice(saveEnd + saveTail.length);
  return 'import { simplifyComparison } from "/editor-review.js";\nimport { createTaskFeedback } from "/editor-feedback.js";\nimport { createBackgroundOptions } from "/editor-background.js";\n' + source;
}
module.exports = { editorPanelSource };
