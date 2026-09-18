import { createSharingDocument, receiveSharingDocument } from './ai-sharing-document.mjs?v=1.6.0-preview-sharing-0918-2108';
import { idbGet, idbSet } from './idb-store.js?v=1.6.0-preview-labeler-0917-1111';

const DEFAULT_SERVER = 'https://five-e-ai-runtime-probe.onrender.com';
function serverBase() {
  const override = window.fiveEDesktop?.sharingBaseUrl || window.FIVE_E_SHARING_BASE_URL;
  if (override) return override.replace(/\/$/, '');
  return ['127.0.0.1', 'localhost'].includes(location.hostname) ? location.origin : DEFAULT_SERVER;
}
async function request(method, suffix = '', body) {
  if(window.fiveEDesktop?.sharingRequest)return window.fiveEDesktop.sharingRequest({method,suffix,body});
  const response = await fetch(`${serverBase()}/api/shares${suffix}`, {
    method, credentials:'omit', headers:method === 'GET' ? {} : {'X-5E-Request':'1','Content-Type':'application/json'},
    body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(60000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '공유 서버에 연결하지 못했습니다.');
  return result;
}
async function embedImage(src) {
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise((resolve,reject) => {image.onload=resolve;image.onerror=()=>reject(new Error('공유할 이미지 파일을 읽지 못했습니다.'));image.src=src;});
  const canvas = document.createElement('canvas'); canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  canvas.getContext('2d').drawImage(image,0,0);
  return canvas.toDataURL('image/png');
}
function linkFor(id) {
  const desktopBase=window.fiveEDesktop?.sharingBaseUrl;
  if(desktopBase&&/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/.test(desktopBase))return `${desktopBase.replace(/\/$/,'')}/#share=${id}`;
  const local = ['127.0.0.1','localhost'].includes(location.hostname);
  const url = new URL(local || location.hostname === 'www.5e.ai.kr' ? location.href : 'https://www.5e.ai.kr/preview/');
  url.hash=`share=${id}`;
  return url.href;
}

export function initAiSharing(aiPanel) {
  const trigger = document.getElementById('sharing-btn');
  if (!trigger || !aiPanel) return;
  const dialog = document.createElement('dialog'); dialog.className='ai-sharing-dialog';
  dialog.setAttribute('aria-labelledby','ai-sharing-title');
  dialog.innerHTML=`<header><h2 id="ai-sharing-title">AI 작업 문서 공유</h2><button type="button" data-close aria-label="공유 닫기">×</button></header><p>원본·크롭·생성 버전·프롬프트·설정·배치·비교 상태와 작업 목록을 함께 전달합니다.</p><fieldset><legend>받는 사람의 권한</legend><label><input type="radio" name="sharing-mode" value="view" checked> 보기 전용</label><label><input type="radio" name="sharing-mode" value="edit"> 편집 가능</label></fieldset><p class="ai-sharing-note">편집은 받는 사람의 복사본에만 적용됩니다. AI 재실행은 받는 사람의 AI 계정을 사용합니다. 보기 전용은 앱의 편집 제한입니다.</p><p class="ai-sharing-note">링크를 가진 사람은 문서를 받을 수 있습니다. 로그인 쿠키·토큰·인증 세션은 포함하지 않습니다.</p><p class="ai-sharing-note">링크는 생성 후 1시간에 만료됩니다. 임시 서버가 재시작·재배포·휴면되면 만료 전에 삭제될 수 있습니다. <span class="ai-sharing-phrase">수신 저장이 완료되면</span> 링크 만료 후에도 저장한 브라우저에서 <span class="ai-sharing-phrase">이용할 수 있습니다.</span> 브라우저 데이터를 삭제하면 문서도 사라집니다.</p><button type="button" data-create class="primary">링크 만들기</button><label class="ai-sharing-link-label">공유 링크<input data-link type="text" readonly aria-label="공유 링크"></label><div class="ai-sharing-actions"><button type="button" data-copy disabled>링크 복사</button><button type="button" data-revoke disabled>이 링크 공유 해제</button></div><p data-status role="status" aria-live="polite">AI 작업 목록 전체를 하나의 문서로 공유합니다.</p>`;
  document.body.append(dialog);
  const status = dialog.querySelector('[data-status]'), link = dialog.querySelector('[data-link]');
  const create = dialog.querySelector('[data-create]'), copy=dialog.querySelector('[data-copy]'), revoke=dialog.querySelector('[data-revoke]');
  let latest, working=false;
  const error = failure => {
    const message=failure.name==='QuotaExceededError'||/quota/i.test(failure.message) ? '브라우저 저장 공간이 부족해 문서를 저장하지 못했습니다. 공간을 확보한 뒤 다시 받아 주세요.' : failure.message;
    status.textContent=`실패: ${message} 저장 완료 안내가 없으면 새로고침하지 마세요.`;
  };
  const close=()=>dialog.close();
  dialog.querySelector('[data-close]').onclick=close;
  dialog.addEventListener('close',()=>trigger.focus());
  trigger.onclick=async()=>{
    const limited=aiPanel.sharingHasViewOnly();
    dialog.querySelector('[value="edit"]').disabled=limited;
    if(limited) dialog.querySelector('[value="view"]').checked=true;
    dialog.showModal();
    try {
      latest=await idbGet('sharing:latest-sent');
      if(latest){link.value=latest.link;copy.disabled=false;revoke.disabled=false;status.textContent=`최근 링크 · ${latest.mode==='view'?'보기 전용':'편집 가능'} · 만료 ${new Date(latest.expiresAt).toLocaleTimeString('ko-KR')}`;}
    } catch(failure){error(failure);}
  };
  create.onclick=async()=>{
    if(working)return;
    working=true;create.disabled=true;revoke.disabled=true;
    status.textContent='이미지와 AI 작업 상태를 묶어 저장 중…';
    try{
      const snapshot=await aiPanel.sharingSnapshot();
      const mode=aiPanel.sharingHasViewOnly()?'view':dialog.querySelector('[name="sharing-mode"]:checked').value;
      const document=await createSharingDocument(snapshot.workspaces,{mode,activeWorkspace:snapshot.activeWorkspace,embedImage});
      if(!document.workspaces.some(workspace=>workspace.tabs.length))throw new Error('공유할 AI 작업이 없습니다.');
      latest={...await request('POST','',document),mode};latest.link=linkFor(latest.id);
      link.value=latest.link;copy.disabled=false;revoke.disabled=false;
      try{await idbSet('sharing:latest-sent',latest);status.textContent=`링크 준비 완료 · ${mode==='view'?'보기 전용':'편집 가능'} · 만료 ${new Date(latest.expiresAt).toLocaleTimeString('ko-KR')} (임시 서버)`;}
      catch{status.textContent='링크는 생성되었지만 이 브라우저에 공유 해제 정보를 저장하지 못했습니다. 아래 링크를 복사하고 이 창에서 해제하세요.';}
    }catch(failure){error(failure);}
    finally{working=false;create.disabled=false;revoke.disabled=!latest;}
  };
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.value);status.textContent='링크를 복사했습니다.';}catch{link.focus();link.select();status.textContent='자동 복사에 실패했습니다. 선택된 링크를 직접 복사하세요.';}};
  revoke.onclick=async()=>{
    if(!latest||working)return;
    working=true;revoke.disabled=true;
    try{await request('DELETE',`/${latest.id}`,{revokeKey:latest.revokeKey});await idbSet('sharing:latest-sent',null);latest=null;status.textContent='공유를 해제했습니다. 이미 받은 브라우저 복사본은 유지됩니다.';copy.disabled=true;link.value='';}
    catch(failure){error(failure);revoke.disabled=false;}
    finally{working=false;}
  };
  const receive=async()=>{
    const id=/^#share=([a-f0-9]{48})$/.exec(location.hash)?.[1];
    if(!id)return;
    if(!dialog.open)dialog.showModal();
    status.textContent='공유 문서를 받아 이 브라우저에 저장 중…';
    create.disabled=true;
    try{
      const received=await receiveSharingDocument(id,()=>request('GET',`/${id}`),{get:key=>idbGet(`sharing:received:${key}`),set:(key,value)=>idbSet(`sharing:received:${key}`,value)});
      await aiPanel.openSharingDocument(id,received.document);
      const label=received.document.mode==='view'?'보기 전용':'편집 가능 · 내 복사본';
      let badge=document.getElementById('ai-sharing-received');
      if(!badge){badge=document.createElement('span');badge.id='ai-sharing-received';badge.className='ai-sharing-received';trigger.after(badge);}
      badge.textContent=label;badge.title='이 브라우저에 저장 완료. 링크 만료 후에도 사용 가능';
      status.textContent=`브라우저 저장 완료 · ${label}${received.cached?' · 저장된 문서로 열었습니다.':''}`;
      dialog.close();
    }catch(failure){error(failure);}
    finally{create.disabled=false;}
  };
  window.addEventListener('hashchange',()=>void receive());
  void receive();
}
