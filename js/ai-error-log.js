/** Keep diagnostics useful without retaining credentials, request bodies or image bytes. */
export function safeAiErrorText(value) {
  return String(value ?? '')
    .replace(/(\b(?:set-cookie|cookie)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]*)/gi, '$1[쿠키 정보 제거됨]')
    .replace(/data:[^\s,;]+(?:;[^\s,]+)*,[^\s"'<>]+/gi, '[이미지 데이터 제거됨]')
    .replace(/\b(?:Bearer|Basic)\s+[^\s"',;]+/gi, '[인증 정보 제거됨]')
    .replace(/\bsk-[a-z0-9_-]+/gi, '[API 키 제거됨]')
    .replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|cookie|password|secret|token)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)/gi, '$1[인증 정보 제거됨]')
    .replace(/[a-z0-9+/_=-]{128,}/gi, '[인코딩 데이터 제거됨]');
}

const genericFailures = new Set([
  '작업 실패',
  '요청 실패',
  '변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.',
]);

export function appendAiErrorRecord(records, current, message, cause) {
  current = { ...current, ...(cause?.aiRequest || {}) };
  const phases = { sourceAnalysis:'원본 라벨 분석 · 그림 생성 전', generation:'그림 생성', pixelProcessing:'원본 주석 제거',
    targetMapping:'라벨 연결 대상 확인', labelProposals:'라벨 배치 준비', finalVerification:'그림·라벨 검수', review:'그림·라벨 검수', labelPlacement:'라벨 합성', localRestore:'국소 복원', localReview:'국소 복원 검수' };
  const times = cause?.workflowMetrics?.timings;
  const stage = cause?.aiPhase ? `단계: ${phases[cause.aiPhase] || cause.aiPhase}${Number.isFinite(times?.[cause.aiPhase]) ? ` · ${Math.round(times[cause.aiPhase]/1000)}초` : ''}\n` : '';
  const timing = times ? `소요: 글자 위치 후보 ${Number.isFinite(times.sourceCandidates) ? Math.round(times.sourceCandidates/1000)+'초' : '-'} · 전체 ${Number.isFinite(times.total) ? Math.round(times.total/1000)+'초' : '-'}\n` : '';
  const details = [message, cause?.message, cause?.code ? `오류 코드: ${cause.code}` : '', cause?.status ? `HTTP 상태: ${cause.status}` : ''].filter(Boolean);
  const error = safeAiErrorText([...new Set(details)].join('\n'));
  const generic = genericFailures.has(error.trim());
  const sameRequest = record => current.taskId != null && current.requestId != null
    && record.taskId === current.taskId && record.requestId === current.requestId
    && !(record.turnId && current.turnId && record.turnId !== current.turnId);
  if (records.some(record => sameRequest(record) && (record.error === error || (generic && !record.generic)))) return false;
  if (!generic) {
    for (let index = records.length - 1; index >= 0; index -= 1) {
      if (sameRequest(records[index]) && records[index].generic) records.splice(index, 1);
    }
  }
  records.push({ taskId: current.taskId, requestId: current.requestId, turnId: current.turnId, error, generic, text: safeAiErrorText(`시간: ${new Date().toISOString()}\n작업: ${current.taskTitle || current.taskId || '(없음)'} (${current.taskId || '-'})\n요청: ${current.requestId || '-'} · 실행: ${current.turnId || '-'}\n모델: ${current.model || '-'} · 추론: ${current.effort || '-'} · 속도: ${current.serviceTier || '표준'}\n${stage}${timing}\n${error}`) });
  return true;
}

export function mountAiErrorLog(panel, context) {
  const records = [];
  const open = document.createElement('button');
  open.type = 'button'; open.className = 'modal-btn ai-error-log-open';
  open.dataset.aiErrorLogOpen = ''; open.classList.add('ai-header-tool');
  open.title = '로그 보기'; open.setAttribute('aria-label', '로그 보기');
  open.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M14 3H6v18h12V7zM14 3v5h4M9 12h6M9 16h6"/></svg>';
  open.setAttribute('aria-haspopup', 'dialog');
  panel.querySelector('[data-ai-status]')?.after(open);
  const dialog = document.createElement('dialog');
  dialog.className = 'ai-error-log-dialog'; dialog.dataset.aiErrorLogDialog = '';
  dialog.setAttribute('aria-label', 'AI 오류 로그');
  dialog.innerHTML = '<h3>AI 오류 로그</h3><p>작업·요청·모델별 오류입니다. 인증 정보와 이미지 데이터는 제외됩니다.</p><textarea data-ai-error-log-text aria-label="전체 오류 로그" readonly></textarea><div class="ai-error-log-actions"><span data-ai-error-log-feedback role="status"></span><button type="button" class="modal-btn" data-ai-error-log-copy>로그 복사</button><button type="button" class="modal-btn" data-ai-error-log-close>닫기</button></div>';
  panel.append(dialog);
  const output = dialog.querySelector('textarea');
  const feedback = dialog.querySelector('[data-ai-error-log-feedback]');
  const refresh = () => {
    output.value = records.length ? records.map(record => record.text).join('\n\n────────\n\n') : '기록된 오류가 없습니다.';
  };
  open.addEventListener('click', () => { refresh(); feedback.textContent = ''; dialog.showModal(); });
  dialog.querySelector('[data-ai-error-log-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopImmediatePropagation(); event.preventDefault(); dialog.close(); } });
  dialog.addEventListener('close', () => open.focus());
  dialog.querySelector('[data-ai-error-log-copy]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(output.value); feedback.textContent = '복사했습니다.'; }
    catch { output.focus(); output.select(); feedback.textContent = '선택된 로그를 복사해 주세요.'; }
  });
  return {
    record(message, cause) {
      if (!appendAiErrorRecord(records, context(), message, cause)) return;
      if (dialog.open) refresh();
    },
  };
}
