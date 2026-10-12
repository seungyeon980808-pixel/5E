import { registerEscapeLayer } from '../escape-layers.js?v=1.7.0-four-session-integration';
import { IDENTITY, mapPoint, inverseMatrix, multiplyMatrix, fitThreePoints, sourceFrameMatrix, axisLandmarks, normalizeTraceState, traceMatrixForPlane } from './trace-coordinates.js?v=1.7.0-four-session-integration';

/** Integration contract:
 * const trace=createTraceEditor({toolbarHost,previewHost,reference,initialState,onChange,onInteractionChange});
 * AFTER the graph bbox/viewBox has been measured: trace.attachAfterBBox(svg,previewPlane).
 * clientToWorld/clientToMath must call trace.toGraphPoint(svgWorldPoint) before interpreting coordinates.
 * Capturing pointer events during alignment is handled here; camera handlers should also check trace.isInteracting().
 * getState() contains portable reference+preview registration only; save on the draft plane as graphTrace.
 * destroy() on modal close; Cancel discards the draft. Export renderers must not call this module.
 * reference={data,width,height,plotBox?,name?}; workbench result.source often lacks data, caller supplies reference.
 */
const NS='http://www.w3.org/2000/svg';
const blue='#166bff';
const tintCache=new Map();
let nextId=0;
const clone=v=>structuredClone(v);
const imageNode=(tag, attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
const imageData=r=>r?.data || r?.dataUrl || r?.src;
function loadImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('원본 이미지를 읽을 수 없습니다. 다시 선택하세요.'));img.src=data;});}
async function redReference(reference){
  const data=imageData(reference);if(!data)throw new Error('비교할 원본 이미지를 선택하세요.');
  let promise=tintCache.get(data);
  if(!promise){promise=(async()=>{
    const image=await loadImage(data), max=2400, ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<pixels.data.length;i+=4){const a=pixels.data[i+3]/255;const l=(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2])/255;pixels.data[i]=235;pixels.data[i+1]=47;pixels.data[i+2]=58;pixels.data[i+3]=Math.round(255*a*(1-l));}
    ctx.putImageData(pixels,0,0);const redData=canvas.toDataURL('image/png');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);const mono=ctx.getImageData(0,0,canvas.width,canvas.height);
    for(let i=0;i<mono.data.length;i+=4){const l=Math.round(.2126*mono.data[i]+.7152*mono.data[i+1]+.0722*mono.data[i+2]);mono.data[i]=mono.data[i+1]=mono.data[i+2]=l;}
    ctx.putImageData(mono,0,0);return{data:redData,monoData:canvas.toDataURL('image/png'),width:image.naturalWidth,height:image.naturalHeight};
  })();tintCache.set(data,promise);if(tintCache.size>4)tintCache.delete(tintCache.keys().next().value);}
  try{return await promise;}catch(error){tintCache.delete(data);throw error;}
}
function nonWhitePaint(value){
  if(!value || /^(none|transparent)$/i.test(value.trim()))return false;
  const v=value.trim().toLowerCase();
  if(v==='white'||/^#f{3}(?:f{3})?$/.test(v)||/^rgba?\(\s*255\s*[, ]\s*255\s*[, ]\s*255/.test(v))return false;
  if(v.startsWith('url(')||/^rgba\([^)]*[,/]\s*0(?:\.0*)?\s*\)$/.test(v))return false;
  return true;
}

