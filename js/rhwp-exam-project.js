import { buildFiveEProject, parseFiveEProject, FIVE_E_PROJECT_MAX_BYTES } from './fivee-project.js?v=1.7.0-four-session-integration';
import { zipStore, unzipStore } from './backup-zip.js?v=1.7.0-four-session-integration';
import { validateFigureRender } from './editable-png.js?v=1.7.0-four-session-integration';
import { validateExamLink, validateExamContext } from './rhwp-exam-links.js?v=1.7.0-four-session-integration';

export const EXAM_PROJECT_MAX_BYTES = FIVE_E_PROJECT_MAX_BYTES;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const ID = /^[a-zA-Z0-9_-]{1,80}$/;

function validateManifest(value) {
  if (!value || value.format !== '5e-exam' || value.version !== 1 ||
      typeof value.name !== 'string' || value.name.length > 200 ||
      !Array.isArray(value.figures) || value.figures.length > 500) {
    throw new Error('지원하는 시험지 작업 파일이 아닙니다.');
  }
  const ids = new Set();
  for (const figure of value.figures) {
    if (!figure || !ID.test(figure.id) || ids.has(figure.id) ||
        typeof figure.name !== 'string' || figure.name.length > 200 ||
        !Number.isSafeInteger(figure.version) || figure.version < 1) {
      throw new Error('그림 연결 정보가 올바르지 않습니다.');
    }
    ids.add(figure.id);
    validateFigureRender(figure.render);
    validateExamLink(figure.link);
    if (figure.hasContext !== undefined && figure.hasContext !== true) throw new Error('작업 탭 원본 연결이 올바르지 않습니다.');
  }
  return value;
}

export function buildLegacyExamProject({ name, documentBytes, figures }) {
  const manifest = validateManifest({ format:'5e-exam', version:1, name,
    figures:figures.map(({id, name, version, render, link, context}) => ({id, name, version, ...(render !== undefined ? {render} : {}), ...(link !== undefined ? {link} : {}), ...(context !== undefined ? {hasContext:true} : {})})) });
  if (!(documentBytes instanceof Uint8Array) || documentBytes.byteLength < 4 || documentBytes[0] !== 0x50 || documentBytes[1] !== 0x4b) throw new Error('시험지 문서가 비어 있거나 올바르지 않습니다.');
  const sources = figures.map(figure => {
    if (!figure.source || typeof figure.source !== 'object') throw new Error('그림 원본이 없습니다.');
    const data = encoder.encode(JSON.stringify(figure.source));
    if (data.byteLength > 32 * 1024 * 1024) throw new Error('그림 원본 한 개는 최대 32 MB까지 저장할 수 있습니다.');
    return { name:`figures/${figure.id}.5e`, data };
  });
  const entries = [
    { name:'manifest.json', data:encoder.encode(JSON.stringify(manifest)) },
    { name:'document.hwpx', data:documentBytes },
    ...sources,
    ...figures.filter(figure => figure.context !== undefined).map(figure => {
      validateExamContext(figure.context);
      const data = encoder.encode(JSON.stringify(figure.context));
      if (data.byteLength > 32 * 1024 * 1024) throw new Error('작업 탭 원본 한 개는 최대 32 MB까지 저장할 수 있습니다.');
      return {name:`workspaces/${figure.id}.json`,data};
    }),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.data.byteLength, 0);
  if (total > EXAM_PROJECT_MAX_BYTES - 128 * 1024) throw new Error('시험지 작업 파일은 최대 128 MiB까지 저장할 수 있습니다.');
  return zipStore(entries);
}

export function buildExamProject({name, documentBytes, figures, ...rest}) {
  validateManifest({format:'5e-exam',version:1,name,figures:figures.map(({source,context,...metadata})=>({...metadata,...(context?{hasContext:true}:{})}))});
  for (const figure of figures) { if (!figure.source || typeof figure.source !== 'object') throw new Error('그림 원본이 없습니다.'); validateExamContext(figure.context); }
  return buildFiveEProject({kind:'exam',name,documentBytes,figures,...rest});
}

export function parseExamProject(bytes, validateSource = value => value) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength > EXAM_PROJECT_MAX_BYTES) throw new Error('시험지 작업 파일이 128 MiB를 초과합니다.');
  if(data[0]!==80 || data[1]!==75) throw new Error("시험지 프로젝트 파일 형식이 올바르지 않습니다.");
  const modern = parseFiveEProject(data,validateSource);
  if (modern) {
    if (modern.kind !== 'exam' || !Array.isArray(modern.figures)) throw new Error('시험지 프로젝트가 아닙니다.');
    validateManifest({format:'5e-exam',version:1,name:modern.name,figures:modern.figures.map(({source,context,...metadata})=>({...metadata,...(context?{hasContext:true}:{})}))});
    for (const figure of modern.figures) { if (!figure.source || typeof figure.source !== 'object') throw new Error('그림 원본이 없습니다.');validateSource(figure.source);validateExamContext(figure.context); }
    const {kind,...project}=modern;return project;
  }
  const files = unzipStore(data);
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes || manifestBytes.length > 256 * 1024) throw new Error('시험지 작업 정보가 없습니다.');
  const manifest = validateManifest(JSON.parse(decoder.decode(manifestBytes)));
  const documentBytes = files.get('document.hwpx');
  if (!documentBytes || documentBytes.length < 4 || documentBytes[0] !== 0x50 || documentBytes[1] !== 0x4b) {
    throw new Error('시험지에 포함된 한글 문서가 올바르지 않습니다.');
  }
  const figures = manifest.figures.map(figure => {
    const sourceBytes = files.get(`figures/${figure.id}.5e`);
    if (!sourceBytes || sourceBytes.length > 32 * 1024 * 1024) throw new Error('그림 원본이 없거나 너무 큽니다.');
    const source = JSON.parse(decoder.decode(sourceBytes));
    validateSource(source);
    const {hasContext,...metadata} = figure;
    let context;
    if (hasContext) {
      const contextBytes = files.get(`workspaces/${figure.id}.json`);
      if (!contextBytes || contextBytes.length > 32 * 1024 * 1024) throw new Error('작업 탭 원본이 없거나 너무 큽니다.');
      context = JSON.parse(decoder.decode(contextBytes)); validateExamContext(context);
    }
    return { ...metadata, source, ...(hasContext ? {context} : {}) };
  });
  return { name:manifest.name, documentBytes:new Uint8Array(documentBytes), figures };
}

function draftStore(mode, operation) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('5e-rhwp-exam',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result, tx=db.transaction('drafts',mode);let result;
      const req=operation(tx.objectStore('drafts'));
      if(req) req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error || new Error('자동 저장 실패'));};
    };
  });
}
export async function writeExamDraft(blob, projectId='legacy', name='새 시험지') {
  const bytes=await blob.arrayBuffer();
  return draftStore('readwrite',store=>{store.put({bytes,projectId,name,updatedAt:Date.now()},`project:${projectId}`);store.put(projectId,'latest');});
}
export async function listExamDrafts() {
  const rows=await draftStore('readonly',store=>store.getAll());
  return rows.filter(row=>row?.bytes instanceof ArrayBuffer && typeof row.projectId==='string').map(({bytes,...row})=>row).sort((a,b)=>b.updatedAt-a.updatedAt);
}
export async function readExamDraft(projectId=null) {
  const id=projectId || await draftStore('readonly',store=>store.get('latest'));
  const row=id?await draftStore('readonly',store=>store.get(`project:${id}`)):null;
  return row?.bytes || (!projectId?await draftStore('readonly',store=>store.get('current')):null) || null;
}
