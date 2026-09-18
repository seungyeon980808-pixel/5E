const TAB_FIELDS = ['id', 'title', 'attachments', 'generated', 'conversationMessages', 'input', 'selectedCandidateId', 'referenceComposition', 'workbenchViewState', 'commentViewState', 'mode', 'qualityMode', 'outputEngine', 'generationMode', 'markPolicy', 'outputOptions', 'generationTiming', 'workState', 'model', 'effort', 'serviceTier'];
const IMAGE_FIELDS = ['id', 'name', 'data', 'kind', 'sourceKind', 'source', 'referenceRole', 'primary', 'active', 'stale', 'superseded', 'createdAt', 'updatedAt', 'sceneSource', 'sceneCompileSource', 'sceneResult', 'engine', 'postprocessOk', 'pixelInspection', 'reviewState', 'reviewReport', 'reviewMeta', 'structureRecord', 'rendererPrompt', 'generationMode', 'markPolicy', 'nextCommentNumber', 'comments'];
const PRIVATE_KEY = /(?:auth|cookie|token|secret|password|session|credential|localpath|filepath|directory|conversationid|threadid|turnid|clientScope|sentSource|sentConversationId|inFlightRequest|retryRequest)|^(?:path|url)$/i;
const IMAGE_KEY = /^(?:data|dataUrl|src|transportDataUrl|previewDataUrl|imageDataUrl)$/;
const RASTER = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

function pick(value, fields) {
  return Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
}

async function clean(value, embedImage, key = '', depth = 0) {
  if (depth > 40) throw new Error('공유 문서의 데이터 구조가 너무 깊습니다.');
  if (typeof value === 'string') {
    if (IMAGE_KEY.test(key) && value) {
      const bytes = RASTER.test(value) ? value : await embedImage(value);
      if (!RASTER.test(bytes)) throw new Error('공유할 이미지 바이트를 읽지 못했습니다.');
      return bytes;
    }
    if (/^(?:file:|\/Users\/|\/var\/|\/Volumes\/|\/home\/|[A-Za-z]:\\)/.test(value)) return null;
    return value;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Promise.all(value.map(item => clean(item, embedImage, '', depth + 1)));
  const entries = await Promise.all(Object.entries(value).filter(([name]) => !PRIVATE_KEY.test(name) && !['__proto__', 'constructor', 'prototype', 'card'].includes(name)).map(async ([name, item]) => [name, await clean(item, embedImage, name, depth + 1)]));
  return Object.fromEntries(entries);
}

export async function createSharingDocument(workspaces, { mode = 'view', activeWorkspace = 0, embedImage = async () => { throw new Error('이미지 주소에 의존하는 문서는 공유할 수 없습니다.'); } } = {}) {
  if (!['view', 'edit'].includes(mode) || !Array.isArray(workspaces) || workspaces.length < 1 || workspaces.length > 100) throw new Error('공유 문서 형식이 올바르지 않습니다.');
  const copies = [];
  for (const workspace of workspaces) {
    if (!workspace || !Array.isArray(workspace.tabs) || workspace.tabs.length > 500) throw new Error('공유 작업 목록이 올바르지 않습니다.');
    const tabs = [];
    for (const tab of workspace.tabs) {
      if (typeof tab?.id !== 'string') throw new Error('공유 작업 ID가 없습니다.');
      const copy = pick(tab, TAB_FIELDS);
      for (const field of ['attachments', 'generated']) {
        copy[field] = (tab[field] || []).map(item => pick(item, IMAGE_FIELDS));
        if (copy[field].some(item => !item.data)) throw new Error('공유 문서에 이미지 원본이 누락되었습니다.');
      }
      copy.conversationMessages = (tab.conversationMessages || []).map(message => pick(message, ['role', 'text']));
      if (['busy', 'running'].includes(copy.workState)) copy.workState = 'interrupted';
      const sanitized=await clean(copy, embedImage);
      if(sanitized.generationTiming){
        sanitized.generationTiming.turnId='shared-timing';
        if(sanitized.generationTiming.phase!=='terminal')Object.assign(sanitized.generationTiming,{endedAtMs:null,phase:'terminal',outcome:'interrupted',postprocessPending:false,terminalOutcome:'interrupted'});
      }
      tabs.push(sanitized);
    }
    copies.push({ key: 'workspace', tabs, activeTaskTabId: workspace.activeTaskTabId, taskTabSerial: workspace.taskTabSerial || 0, imageSerial: workspace.imageSerial || 0 });
  }
  return { schema: '5e-ai-sharing', version: 1, mode, activeWorkspace: Math.max(0, Math.min(copies.length - 1, activeWorkspace)), workspaces: copies };
}

export async function parseSharingDocument(value) {
  if (value?.schema !== '5e-ai-sharing' || value.version !== 1) throw new Error('지원하지 않는 공유 문서입니다.');
  const canonical = await createSharingDocument(value.workspaces, { mode: value.mode, activeWorkspace: value.activeWorkspace });
  const ordered = item => Array.isArray(item) ? item.map(ordered) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().map(key => [key,ordered(item[key])])) : item;
  if (JSON.stringify(ordered(canonical)) !== JSON.stringify(ordered(value))) throw new Error('공유 문서에 허용되지 않은 데이터가 있습니다.');
  return canonical;
}

export async function receiveSharingDocument(id, download, store) {
  const cached = await store.get(id);
  if (cached) return { document: await parseSharingDocument(cached), cached: true };
  const document = await parseSharingDocument(await download());
  await store.set(id, document);
  return { document, cached: false };
}
