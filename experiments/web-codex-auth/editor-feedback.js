export function createTaskFeedback(panel) {
  const feedback = document.createElement('div');
  feedback.className = 'ai-task-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.hidden = true;
  panel.querySelector('.ai-conversation-actions').before(feedback);
  return (text, kind) => {
    const relevant = ['busy', 'error', 'warn'].includes(kind) || /선택 영역 수정|부분 수정/.test(text);
    feedback.hidden = !relevant;
    feedback.dataset.kind = kind;
    feedback.textContent = text;
  };
}
