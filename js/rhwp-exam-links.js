import { validateWorkspaceCandidates } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const copyExamData = value => structuredClone(value);

export function validateExamLink(link) {
  if (link === undefined) return;
  if (!link || !ID.test(link.tabId) || !ID.test(link.assetId)) throw new Error('작업 탭과 시험지 그림의 연결 정보가 올바르지 않습니다.');
}

export function validateExamContext(context) {
  if (context === undefined) return;
  if (!context || context.version !== 1 || typeof context.pageId !== 'string' || context.pageId.length > 200 ||
      !Array.isArray(context.selectedIds) || context.selectedIds.length > 10000 || context.selectedIds.some(id => typeof id !== 'string' || id.length > 200)) {
    throw new Error('그림 작업 화면 정보가 올바르지 않습니다.');
  }
  if (context.viewBox !== null && (!context.viewBox || !['x','y','w','h'].every(key => Number.isFinite(context.viewBox[key])) || context.viewBox.w <= 0 || context.viewBox.h <= 0)) {
    throw new Error('그림 작업 화면 배율이 올바르지 않습니다.');
  }
  const ai = context.ai;
  if (ai !== null && (!ai || typeof ai.scope !== 'string' || ai.scope.length > 256 || typeof ai.taskId !== 'string' || ai.taskId.length > 256 ||
      !ai.snapshot || !Array.isArray(ai.snapshot.tabs) || ai.snapshot.tabs.length !== 1 || ai.snapshot.tabs[0]?.id !== ai.taskId)) {
    throw new Error('AI 작업 탭 원본이 올바르지 않습니다.');
  }
  if (ai) validateWorkspaceCandidates(ai.snapshot);
}

export function normalizeExamFigure(figure) {
  const result = copyExamData(figure);
  result.link ||= {tabId:`legacy_${figure.id}`.slice(0,80),assetId:figure.id};
  result.context ||= {version:1,pageId:result.source.activePageId,viewBox:null,selectedIds:[],ai:null};
  validateExamLink(result.link); validateExamContext(result.context);
  return result;
}

// Names are presentation metadata; identity and all source/history data stay put.
export function renameExamFigure(figure, name) {
  const page = figure.source.pages.find(page => page.id === figure.source.activePageId);
  const aiTab = figure.context?.ai?.snapshot.tabs[0];
  const changed = figure.name !== name || page.name !== name || (aiTab && aiTab.title !== name);
  figure.name = name; page.name = name;
  if (aiTab) aiTab.title = name;
  return !!changed;
}

// A copied document picture receives a separate source tab, including its AI
// history. Revision IDs still identify individual native undo/redo snapshots.
export function forkExamFigure(figure) {
  const result = normalizeExamFigure(figure), pageId = `exam_${crypto.randomUUID()}`;
  result.id = crypto.randomUUID(); result.version = 1;
  result.name = `${result.name} 복사`.slice(0,200);
  result.link = {tabId:crypto.randomUUID(),assetId:crypto.randomUUID()};
  const page = result.source.pages.find(page => page.id === result.source.activePageId);
  page.id = pageId; page.name = result.name;
  page.meta = {...page.meta,examLink:result.link,examRevisionId:result.id};
  result.source.activePageId = pageId; result.context.pageId = pageId;
  if (result.context.ai) {
    const ai = result.context.ai, oldId = ai.taskId, taskId = `exam-task-${crypto.randomUUID()}`;
    ai.scope = crypto.randomUUID(); ai.taskId = taskId;
    ai.snapshot.tabs[0].id = taskId;
    ai.snapshot.tabs[0].title = result.name;
    ai.snapshot.tabs[0].examLink = result.link;
    delete ai.snapshot.tabs[0].batchOwner;
    ai.snapshot.activeTaskTabId = taskId;
    for (const object of page.objects) if (object.aiTaskId === oldId) object.aiTaskId = taskId;
  }
  return result;
}
