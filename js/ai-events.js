/* App Server 이벤트를 5E 이미지 작업 UI가 이해하는 최소 신호로 축약한다. */
export function parseAiEvent(message) {
  const method = message?.method || "";
  const params = message?.params || {};
  const item = params.item;
  const turnId = params.turnId || params.turn?.id || null;

  if (method === "5e/performance") {
    return { kind: "performance", turnId, metrics: params };
  }
  if (method === "5e/image-finalization") {
    return { kind: "finalization", turnId, state: params.state || "", status: params.status || null, message: params.message || null };
  }

  if (method === "thread/tokenUsage/updated") {
    return {
      kind: "tokens",
      turnId,
      threadId: params.threadId || null,
      usage: params.tokenUsage?.last || params.tokenUsage || null,
    };
  }
  if (method === "account/rateLimits/updated") {
    return { kind: "limits", limits: params.rateLimits || params };
  }
  if (method === "item/started" && item?.type === "imageGeneration") {
    return { kind: "progress", turnId, title: "이미지를 생성하고 있습니다", detail: "선화 구조와 배치를 렌더링하는 중입니다." };
  }
  if (method === "item/completed" && item?.type === "imageGeneration") {
    const src = item.imageDataUrl || item.result;
    return {
      kind: "image",
      turnId,
      src: typeof src === "string" && (/^data:image\//.test(src) || /^https:\/\//.test(src)) ? src : null,
    };
  }
  if (method === "item/completed" && item?.type === "agentMessage") {
    if (item.phase === "commentary") return { kind: "ignore" };
    return { kind: "assistant", turnId, text: typeof item.text === "string" ? item.text.trim() : "" };
  }
  if (method === "turn/completed") {
    const turn = params.turn || {};
    return { kind: "done", turnId, status: turn.status || "completed", error: turn.error?.message || turn.error || null };
  }
  if (method === "error") {
    return { kind: "error", turnId, text: params.error?.message || params.message || "AI 작업 중 오류가 발생했습니다." };
  }
  return { kind: "ignore" };
}
