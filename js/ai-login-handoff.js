// Keep the source pixels locally until authentication and workbench handoff finish.
// The session pointer belongs to this tab; IndexedDB holds the larger image data.
export const LOGIN_INTENT_SESSION_KEY = '5e.aiLoginIntent.v1';
const intentKey = id => `ai-login-intent:${id}`;
const cancelled = () => new DOMException('로그인이 취소되었습니다. 선택한 이미지는 그대로 유지됩니다.', 'AbortError');

function snapshotOptions(options) {
  const references = [...(options.references || []), ...(options.reference ? [options.reference] : [])];
  if (!references.length) throw new Error('AI 작업에 보낼 이미지가 없습니다.');
  return structuredClone({
    references,
    prompt: options.prompt || '',
    conversionKind: options.conversionKind === 'graph' ? 'graph' : 'image',
    placement: options.placement || 'separate',
    groups: options.groups || null,
    startGeneration: false,
  });
}

export function createAiLoginHandoff({ read, write, remove, session, prepare, reveal, requireAi, makeId = () => crypto.randomUUID() }) {
  let running = null;
  let runningOptions = null;
  let retryIntent = null;
  const sameOptions = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clearPointer = id => {
    if (session.getItem(LOGIN_INTENT_SESSION_KEY) === id) session.removeItem(LOGIN_INTENT_SESSION_KEY);
  };

  async function run(intent, isCurrent = () => true) {
    // The pending record precedes every image import, including its first checkpoint.
    await write(intentKey(intent.id), intent);
    session.setItem(LOGIN_INTENT_SESSION_KEY, intent.id);
    try {
      if (!isCurrent()) throw cancelled();
      if (!intent.receipt) {
        intent.receipt = await prepare({ ...intent.options, importId: intent.id, reveal: false });
        if (!Array.isArray(intent.receipt) || !intent.receipt.length) throw new Error('이미지 작업대의 저장 결과를 확인하지 못했습니다.');
        intent.state = 'waiting';
        await write(intentKey(intent.id), intent);
      }
      if (!isCurrent()) throw cancelled();
      return await requireAi(async ({ signal } = {}) => {
        if (signal?.aborted || !isCurrent()) throw cancelled();
        await reveal(intent.receipt, { signal });
        if (signal?.aborted || !isCurrent()) throw cancelled();
        // Clear only our tab's pointer. A replacement intent must remain untouched.
        clearPointer(intent.id);
        retryIntent = null;
        await remove(intentKey(intent.id));
        return intent.receipt;
      });
    } catch (error) {
      clearPointer(intent.id);
      intent.state = 'cancelled';
      retryIntent = intent;
      // The checkpointed workspaces retain the images. Cancelled payload copies
      // have no recovery pointer, so keeping them would consume storage forever.
      try { await remove(intentKey(intent.id)); } catch { /* Preserve the original failure. */ }
      // A hidden staging checkpoint is not a completed library handoff. Keep
      // every source crop until authentication and reveal succeed together.
      if (error?.transferredReferenceIndices) {
        const failure = new Error(error.message, { cause: error });
        failure.name = error.name;
        throw failure;
      }
      throw error;
    }
  }

  function start(intent, isCurrent) {
    runningOptions = intent.options;
    const operation = run(intent, isCurrent);
    running = operation.finally(() => { running = null; runningOptions = null; });
    return running;
  }

  return {
    open(options) {
      const snapshot = snapshotOptions(options);
      if (running) {
        if (sameOptions(snapshot, runningOptions)) return running;
        return Promise.reject(new Error('현재 이미지의 로그인을 먼저 완료하거나 취소해 주세요.'));
      }
      const intent = retryIntent && sameOptions(snapshot, retryIntent.options)
        ? { ...retryIntent, state: 'waiting' }
        : { version: 1, id: makeId(), options: snapshot, state: 'preparing', receipt: null };
      return start(intent, options.isCurrent);
    },
    async recover() {
      if (running) return running;
      const id = session.getItem(LOGIN_INTENT_SESSION_KEY);
      if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return null;
      const intent = await read(intentKey(id));
      if (!intent || intent.version !== 1 || intent.id !== id || intent.state === 'cancelled') {
        clearPointer(id);
        if (intent?.state === 'cancelled') await remove(intentKey(id));
        return null;
      }
      if (running) return running;
      return start(intent);
    },
  };
}
