function resolveTurnPlan(payload = {}) {
  const requestedPurpose = payload.purpose === "scene" ? "scene"
    : payload.purpose === "image" ? "image" : "chat";
  const ephemeralRender = payload.ephemeralRender === true || requestedPurpose === "image" || requestedPurpose === "scene";
  const resetConversation = payload.resetConversation === true;
  const conversationId = typeof payload.conversationId === "string" && payload.conversationId.trim()
    ? payload.conversationId.trim()
    : null;

  return {
    purpose: ephemeralRender ? (requestedPurpose === "scene" ? "scene" : "image") : "chat",
    ephemeralRender,
    resetChatThread: resetConversation && !ephemeralRender,
    // A reset and an image render must never resume the supplied conversation.
    resumeConversationId: !resetConversation && !ephemeralRender ? conversationId : null,
    preservedConversationId: conversationId,
  };
}

function isFailedStatus(status) {
  return typeof status === "string" && /fail|error|cancel|interrupt/i.test(status);
}

function shouldAutoFinalizeImageTurn({ message, observation, activeTurnId, alreadyFinalizing = false } = {}) {
  const item = message?.params?.item;
  const eventTurnId = message?.params?.turnId || observation?.performance?.turnId || null;
  const hasUsableImage = Boolean(
    item?.savedPath ||
    (typeof item?.imageDataUrl === "string" && item.imageDataUrl.startsWith("data:image/")) ||
    (typeof item?.result === "string" && (/^data:image\//.test(item.result) || /^https:\/\//.test(item.result)))
  );
  return message?.method === "item/completed" &&
    item?.type === "imageGeneration" &&
    !isFailedStatus(item.status) &&
    hasUsableImage &&
    observation?.performance?.purpose === "image" &&
    Boolean(eventTurnId) &&
    eventTurnId === activeTurnId &&
    !alreadyFinalizing;
}

function isTerminalTurnStatus(status) {
  return status === "completed" || status === "interrupted" || status === "failed";
}

function readTurnTerminalStatus(response, turnId) {
  const thread = response?.thread;
  const turn = Array.isArray(thread?.turns)
    ? thread.turns.find((item) => item?.id === turnId)
    : null;
  if (isTerminalTurnStatus(turn?.status)) return turn.status;
  if (turn) return null;
  const threadStatus = typeof thread?.status === "string" ? thread.status : thread?.status?.type;
  if (threadStatus === "idle") return "completed";
  if (threadStatus === "systemError") return "failed";
  return null;
}

class TurnPerformanceRegistry {
  constructor(now = Date.now) {
    this.now = now;
    this.turns = new Map();
  }

  register({
    turnId,
    threadId,
    purpose = "chat",
    startedAt,
    prepareEndedAt,
    attachmentCount = 0,
    attachmentBytes = 0,
  }) {
    if (!turnId) return null;
    const start = Number.isFinite(startedAt) ? startedAt : this.now();
    const prepared = Number.isFinite(prepareEndedAt) ? prepareEndedAt : this.now();
    const entry = {
      turnId,
      threadId,
      purpose,
      startedAt: start,
      prepareMs: Math.max(0, prepared - start),
      firstImageStartedAt: null,
      imageToolMs: 0,
      imageCallCount: 0,
      imageFailedCount: 0,
      attachmentCount,
      attachmentBytes,
      imageStarts: new Map(),
      completedImages: new Set(),
    };
    this.turns.set(turnId, entry);
    return this.snapshot(entry);
  }

  observe(message) {
    const params = message?.params || {};
    const turnId = params.turnId || params.turn?.id || null;
    const entry = turnId ? this.turns.get(turnId) : null;
    if (!entry) return null;

    const item = params.item;
    if (item?.type === "imageGeneration") {
      const itemId = item.id || `image-${entry.imageCallCount + 1}`;
      if (message.method === "item/started") {
        const startedAt = Number.isFinite(params.startedAtMs) ? params.startedAtMs : this.now();
        if (!entry.imageStarts.has(itemId)) {
          entry.imageStarts.set(itemId, startedAt);
          entry.imageCallCount += 1;
          if (entry.firstImageStartedAt == null) entry.firstImageStartedAt = startedAt;
        }
      } else if (message.method === "item/completed") {
        const completedAt = Number.isFinite(params.completedAtMs) ? params.completedAtMs : this.now();
        if (!entry.imageStarts.has(itemId)) {
          entry.imageStarts.set(itemId, completedAt);
          entry.imageCallCount += 1;
          if (entry.firstImageStartedAt == null) entry.firstImageStartedAt = completedAt;
        }
        if (!entry.completedImages.has(itemId)) {
          entry.completedImages.add(itemId);
          entry.imageToolMs += Math.max(0, completedAt - entry.imageStarts.get(itemId));
          if (isFailedStatus(item.status)) entry.imageFailedCount += 1;
        }
      }
    }

    if (message.method !== "turn/completed") return { completed: false, performance: this.snapshot(entry) };
    const performance = this.snapshot(entry, this.now());
    return { completed: true, performance };
  }

  snapshot(entryOrTurnId, completedAt = null) {
    const entry = typeof entryOrTurnId === "string" ? this.turns.get(entryOrTurnId) : entryOrTurnId;
    if (!entry) return null;
    const imageStartMs = entry.firstImageStartedAt == null
      ? null
      : Math.max(0, entry.firstImageStartedAt - entry.startedAt);
    const totalMs = Number.isFinite(completedAt) ? Math.max(0, completedAt - entry.startedAt) : null;
    return {
      threadId: entry.threadId,
      turnId: entry.turnId,
      purpose: entry.purpose,
      totalMs,
      prepareMs: entry.prepareMs,
      imageStartMs,
      firstImageStartMs: imageStartMs,
      imageToolMs: entry.imageToolMs,
      toolMs: entry.imageToolMs,
      imageCallCount: entry.imageCallCount,
      imageFailedCount: entry.imageFailedCount,
      failedCount: entry.imageFailedCount,
      attachmentCount: entry.attachmentCount,
      attachmentBytes: entry.attachmentBytes,
    };
  }

  delete(turnId) {
    this.turns.delete(turnId);
  }

  clear() {
    this.turns.clear();
  }
}

module.exports = {
  resolveTurnPlan,
  shouldAutoFinalizeImageTurn,
  isTerminalTurnStatus,
  readTurnTerminalStatus,
  TurnPerformanceRegistry,
};
