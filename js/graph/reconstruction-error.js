// A failed request is never an instruction to resend or change the fixed model.
export function describeGraphFailure(error) {
  const detail = String(error?.message || error || '그래프 복원에 실패했습니다.');
  const explicit = error?.code;
  let code = explicit || 'GRAPH_FAILED';
  if (!explicit) {
    if (/\b429\b|too many requests|rate.?limit|quota exceeded|usage limit/i.test(detail)) code = 'GRAPH_RATE_LIMIT';
    else if (/\b401\b|unauthori[sz]ed|not logged in|로그인/i.test(detail)) code = 'GRAPH_AUTH';
    else if (/선택 모델|선택 추론|model.+(?:not found|unavailable|not supported)/i.test(detail)) code = 'GRAPH_MODEL_UNAVAILABLE';
    else if (/timeout|timed out|시간.{0,4}초과/i.test(detail)) code = 'GRAPH_TIMEOUT';
    else if (/network|fetch|socket|disconnect|ECONN|연결|종료되었습니다/i.test(detail)) code = 'GRAPH_CONNECTION';
  }
  const messages = {
    GRAPH_CANCELLED: '그래프 복원을 취소했습니다.',
    GRAPH_RATE_LIMIT: 'AI 요청 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도하세요.',
    GRAPH_AUTH: 'AI 로그인을 확인한 뒤 다시 시도하세요.',
    GRAPH_MODEL_UNAVAILABLE: 'Sol 6.1 / medium을 사용할 수 없습니다. 모델 목록과 연결 상태를 확인하세요.',
    GRAPH_TIMEOUT: '그래프 분석 시간이 초과되었습니다. 다시 시도할 수 있습니다.',
    GRAPH_CONNECTION: 'AI 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도하세요.',
    GRAPH_INVALID_RESULT: '복원 결과가 그래프 검증을 통과하지 못했습니다.',
    GRAPH_DESCRIPTION_REJECTED: detail,
  };
  return { code, detail, message: `${messages[code] || detail} 원본과 이전 결과는 유지하며 자동 재전송하지 않습니다.`, automaticRetry: false };
}
