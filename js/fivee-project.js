import { validateWorkspaceCandidates } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';
import { zipStore, unzipStore, isZip } from './backup-zip.js?v=1.7.0-four-session-integration';
import { MAX_PROJECT_FILE_BYTES } from './project-file-policy.js?v=1.7.0-four-session-integration';

const enc = new TextEncoder(), dec = new TextDecoder('utf-8', {fatal:true});
const ASSET = '$5eAsset';
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export const FIVE_E_PROJECT_MAX_BYTES = MAX_PROJECT_FILE_BYTES;
function bytesFromBase64(value) { const s = atob(value); return Uint8Array.from(s, c => c.charCodeAt(0)); }
function base64(bytes) {
  let s = ''; for (let i=0;i<bytes.length;i+=32768) s += String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(s);
}
function validateWorkspaces(payload) {
  const workspaces = payload.workspace?.ai?.workspaces;
  if (workspaces !== undefined) {
    if (!Array.isArray(workspaces)) throw new TypeError('Invalid portable workspaces');
    workspaces.forEach(validateWorkspaceCandidates);
  }
  for (const figure of payload.figures || []) if (figure.context?.ai) validateWorkspaceCandidates(figure.context.ai.snapshot);
}
function documentValid(bytes) {
  if (!(bytes instanceof Uint8Array) || !isZip(bytes)) throw new Error('프로젝트의 한글 문서가 올바르지 않습니다.');
}
// 종류: drawing(5E_image 그림) · exam(5E_hwp 한글 시험지) · sheet(5E_exam 문항·시험지, 1.7.1).
// sheet는 1.7.0의 .exampool(5e-question-sheet-v2) 묶음을 그대로 담는다. 그림은 assets/로 빠지고,
// 학교 양식(bytes)은 forms/<i> 파일로 빠진다. 1.7.0은 sheet를 모르므로 「지원하지 않는 파일」로 거절한다(망가뜨리지 않음).
export const FIVE_E_PROJECT_KINDS = Object.freeze(['drawing','exam','sheet']);
const MAX_FORMS = 50;
function splitForms(payload) {
  if (payload.forms === undefined) return {payload, formFiles:[]};
  if (!Array.isArray(payload.forms) || payload.forms.length > MAX_FORMS) throw new Error('학교 양식 정보가 올바르지 않습니다.');
  const formFiles = [];
  const forms = payload.forms.map((form, i) => {
    if (!form || typeof form !== 'object' || !(form.bytes instanceof Uint8Array) || !form.bytes.length) throw new Error('학교 양식 파일이 올바르지 않습니다.');
    const {bytes, ...meta} = form; if (Object.hasOwn(meta,'file')) throw new Error('예약된 프로젝트 필드입니다.');
    formFiles.push({name:`forms/${i}`, data:bytes});
    return {...meta, file:`forms/${i}`};
  });
  return {payload:{...payload, forms}, formFiles};
}
export function buildFiveEProject({kind='drawing', projectId=crypto.randomUUID(), name='', documentBytes, ...input}) {
  if (!FIVE_E_PROJECT_KINDS.includes(kind) || !idPattern.test(projectId) || typeof name !== 'string' || name.length>200) throw new Error('프로젝트 정보가 올바르지 않습니다.');
  if (kind === 'exam') documentValid(documentBytes);
  if (kind === 'sheet' && (!Array.isArray(input.questions) || typeof input.format !== 'string')) throw new Error('문항 프로젝트 원본이 올바르지 않습니다.');
  const {payload, formFiles} = kind === 'sheet' ? splitForms(input) : {payload:input, formFiles:[]};
  validateWorkspaces(payload);
  const assets=[], seen=new Map();
  const visit = (value, depth=0) => {
    if (depth>100) throw new Error('프로젝트 데이터가 너무 깊습니다.');
    if (typeof value === 'string') {
      const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]*)$/i.exec(value);
      if (!match) return value;
      let index=seen.get(value);
      if (index===undefined) { index=assets.length; seen.set(value,index); assets.push({name:`assets/${index}`,mediaType:match[1],data:bytesFromBase64(match[2])}); }
      return {[ASSET]:index};
    }
    if (Array.isArray(value)) return value.map(item=>visit(item,depth+1));
    if (value && typeof value === 'object') {
      if (Object.hasOwn(value,ASSET)) throw new Error('예약된 프로젝트 필드입니다.');
      return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,depth+1)]));
    }
    return value;
  };
  const data=enc.encode(JSON.stringify(visit(payload)));
  const manifest={format:'5e-project',version:1,kind,projectId,name,assets:assets.map(({name,mediaType})=>({name,mediaType}))};
  const entries=[{name:'manifest.json',data:enc.encode(JSON.stringify(manifest))},{name:'project.json',data},...assets.map(({name,data})=>({name,data}))];
  if (kind==='exam') entries.push({name:'document.hwpx',data:documentBytes});
  entries.push(...formFiles);
  const blob=zipStore(entries);
  if(blob.size>MAX_PROJECT_FILE_BYTES) throw new Error('프로젝트 파일은 최대 128 MiB까지 저장할 수 있습니다.');
  return blob;
}
// A null result is a legacy exam bundle; JSON drawings are handled here too.
export function parseFiveEProject(bytes, validateDrawing=value=>value) {
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(data.length>MAX_PROJECT_FILE_BYTES) throw new Error('프로젝트 파일이 128 MiB를 초과합니다.');
  if(!isZip(data)) { const drawing=JSON.parse(dec.decode(data));validateDrawing(drawing);return {kind:'drawing',drawing}; }
  const files=unzipStore(data,{maxEntryBytes:MAX_PROJECT_FILE_BYTES,maxTotalBytes:MAX_PROJECT_FILE_BYTES}), raw=files.get('manifest.json');
  if(!raw || raw.length>1024*1024) throw new Error('프로젝트 정보가 없습니다.');
  const m=JSON.parse(dec.decode(raw));
  if(m.format==='5e-exam') return null;
  if(m.format!=='5e-project' || m.version!==1 || !FIVE_E_PROJECT_KINDS.includes(m.kind) || !idPattern.test(m.projectId) || typeof m.name!=='string' || m.name.length>200 || !Array.isArray(m.assets) || m.assets.length>9997) throw new Error('지원하는 5E 프로젝트 파일이 아닙니다.');
  const urls=[], names=new Set(); let hydrationBytes=0;
  for(const [i,asset] of m.assets.entries()) {
    if(asset?.name!==`assets/${i}` || !/^image\/[a-z0-9.+-]+$/i.test(asset.mediaType) || names.has(asset.name) || !files.has(asset.name)) throw new Error('프로젝트 이미지가 없거나 올바르지 않습니다.');
    names.add(asset.name); urls.push(`data:${asset.mediaType};base64,${base64(files.get(asset.name))}`);
  }
  const hydrate=(value,depth=0)=>{
    if(depth>100) throw new Error('프로젝트 데이터가 너무 깊습니다.');
    if(Array.isArray(value)) return value.map(v=>hydrate(v,depth+1));
    if(value && typeof value==='object') {
      if(Object.hasOwn(value,ASSET)) {
        const i=value[ASSET]; if(Object.keys(value).length!==1 || !Number.isSafeInteger(i) || !urls[i]) throw new Error('프로젝트 이미지 연결이 올바르지 않습니다.');
        hydrationBytes+=urls[i].length; if(hydrationBytes>512*1024*1024) throw new Error('복원할 이미지 데이터가 너무 큽니다.');
        return urls[i];
      }
      return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,hydrate(v,depth+1)]));
    }
    return value;
  };
  const source=files.get('project.json'); if(!source) throw new Error('프로젝트 원본이 없습니다.');
  const payload=hydrate(JSON.parse(dec.decode(source)));
  validateWorkspaces(payload);
  if(payload.drawing) validateDrawing(payload.drawing);
  if(payload.workspace?.drawing) validateDrawing(payload.workspace.drawing);
  if(m.kind==='drawing' && payload.workspace && !payload.workspace.drawing) payload.workspace.drawing=payload.drawing;
  if(m.kind==='drawing' && !payload.drawing) throw new Error('그림 프로젝트 원본이 없습니다.');
  const documentBytes=m.kind==='exam'?new Uint8Array(files.get('document.hwpx')||[]):undefined;
  if(m.kind==='exam') documentValid(documentBytes);
  if(m.kind==='sheet') {
    if(!Array.isArray(payload.questions) || typeof payload.format!=='string') throw new Error('문항 프로젝트 원본이 없습니다.');
    if(payload.forms!==undefined) {
      if(!Array.isArray(payload.forms) || payload.forms.length>MAX_FORMS) throw new Error('학교 양식 정보가 올바르지 않습니다.');
      payload.forms=payload.forms.map((form,i)=>{
        const bytes=form?.file===`forms/${i}`?files.get(form.file):null;
        if(!bytes?.length) throw new Error('학교 양식 파일이 없거나 올바르지 않습니다.');
        const {file,...meta}=form; return {...meta,bytes:new Uint8Array(bytes)};
      });
    }
  }
  return {...payload,kind:m.kind,name:m.name,projectId:m.projectId,...(documentBytes?{documentBytes}:{})};
}
