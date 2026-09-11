function editorResultsSource(source) {
  const replacements = [
    ['  const sourceSelect = panel.querySelector("[data-ai-source-select]");', `  const sourceSelect = panel.querySelector("[data-ai-source-select]");
  panel.querySelectorAll('.ai-result-view-control').forEach(control => control.remove());
  const resultViewLabel = document.createElement('label');
  resultViewLabel.className = 'ai-result-view-control';
  resultViewLabel.append('보기 ');
  const resultView = document.createElement('select');
  resultView.dataset.aiResultView = '';
  resultView.setAttribute('aria-label', '생성 결과 보기 방식');
  for (const [value, text] of [['single', '한 개 보기'], ['multiple', '여러 개 비교']]) {
    const option = document.createElement('option');
    option.value = value; option.textContent = text; resultView.append(option);
  }
  resultViewLabel.append(resultView);
  candidateSelect?.closest('.ai-pane-head')?.append(resultViewLabel);
  resultView.addEventListener('change', () => {
    panel.dataset.aiResultView = resultView.value;
    syncCandidates();
    window.requestAnimationFrame(() => generatedCards().forEach(fitCardStage));
  });
  panel.dataset.aiResultView = 'single';`],
    ["const pair = results?.classList.contains('mode-side-by-side')", "const pair = panel.dataset.aiResultView !== 'multiple' && results?.classList.contains('mode-side-by-side')"],
    ['      watchCardFit(card);\n    }\n    applyZoom();', `      let choose = card.querySelector('[data-ai-choose-result]');
      if (!choose) {
        choose = document.createElement('button');
        choose.type = 'button';
        choose.dataset.aiChooseResult = '';
        choose.dataset.aiInputMutator = '';
        choose.disabled = panel.dataset.aiBusy === 'true';
        choose.addEventListener('click', () => {
          if (!candidateSelect || panel.dataset.aiBusy === 'true') return;
          candidateSelect.value = candidateKey(card);
          candidateSelect.dispatchEvent(new Event('change', { bubbles: true }));
        });
        card.querySelector('.ai-image-card-head')?.append(choose);
      }
      const selected = candidateKey(card) === activeCandidateKey;
      const label = selected ? '선택됨' : '선택';
      if (choose.textContent !== label) choose.textContent = label;
      choose.setAttribute('aria-pressed', String(selected));
      choose.setAttribute('aria-label', cardTitle(card, '생성 결과') + ' 선택');
      watchCardFit(card);
    }
    resultView.disabled = cards.length < 2;
    applyZoom();`],
    ['for (const card of [activeCandidate(), sourceCards().find((item) => sourceKey(item) === activeSourceKey)]) {', "for (const card of [...(panel.dataset.aiResultView === 'multiple' ? generatedCards() : [activeCandidate()]), sourceCards().find((item) => sourceKey(item) === activeSourceKey)]) {"],
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error('AI result view source changed');
    source = source.replace(before, after);
  }
  return source;
}
function panelResultsSource(source) {
  const before = 'selectedCandidateId = tab.selectedCandidateId || generatedImages.at(-1)?.id || null;';
  if (!source.includes(before)) throw new Error('AI restored result source changed');
  return source.replace(before, 'selectedCandidateId = generatedImages.at(-1)?.id || null;');
}
module.exports = { editorResultsSource, panelResultsSource };
