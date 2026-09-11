const originalSelection = `    const selectedObject=state.get().selectedIds?.length === 1 ? state.get().objects.find(o=>state.get().selectedIds?.includes(o.id)&&o.type==="image"&&o.aiTaskId) : null;
    if (!busy && selectedObject && !reference && !references.length && taskTabs.has(selectedObject.aiTaskId)) {
      restoreTaskTab(selectedObject.aiTaskId);
      if (generatedImages.some((item) => item.id === selectedObject.aiCandidateId)) {
        panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: selectedObject.aiCandidateId } }));
      }
    }`;

const canvasSelection = `    const selectedCanvasImage = !busy && !reference && !references.length && state.get().selectedIds?.length === 1
      ? state.get().objects.find(object => object.type === 'image' && state.get().selectedIds.includes(object.id) && object.src)
      : null;
    if (selectedCanvasImage) {
      panel.hidden = false;
      try {
        const canvasData = await sourceToDataUrl(selectedCanvasImage.src);
        const existingReference = attachments.some(item => item.data === canvasData && isInputReference(item));
        if (!existingReference) {
          captureActiveTaskTab();
          const existingTask = [...taskTabs.values()].find(tab => (tab.attachments || []).some(item => item.data === canvasData && isInputReference(item)));
          if (existingTask) {
            restoreTaskTab(existingTask.id);
          } else {
            if (attachments.length || generatedImages.length || conversationMessages.length || input.value.trim()) createTaskTab();
            addReferenceData({ data: canvasData, name: selectedCanvasImage.name || '캔버스 이미지', sourceKind: 'canvas' });
          }
        }
        syncReferenceSummary();
        setStatus('선택한 캔버스 이미지를 참고 이미지로 불러왔습니다.', 'ok');
      } catch (error) {
        setStatus('캔버스 이미지를 불러오지 못했습니다: ' + (error.message || error), 'error');
        panel.hidden = false;
        return;
      }
    }`;

function editorCanvasSource(source) {
  if (!source.includes(originalSelection)) throw new Error('AI canvas selection source changed');
  return source.replace(originalSelection, canvasSelection);
}

module.exports = { editorCanvasSource };
