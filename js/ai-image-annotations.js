import { selectImageTransportItems } from "./ai-request-plan.js?v=1.5.8-local-privacy-completion";

export function buildPlanningSafeAnnotationPrompt(images = []) {
  const lines = [];
  for (const item of selectImageTransportItems(images)) {
    const comments = (item.comments || []).filter((comment) => String(comment?.text || "").trim());
    if (!comments.length) continue;
    lines.push(`[${item.kind === "reference" ? "참고 이미지" : "생성 결과"}: ${item.name}]`);
    for (const comment of comments) {
      lines.push(`- 영역 ${comment.number} (가로 ${comment.x}%, 세로 ${comment.y}%, 너비 ${comment.w}%, 높이 ${comment.h}%): ${comment.text.trim()}`);
    }
  }
  return lines.length ? `\n\n이미지 영역 코멘트:\n${lines.join("\n")}` : "";
}
