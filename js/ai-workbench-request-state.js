// 끝난 요청의 단계. 「실패」로 묶던 것을 뜻대로 나눈다(11-20):
//   kept-previous  새 결과는 못 냈지만 앞 결과를 그대로 두고 끝남(예: 그래프 다시 만들기·수리 실패)
//   offline-wait   인터넷이 끊겨 멈춤 — online이 되면 같은 요청으로 이어서 함
//   login-wait     AI 로그인이 없어 멈춤 — 로그인하면 같은 요청으로 이어서 함
// 기다리는 단계도 지금 요청은 끝난 것이다(이어서 할 때 새 요청을 시작한다).
const terminalPhases = new Set(['completed', 'kept-previous', 'offline-wait', 'login-wait', 'failed', 'cancelled']);
const phases = new Set(['preparing', 'confirmation-wait', 'generating', 'validating', ...terminalPhases]);
export const isTerminalRequestPhase = phase => terminalPhases.has(phase);

// 작업 목록(짧게)과 진행 칸(조금 길게)에 보이는 글. 만들기(생성) 작업은 「변환 중」 대신 「생성 중」.
const LIST_COPY = Object.freeze({ preparing: '요청 준비', 'confirmation-wait': '확인 대기', generating: '변환 중', validating: '결과 확인', completed: '완료',
  'kept-previous': '완료 · 앞 결과를 그대로 두었습니다', 'offline-wait': '연결 대기', 'login-wait': '로그인 대기', failed: '실패', cancelled: '취소' });
const PROGRESS_COPY = Object.freeze({ preparing: '요청 준비', 'confirmation-wait': '사용자 확인 대기', generating: '이미지 생성 중', validating: '결과 확인 중', completed: '작업 완료',
  'kept-previous': '작업 완료 · 앞 결과를 그대로 두었습니다', 'offline-wait': '연결 대기 · 연결되면 이어서 합니다', 'login-wait': '로그인 대기 · 로그인하면 이어서 합니다', failed: '작업 실패', cancelled: '작업 취소' });
export function requestPhaseLabel(phase, { creating = false, detail = false } = {}) {
  if (!detail && creating && phase === 'generating') return '생성 중';
  return (detail ? PROGRESS_COPY : LIST_COPY)[phase] || '';
}
// 로딩 창에 넘길 결과: 완료·취소가 아니면 「못 냄」이고, 원인(reason)으로 문구를 나눈다.
export function requestPhaseOutcome(phase) {
  if (phase === 'completed' || phase === 'cancelled') return { outcome: phase, reason: null, resumes: false };
  if (phase === 'offline-wait') return { outcome: 'failed', reason: 'offline', resumes: true };
  if (phase === 'login-wait') return { outcome: 'failed', reason: 'login', resumes: true };
  return { outcome: 'failed', reason: null, resumes: false };
}

export function createWorkbenchRequestState({ clock = Date.now } = {}) {
  const tasks = new Map();
  let serial = 0;
  const current = token => Boolean(token && tasks.get(token.taskId)?.token === token);
  const live = token => current(token) && !terminalPhases.has(tasks.get(token.taskId).phase);
  return {
    begin(taskId, revisionId = null) {
      if (!taskId) throw new Error('A request must belong to a task.');
      const previous = tasks.get(taskId);
      if (previous && !terminalPhases.has(previous.phase)) throw new Error('This task already has a request.');
      const token = Object.freeze({ taskId, revisionId, requestId: ++serial });
      tasks.set(taskId, { token, phase: 'preparing', startedAt: clock(), endedAt: null, turnId: null, threadId: null });
      return token;
    },
    live,
    advance(token, phase) {
      if (!phases.has(phase)) throw new Error(`Unknown request phase: ${phase}`);
      if (!live(token)) return false;
      const state = tasks.get(token.taskId);
      state.phase = phase;
      if (terminalPhases.has(phase)) state.endedAt = clock();
      return true;
    },
    bind(token, { turnId, renderThreadId, threadId }) {
      if (!live(token) || !turnId) return false;
      Object.assign(tasks.get(token.taskId), { turnId, threadId: renderThreadId || threadId || null });
      return true;
    },
    accepts(token, event) {
      if (!live(token)) return false;
      const state = tasks.get(token.taskId);
      if (!state.turnId || (!event.turnId && !event.threadId)) return false;
      if (event.turnId && event.turnId !== state.turnId) return false;
      if (event.threadId && state.threadId && event.threadId !== state.threadId) return false;
      return event.turnId === state.turnId || Boolean(state.threadId && event.threadId === state.threadId);
    },
    snapshot(taskId) {
      const state = tasks.get(taskId);
      return state ? { ...state, elapsedMs: Math.max(0, (state.endedAt ?? clock()) - state.startedAt) } : null;
    },
    forget(taskId) { tasks.delete(taskId); },
  };
}
