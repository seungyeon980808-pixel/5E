// Attention is separate from validation: viewing a result never changes acceptance.
export function pendingResult(tab) {
  const id = tab?.resultAttention?.pendingCandidateId;
  return typeof id === 'string' && tab.generated?.some(item => item.id === id && item.data) ? id : null;
}

export function markResultReady(tab, candidate) {
  if (!tab || !candidate?.id || !candidate.data || candidate.kind !== 'generated') return false;
  if (tab.resultAttention?.lastReadyCandidateId === candidate.id) return false;
  tab.resultAttention = { lastReadyCandidateId: candidate.id, pendingCandidateId: candidate.id };
  return true;
}

export function acknowledgeResult(tab, candidateId) {
  if (!candidateId || pendingResult(tab) !== candidateId) return false;
  tab.resultAttention = { ...tab.resultAttention, pendingCandidateId: null };
  return true;
}

export function syncResultEntry(doc = document) {
  const count = [...doc.querySelectorAll('[data-ai-result-count]')]
    .reduce((sum, panel) => sum + (Number(panel.dataset.aiResultCount) || 0), 0);
  const button = doc.getElementById('ai-image-install-open');
  if (!button) return;
  button.dataset.resultAttention = String(count > 0);
  button.setAttribute('aria-label', count ? `AI 이미지 변환 · 확인할 결과 ${count}개` : 'AI 이미지 변환');
}
