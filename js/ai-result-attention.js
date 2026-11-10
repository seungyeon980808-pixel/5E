// Attention is separate from validation: viewing a result never changes acceptance.
export function pendingResult(tab) {
  const id = tab?.resultAttention?.pendingCandidateId;
  return typeof id === 'string' && tab.generated?.some(item => item.id === id && item.data) ? id : null;
}

// 11-10: 라벨 읽기 성공(라벨이 있고 검수 통과)은 「확인 필요」를 띄우지 않는다. 읽기 실패·빈 결과·원본 대체는 띄운다.
export function isQuietLabelReadResult(result, candidate) {
  return result?.status === 'complete' && Boolean(result.metrics?.labelRead) && !result.labelReadNotice
    && Array.isArray(result.labelPlan?.labels) && result.labelPlan.labels.length > 0 && candidate?.reviewState === 'passed';
}

export function markResultReady(tab, candidate) {
  if (!tab || !candidate?.id || !candidate.data || candidate.kind !== 'generated') return false;
  if (candidate.quietCompletion === true) return false;
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
  const panels = [...doc.querySelectorAll('[data-ai-result-count]')];
  const total = panels.reduce((sum, panel) => sum + (Number(panel.dataset.aiResultCount) || 0), 0);
  const graph = panels.reduce((sum, panel) => sum + (Number(panel.dataset.aiGraphResultCount) || 0), 0);
  // 11-07: 이미지 작업 결과는 「AI 이미지」, 그래프 작업 결과는 「그래프」 단추에 알린다.
  for (const [id, name, count] of [['ai-image-install-open', 'AI 이미지', total - graph], ['graph-tool-open', '그래프', graph]]) {
    const button = doc.getElementById(id);
    if (!button) continue;
    if (button.dataset.resultAttention !== String(count > 0)) button.dataset.resultAttention = String(count > 0);
    button.setAttribute('aria-label', count ? `${name} · 확인할 결과 ${count}개` : name);
  }
}
