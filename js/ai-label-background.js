import { buildExactOutputCacheDescriptor, createExactOutputCacheKey } from './ai-remote-input-plan.js?v=1.7.0-four-session-integration';

const VERSION = 'rhwp-label-background-v1';
const pending = new Map();
const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, '0')).join('');
const cancelled = signal => { if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError'); };

/** Identity of the image request only. Label analysis, restoration and review
 * never participate in the identity of the preserved background PNG. */
export async function imageLabelBackgroundContract({ payload, sourceSha256, harness }) {
  const attachments = await Promise.all(payload.attachments.map(async item => ({ name: item.name, sha256: await digest(item.data) })));
  const descriptor = buildExactOutputCacheDescriptor({ engineVersion: VERSION, mode: 'image-label-background',
    prompt: payload.text, model: payload.model, effort: payload.effort, serviceTier: payload.serviceTier || null,
    outputOptions: { sourceSha256, attachments, harness: harness.id, promptSha256: harness.promptSha256 } });
  const key = createExactOutputCacheKey(descriptor);
  return { key, descriptor, sourceSha256, harness: { ...harness, key, requestSha256: await digest(payload.text) } };
}

async function validBackground(saved, contract) {
  return saved?.version === VERSION && saved.key === contract.key && saved.sourceSha256 === contract.sourceSha256
    && JSON.stringify(saved.harness) === JSON.stringify(contract.harness)
    && /^data:image\/png;base64,/.test(saved.data || '') && saved.candidateSha256 === await digest(saved.data);
}

function waitForBackground(promise, signal) {
  cancelled(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('작업이 취소되었습니다.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** RAW storage is independent of the approval cache: retaining a completed PNG
 * does not approve its picture quality or its editable labels. */
export async function resolveImageLabelBackground({ contract, candidates = [], cache, signal, generate }) {
  cancelled(signal);
  for (const candidate of candidates.filter(Boolean)) {
    if (candidate.imageLabelWorkflow?.imageKind !== 'general' && candidate.workflow?.imageKind !== 'general') continue;
    const saved = { version: VERSION, key: candidate.workflowMetrics?.generationHarness?.key || candidate.metrics?.generationHarness?.key,
      harness: candidate.workflowMetrics?.generationHarness || candidate.metrics?.generationHarness,
      sourceSha256: candidate.sourceSha256, candidateSha256: candidate.candidateSha256,
      data: candidate.data, rendererPrompt: candidate.rendererPrompt || '' };
    if (await validBackground(saved, contract)) { cancelled(signal); return { ...saved, reused: 'candidate' }; }
  }
  if (cache?.get) {
    let hit;
    try { hit = await cache.get(contract.key); } catch { /* A saved task is still usable without IndexedDB. */ }
    cancelled(signal);
    const saved = hit?.hit && hit.entry?.output?.imageLabelBackground;
    if (await validBackground(saved, contract)) return { ...saved, reused: 'storage' };
    if (hit?.hit) { try { await cache.delete?.(contract.key); } catch {} }
  }
  if (pending.has(contract.key)) {
    const shared = pending.get(contract.key);
    try {
      const saved = await waitForBackground(shared, signal);
      cancelled(signal);
      return { ...saved, reused: 'concurrent' };
    } catch (error) {
      // 같이 기다리던 생성은 먼저 시작한 작업대의 취소 신호를 따른다. 그쪽이 취소했다고 내 작업까지 끝내면 안 된다(M39).
      if (error?.name !== 'AbortError' || signal?.aborted) throw error;
      if (pending.get(contract.key) === shared) pending.delete(contract.key);
      return resolveImageLabelBackground({ contract, candidates: [], cache: null, signal, generate });
    }
  }
  const work = (async () => {
    cancelled(signal);
    const generated = await generate();
    cancelled(signal);
    const saved = { version: VERSION, key: contract.key, harness: structuredClone(contract.harness), sourceSha256: contract.sourceSha256,
      data: generated.data, rendererPrompt: generated.rendererPrompt || '', candidateSha256: await digest(generated.data) };
    cancelled(signal);
    if (cache?.put) {
      const output = { imageLabelBackground: saved };
      output.bytes = new TextEncoder().encode(JSON.stringify(output)).byteLength;
      try { await cache.put({ key: contract.key, descriptor: contract.descriptor, output, status: 'complete' }); }
      catch { /* onRaster also checkpoints the preserved PNG into the task. */ }
    }
    cancelled(signal);
    return saved;
  })();
  pending.set(contract.key, work);
  try { return { ...await work, reused: false }; }
  finally { if (pending.get(contract.key) === work) pending.delete(contract.key); }
}
