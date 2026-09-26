const DEFAULT_CONTEXT_CHARS = 6000;
const DEFAULT_CONTEXT_MESSAGES = 12;

export function uniqueImageItems(items = []) {
  const seenItems = new Set();
  const seenData = new Set();
  const result = [];
  for (const item of items) {
    if (!item || seenItems.has(item)) continue;
    const data = typeof item.data === "string" ? item.data : null;
    if (data && seenData.has(data)) continue;
    seenItems.add(item);
    if (data) seenData.add(data);
    result.push(item);
  }
  return result;
}

export function selectOutgoingImageItems({
  type,
  references = [],
  generated = [],
  latestGenerated = null,
  conversationId = null,
} = {}) {
  const annotatedGenerated = generated.filter((item) =>
    Array.isArray(item?.comments) && item.comments.some((comment) => String(comment?.text || "").trim()),
  );
  // The render thread is ephemeral and the discussion thread has never seen
  // its result. Include the latest result once in either path, then let the
  // per-conversation sent marker deduplicate later chat turns.
  const revisionImage = latestGenerated;
  const candidates = uniqueImageItems([...references, ...annotatedGenerated, ...(revisionImage ? [revisionImage] : [])]);

  // A render thread is deliberately fresh, so it receives each active source once.
  if (type === "image") return candidates;

  // A discussion thread already retains images from earlier turns. Resend only a
  // new or changed source instead of paying the visual-input cost every message.
  return candidates.filter((item) =>
    !conversationId || item.sentConversationId !== conversationId || item.sentSource !== item.data,
  );
}

export function markImagesSent(items, conversationId) {
  if (!conversationId) return;
  for (const item of items || []) {
    item.sentConversationId = conversationId;
    item.sentSource = item.data;
  }
}

export function compactConversation(messages = [], {
  maxChars = DEFAULT_CONTEXT_CHARS,
  maxMessages = DEFAULT_CONTEXT_MESSAGES,
} = {}) {
  const normalized = messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({ role: message.role, text: String(message.text || "").trim() }))
    .filter((message) => message.text)
    .slice(-Math.max(1, maxMessages));

  const selected = [];
  let used = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const prefix = message.role === "user" ? "사용자" : "AI";
    const line = `${prefix}: ${message.text}`;
    const remaining = maxChars - used;
    if (remaining <= prefix.length + 3) break;
    selected.unshift(line.length <= remaining ? line : `${line.slice(0, Math.max(0, remaining - 1))}…`);
    used += Math.min(line.length, remaining) + 1;
    if (line.length > remaining) break;
  }
  return selected.join("\n");
}