export function createTraceEditor({ toolbarHost, previewHost, reference=null, initialState=null, onChange=()=>{}, onInteractionChange=()=>{}, onChooseReference=null }={}) {
  if(!toolbarHost||!previewHost)throw new Error('트레이싱 편집 영역이 필요합니다.');
  let state=normalizeTraceState(initialState||{}), ref=reference||initialState?.reference||null;
  let tint=null, svg=null, plane=null, layer=null, sourceLayer=null, disposed=false, loading=false, generation=0;
  let interaction=null, calibration=[], gesture=null, wipeGesture=null, clipGroup=null, clipDefs=null, sourceClip=null, graphClip=null, lastPaint=[], suppressUntil=0;
  const abort=new AbortController(), signal=abort.signal, uid=++nextId;
  const toolbar=document.createElement('div');toolbar.className='gm-trace-toolbar';toolbar.dataset.traceEditor=String(uid);
  toolbar.innerHTML=`<div class="gm-trace-main">
    <label>보기 <select data-trace-view aria-label="그래프 보기"><option value="graph">그래프만</option><option value="side">좌우 비교</option><option value="overlay">겹쳐 비교</option><option value="wipe">바 비교</option></select></label>
    <select data-trace-import aria-label="원본 이미지 불러오기"><option value="">이미지 불러오기</option><option value="library">라이브러리에서 불러오기</option><option value="file">파일 탐색기에서 불러오기</option></select>
    <div class="gm-trace-zoom-control"><button type="button" data-trace-zoom-toggle aria-label="그래프 확대 비율" aria-expanded="false" aria-controls="trace-zoom-${uid}">100%</button>
      <div id="trace-zoom-${uid}" class="gm-trace-zoom-panel" data-escape-layer role="group" aria-label="그래프 확대 조절" hidden>
        <label>보기 배율 <output data-trace-zoom-value>100%</output><input data-trace-zoom type="range" min="50" max="200" step="1" value="100" aria-label="그래프 보기 배율"></label>
        <div class="gm-trace-zoom-actions"><button type="button" data-trace-zoom-reset>100%</button><button type="button" data-trace-zoom-lock aria-pressed="false">배율 고정</button></div>
      </div>
    </div><input type="file" accept="image/*" aria-label="트레이싱 원본 이미지 선택" hidden>
  </div><details class="gm-trace-options"><summary>비교 위치 조정</summary><div class="gm-trace-option-fields"><p class="gm-trace-align-hint">비교 화면에서 편집본의 위치와 크기를 원본에 맞춥니다.</p><div class="gm-trace-tools" hidden><span class="gm-trace-legend"><span class="gm-trace-original">원본</span> / <span class="gm-trace-generated">편집본</span></span><button type="button" data-trace-move>위치 맞추기</button><button type="button" data-trace-calibrate>축 맞추기</button><label>비교 배율 <input data-trace-scale type="number" min="10" max="1000" step="0.1" value="100" aria-label="그래프 정렬 배율">%</label><label data-trace-opacity-field>원본 농도 <input data-trace-opacity type="range" min="0" max="1" step="0.1" aria-label="원본 농도"></label><button type="button" data-trace-reset>조정 초기화</button></div></div></details><p class="gm-trace-status" role="status" aria-live="polite" hidden></p>`;
  toolbarHost.append(toolbar);
  const pane=document.createElement('div');pane.className='gm-trace-source-pane';pane.hidden=true;
  pane.innerHTML='<span class="gm-trace-pane-label">원본</span><img alt="비교용 원본 그래프">';
  // The side pane is a sibling; replacing the preview SVG does not discard it.
  previewHost.parentElement.insertBefore(pane,previewHost);
  const divider=document.createElement('button');divider.type='button';divider.className='gm-trace-divider';divider.hidden=true;
  divider.setAttribute('role','slider');divider.setAttribute('aria-label','원본과 편집본 비교 경계');divider.setAttribute('aria-valuemin','0');divider.setAttribute('aria-valuemax','100');
  divider.innerHTML='<span aria-hidden="true">↔</span>';previewHost.append(divider);
  const wipeLabels=document.createElement('div');wipeLabels.className='gm-trace-wipe-labels';wipeLabels.hidden=true;wipeLabels.innerHTML='<span>원본</span><span>편집본</span>';previewHost.append(wipeLabels);
  const sideImg=pane.querySelector('img'), status=toolbar.querySelector('.gm-trace-status');
  const say=text=>{status.textContent=text;status.hidden=!text;};
  const zoomToggle=toolbar.querySelector('[data-trace-zoom-toggle]'), zoomPanel=toolbar.querySelector('.gm-trace-zoom-panel');
  function closeZoom(restoreFocus=false){zoomPanel.hidden=true;zoomToggle.setAttribute('aria-expanded','false');if(restoreFocus)zoomToggle.focus();}
  const disposeZoomEscape=registerEscapeLayer(zoomPanel,()=>closeZoom(true));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.gm-trace-zoom-control'))closeZoom();},{signal});
  const portable=()=>({...clone(state),...(ref?{reference:clone(ref)}:{})});
  const changed=(options={})=>onChange(portable(),options);
  function setInteraction(value){interaction=value;calibration=[];gesture=null;onInteractionChange(value);sync();}
  function sync(){
    toolbar.querySelector('[data-trace-import]').disabled=loading;
    toolbar.querySelector('[data-trace-import] option[value=library]').disabled=!onChooseReference;
    const view=toolbar.querySelector('[data-trace-view]');view.value=state.mode;view.disabled=loading;
    [...view.options].forEach(o=>o.disabled=o.value!=='graph'&&!tint);
    const zoom=toolbar.querySelector('[data-trace-zoom]'), locked=state.previewZoomLocked;
    zoom.value=String(state.previewZoom);zoom.disabled=locked;
    zoomToggle.textContent=`${state.previewZoom}%${locked?' · 고정':''}`;
    toolbar.querySelector('[data-trace-zoom-value]').textContent=`${state.previewZoom}%`;
    toolbar.querySelector('[data-trace-zoom-lock]').setAttribute('aria-pressed',String(locked));
    toolbar.querySelector('[data-trace-zoom-reset]').disabled=locked;
    toolbar.querySelector('.gm-trace-options').hidden=!tint;
    toolbar.querySelector('.gm-trace-align-hint').textContent=state.mode==='graph' ? '보기에서 비교 방식을 선택한 뒤 편집본의 위치와 크기를 원본에 맞춥니다.' : '비교 화면에서 편집본의 위치와 크기를 원본에 맞춥니다.';
    if (svg) {svg.style.width=`${state.previewZoom || 100}%`;svg.style.height=`${state.previewZoom || 100}%`;svg.style.maxWidth='none';svg.style.flexShrink='0';}
    sideImg.style.width=`${state.previewZoom || 100}%`;sideImg.style.height=`${state.previewZoom || 100}%`;
    const comparing=state.mode!=='graph'&&!!tint;
    toolbar.querySelector('.gm-trace-tools').hidden=!comparing;
    toolbar.querySelector('[data-trace-opacity]').value=String(state.opacity);
    toolbar.dataset.traceView=state.mode;toolbar.querySelector('[data-trace-opacity-field]').hidden=state.mode!=='overlay';
    divider.hidden=wipeLabels.hidden=state.mode!=='wipe'||!tint;syncDivider();
    toolbar.querySelector('[data-trace-move]').setAttribute('aria-pressed',String(interaction==='move'));
    toolbar.querySelector('[data-trace-calibrate]').setAttribute('aria-pressed',String(interaction==='calibrate'));
    toolbar.querySelector('[data-trace-scale]').value=String(Math.round(Math.hypot(state.graphMatrix[0],state.graphMatrix[1])*1000)/10);
    pane.hidden=state.mode!=='side'||!tint;
    previewHost.classList.toggle('gm-trace-comparing',comparing);previewHost.classList.toggle('gm-trace-aligning',!!interaction);
    previewHost.parentElement.classList.toggle('gm-trace-side-layout',state.mode==='side'&&!!tint);
    previewHost.dataset.traceInteraction=interaction||'';
  }
  function restorePaint(){for(const [node,key,value]of lastPaint){if(value===null)node.removeAttribute(key);else node.setAttribute(key,value);}lastPaint=[];}
  function paintInk(color){
    const assign=(node,key,value)=>{lastPaint.push([node,key,node.getAttribute(key)]);node.setAttribute(key,value);};
    assign(layer,'fill',color);assign(layer,'color',color);
    for(const node of layer.querySelectorAll('[stroke],[fill],[style]')){
      if(node.closest('defs,[data-preview-hit],[data-preview-annotation-hit]')||node.hasAttribute('data-trace-layer'))continue;
      const computed=getComputedStyle(node), keys=[];
      for(const key of ['stroke','fill']){
        if((node.hasAttribute(key)||node.style.getPropertyValue(key))&&nonWhitePaint(computed.getPropertyValue(key)))keys.push(key);
      }
      if(!keys.length)continue;
      // Save the exact inline declaration once, including custom properties and priorities.
      // Setting the presentation attribute alone cannot override a selected series' inline stroke.
      lastPaint.push([node,'style',node.getAttribute('style')]);
      for(const key of keys){
        // Retain neutral area shading in black comparisons.
        const paint=computed.getPropertyValue(key),rgb=paint.match(/^rgb[a]?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
        const value=color==='#000'&&key==='fill'&&rgb&&rgb[1]===rgb[2]&&rgb[2]===rgb[3]?paint:color;
        assign(node,key,value);node.style.setProperty(key,value,'important');
      }
    }
  }
  function clearDecoration(){
    restorePaint();
    if(layer?.parentNode){while(layer.firstChild)svg.append(layer.firstChild);layer.remove();}
    sourceLayer?.remove();clipGroup?.remove();clipDefs?.remove();
    sourceLayer=layer=clipGroup=clipDefs=sourceClip=graphClip=null;
  }
  function syncDivider(){
    divider.style.left=`${state.wipePosition*100}%`;divider.setAttribute('aria-valuenow',String(Math.round(state.wipePosition*100)));
    divider.setAttribute('aria-valuetext',`원본 ${Math.round(state.wipePosition*100)}%, 편집본 ${Math.round((1-state.wipePosition)*100)}%`);
    if(!svg||!sourceClip||!graphClip)return;
    const b=svg.viewBox.baseVal,ctm=svg.getScreenCTM(),bounds=previewHost.getBoundingClientRect();
    if(!ctm||!bounds.width)return;
    const p=svg.createSVGPoint();p.x=bounds.left+bounds.width*state.wipePosition;p.y=bounds.top;
    const split=Math.max(b.x,Math.min(b.x+b.width,p.matrixTransform(ctm.inverse()).x));
    for(const [rect,x,width]of[[sourceClip,b.x,split-b.x],[graphClip,split,b.x+b.width-split]]){
      for(const [key,value]of Object.entries({x,y:b.y,width,height:b.height}))rect.setAttribute(key,String(value));
    }
  }
  function refresh(){if(svg&&plane)decorate(svg,plane);sync();}
  function decorate(nextSvg,nextPlane){
    clearDecoration();svg=nextSvg;plane=nextPlane;
    if(divider.parentNode!==previewHost)previewHost.append(divider,wipeLabels);
    if(plane){state.graphMatrix=traceMatrixForPlane(state,plane);state.frame={x:plane.x,y:plane.y,w:plane.w,h:plane.h};}
    if(disposed||!svg||!plane)return;
    const comparing=state.mode!=='graph'&&!!tint;
    if(!comparing){sync();return;}
    layer=imageNode('g',{'data-trace-graph':'true'});
    for(const node of [...svg.children])if(!['defs','style'].includes(node.tagName.toLowerCase())&&!node.hasAttribute('data-trace-layer'))layer.append(node);
    layer.setAttribute('transform',`matrix(${state.graphMatrix.join(' ')})`);svg.append(layer);paintInk(state.mode==='overlay'?blue:'#000');
    if(state.mode==='overlay'||state.mode==='wipe'){
      try{
        const matrix=sourceFrameMatrix(ref,plane),wipe=state.mode==='wipe';
        const image=imageNode('image',{href:wipe?tint.monoData:tint.data,width:ref.width,height:ref.height,transform:`matrix(${matrix.join(' ')})`,'pointer-events':'none','aria-hidden':'true',preserveAspectRatio:'none'});
        sourceLayer=wipe?imageNode('g',{'data-trace-layer':'source','pointer-events':'none','aria-hidden':'true'}):image;
        if(wipe)sourceLayer.append(image);else{sourceLayer.setAttribute('data-trace-layer','source');sourceLayer.setAttribute('opacity',state.opacity);}
        svg.insertBefore(sourceLayer,layer);
        if(wipe){
          clipDefs=imageNode('defs',{'data-trace-layer':'clips'});
          const left=imageNode('clipPath',{id:`trace-source-${uid}`,clipPathUnits:'userSpaceOnUse'}),right=imageNode('clipPath',{id:`trace-edit-${uid}`,clipPathUnits:'userSpaceOnUse'});
          sourceClip=imageNode('rect');graphClip=imageNode('rect');left.append(sourceClip);right.append(graphClip);clipDefs.append(left,right);svg.prepend(clipDefs);
          sourceLayer.setAttribute('clip-path',`url(#trace-source-${uid})`);
          clipGroup=imageNode('g',{'data-trace-layer':'edited-clip','clip-path':`url(#trace-edit-${uid})`});layer.before(clipGroup);clipGroup.append(layer);
        }
      }catch(error){say(error.message);}
    }
    sync();
  }
  async function setReference(value, { isCurrent=()=>true, initializing=false }={}){
    if(disposed)return;
    const ticket=++generation;loading=true;say('원본을 준비하고 있습니다.');sync();
    try{
      const loaded=await redReference(value);if(disposed||ticket!==generation||!isCurrent())return false;
      ref={data:imageData(value),width:loaded.width,height:loaded.height,...(value.plotBox?{plotBox:clone(value.plotBox)}:{}),name:value.name||'원본 그래프',...(value.source?{source:clone(value.source)}:{})};tint=loaded;
      sideImg.src=ref.data;state.mode='graph';state.graphMatrix=[...IDENTITY];setInteraction(null);
      say('');refresh();changed({initial:initializing});return true;
    }catch(error){if(ticket===generation)say(error.message||'원본을 불러오지 못했습니다.');return false;}
    finally{if(ticket===generation){loading=false;sync();}}
  }
  toolbar.querySelector('[data-trace-view]').addEventListener('change',event=>{state.mode=event.target.value;setInteraction(null);refresh();changed();},{signal});
  toolbar.querySelector('[data-trace-import]').addEventListener('change',async event=>{
    const source=event.target.value;event.target.value='';
    if(source==='file') toolbar.querySelector('input[type=file]').click();
    else if(source==='library' && onChooseReference) {try {await onChooseReference(event.target);}catch(error){say(error.message);}}
  },{signal});
  toolbar.querySelector('[data-trace-zoom]').addEventListener('input',event=>{
    if(state.previewZoomLocked){sync();return;}
    const value=Number(event.target.value);if(!Number.isFinite(value))return;
    state.previewZoom=Math.max(50,Math.min(200,value));sync();syncDivider();changed({preview:true});
  },{signal});
  zoomToggle.addEventListener('click',()=>{if(zoomPanel.hidden)zoomToggle.focus();zoomPanel.hidden=!zoomPanel.hidden;zoomToggle.setAttribute('aria-expanded',String(!zoomPanel.hidden));if(!zoomPanel.hidden)toolbar.querySelector(state.previewZoomLocked?'[data-trace-zoom-lock]':'[data-trace-zoom]').focus();},{signal});
  toolbar.addEventListener('click',async event=>{
    if(event.target.closest('[data-trace-zoom-lock]')){state.previewZoomLocked=!state.previewZoomLocked;sync();changed({preview:true});}
    if(event.target.closest('[data-trace-zoom-reset]')&&!state.previewZoomLocked){state.previewZoom=100;sync();syncDivider();changed({preview:true});}
    if(event.target.closest('[data-trace-move]')){setInteraction(interaction==='move'?null:'move');say(interaction?'그래프를 드래그하거나 방향키로 위치를 맞추세요. Esc: 완료':'');}
    if(event.target.closest('[data-trace-calibrate]')){if(state.mode!=='overlay'){state.mode='overlay';refresh();}setInteraction(interaction==='calibrate'?null:'calibrate');say(interaction?'원본 축 교점을 클릭하세요.':'');}
    if(event.target.closest('[data-trace-reset]')){state.graphMatrix=[...IDENTITY];setInteraction(null);refresh();changed();say('정렬을 초기화했습니다.');}
  },{signal});
  toolbar.querySelector('[data-trace-opacity]').addEventListener('input',event=>{state.opacity=Number(event.target.value);if(sourceLayer&&state.mode==='overlay')sourceLayer.setAttribute('opacity',state.opacity);changed();},{signal});
  toolbar.querySelector('[data-trace-scale]').addEventListener('change',event=>{
    const scale=Number(event.target.value)/100;if(!Number.isFinite(scale)||scale<.1||scale>10){sync();return;}
    const old=Math.hypot(state.graphMatrix[0],state.graphMatrix[1]);const ratio=scale/old;
    const origin=mapPoint(state.graphMatrix,axisLandmarks(plane).points[0]);
    state.graphMatrix=multiplyMatrix([ratio,0,0,ratio,origin.x*(1-ratio),origin.y*(1-ratio)],state.graphMatrix);refresh();changed();
  },{signal});
  toolbar.querySelector('input[type=file]').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>25*1024*1024){say('25MB 이하의 원본 이미지를 선택하세요.');event.target.value='';return;}
    const reader=new FileReader();reader.onload=()=>void setReference({data:String(reader.result),name:file.name});reader.onerror=()=>say('파일을 읽지 못했습니다.');reader.readAsDataURL(file);event.target.value='';
  },{signal});
  function world(event){const ctm=svg?.getScreenCTM();if(!ctm)return null;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(ctm.inverse());}
  function block(event){event.preventDefault();event.stopImmediatePropagation();}
  previewHost.addEventListener('pointerdown',event=>{
    if(event.target.closest('.gm-trace-divider'))return;
    if(!interaction||event.button!==0||!plane)return;suppressUntil=performance.now()+600;block(event);const p=world(event);if(!p)return;
    if(interaction==='calibrate'){
      calibration.push({x:p.x,y:p.y});const landmarks=axisLandmarks(plane);
      if(calibration.length===1)say(`원본 X축의 ${landmarks.xEnd} 프레임 경계를 클릭하세요. 화살촉 끝이 아닌 좌표 영역 경계입니다.`);
      else if(calibration.length===2)say(`원본 Y축의 ${landmarks.yEnd} 프레임 경계를 클릭하세요.`);
      else{try{state.graphMatrix=fitThreePoints(landmarks.points,calibration);setInteraction(null);refresh();changed();say('세 기준점에 그래프를 맞췄습니다. 수학적 좌표는 유지됩니다.');}catch(error){calibration=[];say(`${error.message} 원본 축 교점부터 다시 선택하세요.`);}}
    }else gesture={start:p,matrix:[...state.graphMatrix],pointerId:event.pointerId};
  },{capture:true,signal});
  for(const name of ['mousedown','click','dblclick'])previewHost.addEventListener(name,event=>{if(event.target.closest('.gm-trace-divider')||interaction||performance.now()<suppressUntil)block(event);},{capture:true,signal});
  window.addEventListener('pointermove',event=>{if(!gesture||event.pointerId!==gesture.pointerId)return;const p=world(event);if(!p)return;block(event);state.graphMatrix=[...gesture.matrix];state.graphMatrix[4]+=p.x-gesture.start.x;state.graphMatrix[5]+=p.y-gesture.start.y;layer?.setAttribute('transform',`matrix(${state.graphMatrix.join(' ')})`);},{capture:true,signal});
  window.addEventListener('pointerup',event=>{if(!gesture||event.pointerId!==gesture.pointerId)return;block(event);gesture=null;changed();},{capture:true,signal});
  window.addEventListener('pointercancel',()=>{if(gesture){state.graphMatrix=gesture.matrix;gesture=null;refresh();}},{signal});
  function moveDivider(clientX){const b=previewHost.getBoundingClientRect();if(b.width){state.wipePosition=Math.max(0,Math.min(1,(clientX-b.left)/b.width));syncDivider();}}
  divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;block(event);divider.focus();wipeGesture={pointerId:event.pointerId,start:state.wipePosition};divider.setPointerCapture(event.pointerId);onInteractionChange('wipe');},{signal});
  divider.addEventListener('pointermove',event=>{if(wipeGesture?.pointerId===event.pointerId){block(event);moveDivider(event.clientX);}},{signal});
  divider.addEventListener('pointerup',event=>{if(wipeGesture?.pointerId===event.pointerId){block(event);moveDivider(event.clientX);wipeGesture=null;onInteractionChange(interaction);changed();}},{signal});
  divider.addEventListener('pointercancel',()=>{if(wipeGesture){state.wipePosition=wipeGesture.start;wipeGesture=null;syncDivider();onInteractionChange(interaction);}},{signal});
  divider.addEventListener('keydown',event=>{
    const step=event.shiftKey?.1:.01;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){block(event);state.wipePosition=event.key==='Home'?0:event.key==='End'?1:Math.max(0,Math.min(1,state.wipePosition+(event.key==='ArrowRight'?step:-step)));syncDivider();changed();}
  },{signal});
  const resizeObserver=new ResizeObserver(syncDivider);resizeObserver.observe(previewHost);
  function cancelInteraction() {
    if(wipeGesture){state.wipePosition=wipeGesture.start;wipeGesture=null;syncDivider();onInteractionChange(interaction);return;}
    if (!interaction) return;
    if (gesture) state.graphMatrix = gesture.matrix;
    setInteraction(null); refresh(); say('정렬 조작을 마쳤습니다.');
  }
  document.addEventListener('keydown',event=>{
    if(event.target.closest?.('.gm-trace-divider')&&event.key!=='Escape')return;
    if(!interaction&&!wipeGesture)return;
    if(event.key==='Escape'){block(event);cancelInteraction();return;}
    if(interaction==='move'&&!/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      block(event);const step=Math.min(plane.w,plane.h)*(event.shiftKey?.01:.001);state.graphMatrix[4]+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;state.graphMatrix[5]+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;refresh();changed();
    }
  },{capture:true,signal});
  // Initial decode preserves a saved matrix/mode, unlike replacing the reference.
  if(ref){const saved=clone(state);void setReference(ref,{initializing:true}).then(()=>{if(!disposed&&tint){state=saved;if(!initialState?.mode)state.mode='graph';refresh();changed({initial:true});}});}else{say('');sync();}
  return {
    decorate,attachAfterBBox:decorate,setReference,getState:portable,
    isInteracting:()=>!!interaction||!!wipeGesture,cancelInteraction,
    toGraphPoint:p=>p&&state.mode!=='graph'&&tint?mapPoint(inverseMatrix(state.graphMatrix),p):p,
    getGraphMatrix:()=>state.mode!=='graph'&&tint?[...state.graphMatrix]:[...IDENTITY],
    destroy(){disposed=true;generation++;abort.abort();disposeZoomEscape();resizeObserver.disconnect();clearDecoration();pane.remove();toolbar.remove();divider.remove();wipeLabels.remove();previewHost.classList.remove('gm-trace-comparing','gm-trace-aligning');previewHost.parentElement?.classList.remove('gm-trace-side-layout');delete previewHost.dataset.traceInteraction;}
  };
}
