/* innerHTML 템플릿에 넣는 글자를 HTML이 아닌 글자로 만든다.
 * 따옴표까지 바꾸므로 속성 값(title="…", value="…")에도 쓸 수 있다.
 * 지금은 상수만 들어가는 자리라도, 값이 사용자·파일·서버에서 오게 바뀌어도 안전하도록 쓴다. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
