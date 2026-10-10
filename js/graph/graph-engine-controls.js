import { appendDisplayHeading, syncDisplayProperties } from './display-workspace.js?v=1.7.0-four-session-integration';
/* Graph capability controls shared by creation and native reconstruction editing. */
import { EXAM_STYLE, isExamStyle, examMetrics, graphSizeAdvice } from './exam-style.js?v=1.7.0-four-session-integration';
import { createRegionPreviewEditor } from './graph-region-editor.js?v=1.7.0-four-session-integration';
const copy = value => structuredClone(value);
export const ENGINE_PLANE_FIELDS = ['xScale', 'yScale', 'axisArrowX', 'axisArrowY', 'axisArrowY2', 'axisArrowLength', 'axisArrowWidth', 'strokeWidth', 'boxTickTop', 'boxTickRight'];
export const ENGINE_SERIES_FIELDS = ['lineVisible', 'markerShape', 'markerSize', 'markerStrokeWidth', 'dashPattern', 'fit', 'originalMathPoints', 'observedOriginalPoints', 'fitChangedIndices','styleOverrides'];

export function applyEngineCfg(plane, cfg) {
  Object.assign(plane, copy(cfg.engine || {}));
  if (cfg.engineBounds) { Object.assign(plane, cfg.engineBounds); plane.graphEngineBounds = true; }
  if (cfg.engineY2 && cfg.y2On) plane.y2 = { ...plane.y2, enabled: true, ...copy(cfg.engineY2) };
  // A box is a frame, rather than an extra curve or a forced zero crossing.
  if (cfg.variant === 'box') plane.axisVariant = 'box';
  if (cfg.guideStyle) plane.guideStyle = copy(cfg.guideStyle);
  if (cfg.graphStyle) plane.graphStyle = copy(cfg.graphStyle);
  return plane;
}

export function validateEnginePlane(plane) {
  for (const axis of ['x', 'y']) {
    const min = plane[`${axis}Min`], max = plane[`${axis}Max`];
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return `${axis}축 최대값은 최소값보다 커야 합니다.`;
    if (plane[`${axis}Scale`] === 'log' && min <= 0) return `${axis} 로그축 범위는 0보다 커야 합니다.`;
  }
  if (plane.y2?.enabled && (!Number.isFinite(plane.y2.y2Min) || !Number.isFinite(plane.y2.y2Max) || plane.y2.y2Max <= plane.y2.y2Min || (plane.y2.scale === 'log' && plane.y2.y2Min <= 0))) return '오른쪽 축의 범위와 로그축 양수 조건을 확인하세요.';
  return null;
}

export function seriesFeatureFields(series) {
  return Object.fromEntries(ENGINE_SERIES_FIELDS.filter(k => series[k] !== undefined).map(k => [k, copy(series[k])]));
}

export function mountEngineControls(overlay, api) {
  const regionEditor = createRegionPreviewEditor(api);
  const coord = document.createElement('div'); coord.className = 'gm-group'; coord.id = 'gm-engine-controls';
  coord.innerHTML = `<div class="gm-axis-options">
    <fieldset class="gm-axis-option-group"><legend>축 스케일</legend>
      ${['x','y'].map(a=>`<label class="gm-axis-option-field"><span>${a.toUpperCase()}축</span><select class="gm-num" id="gm-engine-${a}-scale" aria-label="${a}축 스케일"><option value="linear">선형</option><option value="log">로그</option></select></label>`).join('')}
    </fieldset>
    <fieldset class="gm-axis-option-group"><legend>축 선</legend>
      <label class="gm-axis-option-field" for="gm-engine-strokeWidth"><span>굵기 · mm</span><input class="gm-num" id="gm-engine-strokeWidth" type="number" min="0.01" step="any" aria-label="축 선 굵기(mm)"></label>
    </fieldset>
    <fieldset class="gm-axis-option-group"><legend>화살촉</legend>
      <div class="gm-checks">${['X','Y','Y2'].map(a => `<label class="gm-check"><input id="gm-engine-arrow-${a}" type="checkbox" aria-label="${a}축 화살표">${a}축</label>`).join('')}</div>
    </fieldset>
    <fieldset class="gm-axis-option-group"><legend>박스 추가 눈금</legend>
      <div class="gm-checks">${[['boxTickTop','위쪽'],['boxTickRight','오른쪽']].map(([k,l]) => `<label class="gm-check"><input id="gm-engine-${k}" type="checkbox" aria-label="박스 ${l} 눈금">${l}</label>`).join('')}</div>
    </fieldset>
    </div>
    <details class="gm-detail" id="gm-style-detail"><summary>추천 비율 개별 조정</summary>
      <div class="gm-row"><label class="gm-row-lbl" for="gm-engine-arrowScale">화살촉 크기</label><div class="gm-row-body"><input class="gm-num" id="gm-engine-arrowScale" type="number" min="25" max="300" step="any" aria-label="화살촉 크기(%)"><span class="gm-unit">%</span></div></div>
      <p class="gm-ax-note">화살촉의 형태와 가로세로 비율은 고정됩니다. 축 굵기를 바꾸면 선·눈금·라벨도 함께 바뀝니다.</p>
    </details>`;
  const styleControls=document.createElement('section');styleControls.id='gm-style-controls';styleControls.className='gm-group';
  styleControls.innerHTML=`<label class="gm-check"><input id="gm-style-recommended" type="checkbox"> 기출 추천 비율 사용</label>
    <div class="gm-row"><label class="gm-row-lbl" for="gm-output-width">축 영역 폭</label><div class="gm-row-body"><input id="gm-output-width" class="gm-num" type="number" min="20" max="200" step="any" aria-label="그래프 축 영역 폭(mm)" title="라벨을 제외한 축 영역의 폭. 선·글자도 같은 비율로 조절합니다."><span class="gm-unit">mm</span></div></div>
    <p id="gm-size-advice" class="gm-ax-note" role="status"></p>`;
  overlay.querySelector('#gm-adv-open').before(styleControls);
  overlay.querySelector('#gm-adv-panel').append(coord);
  const selected = document.createElement('div'); selected.className = 'gm-group'; selected.id = 'gm-engine-series';
  selected.innerHTML = `<div id="gm-engine-point-appearance"><p class="gm-group-h">점 모양</p><label class="gm-check"><input id="gm-engine-line" type="checkbox"> 점을 선으로 연결</label>
    <div class="gm-row"><label class="gm-row-lbl" for="gm-engine-marker">모양</label><div class="gm-row-body"><select class="gm-num" id="gm-engine-marker" aria-label="계열 점 모양"><option value="none">없음</option><option value="circle">●</option><option value="open-circle">○</option><option value="cross">×</option><option value="plus">＋</option><option value="square">■</option></select></div></div>
    <div class="gm-row"><label class="gm-row-lbl" for="gm-engine-marker-size">반지름 (mm)</label><div class="gm-row-body"><input class="gm-num" id="gm-engine-marker-size" type="number" min="0.01" step="any" aria-label="계열 점 반지름(mm)"></div></div>
    <div class="gm-row"><label class="gm-row-lbl" for="gm-engine-marker-stroke">선 굵기 (mm)</label><div class="gm-row-body"><input class="gm-num" id="gm-engine-marker-stroke" type="number" min="0.01" step="any" aria-label="계열 점 선 굵기(mm)"></div></div></div>
    <details class="gm-detail" id="gm-engine-data-details"><summary>데이터 표 붙여넣기</summary><label>데이터 표<textarea class="gm-num" id="gm-engine-data" aria-label="계열 데이터 표" placeholder="x와 y 두 열을 붙여넣으세요" rows="3"></textarea></label><button id="gm-engine-data-apply" type="button" class="modal-btn">데이터 적용</button></details>
    <details class="gm-detail" id="gm-engine-fit-details"><summary>관찰 곡선 맞춤</summary><div><div class="gm-row"><label class="gm-row-lbl" for="gm-engine-fit-tolerance">허용 오차</label><div class="gm-row-body"><input class="gm-num" id="gm-engine-fit-tolerance" type="number" min="0" max="100" step="0.1" value="1" aria-label="곡선 맞춤 허용 오차(%)"><span class="gm-unit">%</span></div></div><button id="gm-engine-fit" type="button" class="modal-btn">관찰 곡선 매끄럽게</button><button id="gm-engine-fit-restore" type="button" class="modal-btn">관찰점 복구</button></div></details>
    <details class="gm-detail" id="gm-engine-bar-details"><summary>막대별 회색 농도</summary><label id="gm-engine-bar-row">회색 값 목록<input class="gm-num" id="gm-engine-bar-levels" aria-label="막대별 회색 농도" placeholder="0~255, 예: 170,255,170,255"></label></details>`;
  overlay.querySelector('#gm-series-editor').append(selected);
  const regions = document.createElement('div'); regions.className = 'gm-group'; regions.id = 'gm-engine-regions';
  regions.innerHTML = '<p class="gm-group-h">회색 강조영역</p><button type="button" id="gm-engine-region-add" class="modal-btn">영역 추가</button><div id="gm-engine-region-list"></div>';
  overlay.querySelector('#gm-tab-annot').append(regions);
  const get = id => overlay.querySelector(`#${id}`);
  get('gm-engine-region-list').classList.add('gm-display-section');
  overlay.querySelector('#gm-display-list')?.append(get('gm-engine-region-list'));
  const barControls=document.createElement('div');barControls.id='gm-engine-bar-sliders';barControls.className='gm-engine-bar-sliders';
  get('gm-engine-bar-row').before(barControls);
  const changed = () => { api.onChange(); sync(); };
  function engineWrite(key, value) { (api.getCfg().engine ||= {})[key] = value; }
  for (const a of ['x','y']) get(`gm-engine-${a}-scale`).onchange = e => { engineWrite(`${a}Scale`,e.target.value); changed(); };
  for (const a of ['X','Y','Y2']) get(`gm-engine-arrow-${a}`).onchange = e => { engineWrite(`axisArrow${a}`,e.target.checked); changed(); };
  for (const k of ['boxTickTop','boxTickRight']) get(`gm-engine-${k}`).onchange = e => { engineWrite(k,e.target.checked); changed(); };
  get('gm-output-width').onchange=e=>{const v=Number(e.target.value);if(!e.target.value.trim()||!Number.isFinite(v)||v<20||v>200){e.target.setCustomValidity('20~200 mm의 출력 폭을 입력하세요.');return;}e.target.setCustomValidity('');api.getCfg().outputWidth=v;changed();};
  get('gm-style-recommended').onchange=e=>{const cfg=api.getCfg();cfg.graphStyle=e.target.checked?{preset:EXAM_STYLE.preset,referenceWidth:api.getPlane().w}:undefined;changed();};
  get('gm-engine-strokeWidth').onchange=e=>{const v=Number(e.target.value);if(!e.target.value.trim()||!Number.isFinite(v)||v<=0){e.target.setCustomValidity('0보다 큰 굵기를 입력하세요.');return;}e.target.setCustomValidity('');const cfg=api.getCfg();if(cfg.graphStyle)cfg.graphStyle.strokeScale=v/(EXAM_STYLE.axis*api.getPlane().w/EXAM_STYLE.referenceWidth);else engineWrite('strokeWidth',v);changed();};
  get('gm-engine-arrowScale').onchange=e=>{const v=Number(e.target.value);if(!e.target.value.trim()||!Number.isFinite(v)||v<25||v>300){e.target.setCustomValidity('25~300%의 크기를 입력하세요.');return;}e.target.setCustomValidity('');const cfg=api.getCfg();cfg.graphStyle ||= {preset:EXAM_STYLE.preset,referenceWidth:api.getPlane().w};cfg.graphStyle.arrowScale=v/100;changed();};
  get('gm-engine-line').onchange=e=>{const s=api.getSelected();if(s){s.lineVisible=e.target.checked;changed();}};
  get('gm-engine-marker').onchange=e=>{const s=api.getSelected();if(s){s.markerShape=e.target.value;changed();}};
  for(const [id,key]of[['marker-size','markerSize'],['marker-stroke','markerStrokeWidth']])get(`gm-engine-${id}`).onchange=e=>{const s=api.getSelected(),v=Number(e.target.value);if(!s)return;if(!e.target.value.trim()||!Number.isFinite(v)||v<=0){e.target.setCustomValidity('0보다 큰 크기를 입력하세요.');return;}e.target.setCustomValidity('');s[key]=v;(s.styleOverrides ||= {})[key]={value:v,width:api.getPlane().w};changed();};
  get('gm-engine-dash-pattern').onchange=e=>{const s=api.getSelected();if(!s)return;const text=e.target.value.trim(),values=text?text.split(/[ ,]+/).map(Number):[];if(values.length&&(values.length<2||values.length>12||values.some(v=>!Number.isFinite(v)||v<=0))){e.target.setCustomValidity('0보다 큰 길이를 2~12개 입력하세요.');return;}e.target.setCustomValidity('');if(values.length)s.dashPattern=values;else delete s.dashPattern;changed();};
  get('gm-engine-data-apply').onclick=()=>{
    const input=get('gm-engine-data'),s=api.getSelected();if(!s||s.kind!=='points')return;
    const rows=input.value.trim().split(/\r?\n/).filter(t=>t.trim()).map(t=>t.trim().split(/[\t;, ]+/).filter(Boolean).map(Number));
    if(!rows.length||rows.some(r=>r.length!==2||r.some(v=>!Number.isFinite(v)))){input.setCustomValidity('각 행에 x, y 두 숫자를 입력하세요.');input.reportValidity();return;}
    input.setCustomValidity('');api.onData(s,rows.map(([x,y])=>({x,y})));changed();
  };
  get('gm-engine-fit').onclick=()=>{const input=get('gm-engine-fit-tolerance');if(!input.checkValidity()){input.reportValidity();return;}const v=Number(input.value)/100;api.onFit(v);sync();};
  get('gm-engine-fit-restore').onclick=()=>{api.onRestore();sync();};
  get('gm-engine-bar-levels').onchange=e=>{const s=api.getSelected();if(!s||s.kind!=='bar')return;const values=e.target.value.trim()?e.target.value.split(',').map(t=>Number(t.trim())):[];if(values.length&& (values.length!==s.items.length||values.some(v=>!Number.isFinite(v)||v<0||v>255))){e.target.setCustomValidity('막대 수만큼 0~255 농도를 입력하세요.');return;}e.target.setCustomValidity('');s.items.forEach((it,i)=>{if(values.length)it.fillLevel=values[i];else delete it.fillLevel;});changed();};
  let activeRegion=null, preview=null;
  function setActiveRegion(spec){
    const next=(api.getCfg()?.regions||[]).includes(spec)?spec:null;
    if(activeRegion===next && (!next || regionEditor.isSelected(next)))return;
    if(next){if(!regionEditor.isSelected(next))regionEditor.select(next);}
    else if(activeRegion && regionEditor.isSelected(activeRegion))regionEditor.select(activeRegion);
    activeRegion=next;
  }
  function selectRegion(spec){
    setActiveRegion(spec);
    syncRegions(false);
    if(preview){
      const {svg,plane,series,enabled}=preview;
      svg.querySelectorAll('[data-region-editor]').forEach(el=>el.remove());
      svg.querySelectorAll('[data-region-hit]').forEach(el=>el.setAttribute('aria-pressed',String(Number(el.dataset.regionHit)===(api.getCfg().regions||[]).indexOf(activeRegion))));
      regionEditor.render(svg,plane,series,enabled);
    }
  }
  function requestRegionSelection(spec){
    if(api.onSelectRegion)api.onSelectRegion(spec);
    selectRegion(api.getSelectedRegion?api.getSelectedRegion():spec);
  }
  get('gm-engine-region-add').onclick=()=>{const cfg=api.getCfg(),p=api.getPlane(),r={id:`region-${Date.now()}`,kind:'x-band',axis:'y',coordinateSpace:'data',from:p.xMin+(p.xMax-p.xMin)*.4,to:p.xMin+(p.xMax-p.xMin)*.45,level:180,opacity:1};(cfg.regions ||= []).push(r);if(api.onRegionAdded)api.onRegionAdded(r);else requestRegionSelection(r);selectRegion(api.getSelectedRegion?api.getSelectedRegion():r);changed();};
  let lastRegionState='', lastRegionCfg=null;
  function syncRegions(readSelection=true){
    if(readSelection && api.getSelectedRegion)setActiveRegion(api.getSelectedRegion());
    else if(activeRegion && !(api.getCfg().regions||[]).includes(activeRegion))setActiveRegion(null);
    const specs=api.getCfg().regions||[],signature=JSON.stringify([specs.map(r=>[r.id,r.objectId,r.kind,r.axis,r.coordinateSpace,regionEditor.isSelected(r)]),api.getSeries().map(s=>[s.objectId,s.reconstruction?.seriesId,s.endLabel])]);
    const host=get('gm-engine-region-list'), properties=get('gm-region-properties');
    if(signature===lastRegionState && lastRegionCfg===api.getCfg()){
      properties.querySelectorAll('[data-region-field]').forEach(input=>{
        if(document.activeElement===input)return;
        const r=specs[Number(input.dataset.regionIndex)],k=input.dataset.regionField;
        if(k==='points')input.value=(r.points||[]).map(p=>`${p.x},${p.y}`).join(' ');
        else if(input.tagName==='SELECT')input.value=r[k]??(k.endsWith('SeriesId')?'':input.options[0].value);
        else input.value=Number.isFinite(r[k])?String(Number(r[k].toPrecision(6))):r[k]??(k==='opacity'?1:k==='level'?180:'');
      });return;
    }
    lastRegionState=signature;lastRegionCfg=api.getCfg();host.replaceChildren();properties.replaceChildren();
    specs.forEach((r,i)=>{
      const row=document.createElement('div');row.className='gm-display-item gm-engine-region-row';row.dataset.displayKey=`region:${r.id??i}`;row.classList.toggle('is-selected',regionEditor.isSelected(r));
      const title=document.createElement('button');title.type='button';title.className='gm-region-select gm-display-select';
      const kindNames={'x-band':'세로 띠','y-band':'가로 띠',rect:'사각형',polygon:'다각형',between:'두 곡선 사이'};
      title.textContent=`영역 ${i+1} · ${kindNames[r.kind]||'영역'}`;
      title.setAttribute('aria-label',`영역 ${i+1} 화면에서 조절`);title.setAttribute('aria-expanded',String(regionEditor.isSelected(r)));title.setAttribute('aria-pressed',String(regionEditor.isSelected(r)));
      title.setAttribute('aria-controls',`gm-region-fields-${i}`);title.onclick=()=>{requestRegionSelection(r);host.querySelectorAll('.gm-region-select')[i]?.focus({preventScroll:true});};
      row.style.setProperty('--gm-element-color','#7865d0');
      appendDisplayHeading(row,title,`영역 ${i+1}`,()=>{if(regionEditor.isSelected(r))requestRegionSelection(null);api.getCfg().regions.splice(i,1);changed();});
      title.onmousedown=e=>{e.preventDefault();e.stopPropagation();title.onclick();};
      const editor=document.createElement('div');editor.className='gm-region-editor';editor.id=`gm-region-fields-${i}`;editor.hidden=!regionEditor.isSelected(r);editor.dataset.regionId=r.id;properties.append(editor);
      const precise=document.createElement('details');precise.className='gm-detail gm-engine-region-exact';
      const summary=document.createElement('summary');summary.textContent='정확한 위치·좌표';precise.append(summary);
      const fields=document.createElement('div');fields.className='gm-engine-region-fields';precise.append(fields);
      const addSelect=(key,label,options,parent=editor)=>{
        const l=document.createElement('label');l.textContent=label;
        const input=document.createElement('select');input.className='gm-num';input.dataset.regionField=key;input.dataset.regionIndex=i;
        input.setAttribute('aria-label',`영역 ${i+1} ${label}`);
        for(const[value,text]of options){const o=document.createElement('option');o.value=value;o.textContent=text;input.append(o);}
        input.value=r[key]??(key.endsWith('SeriesId')?'':options[0][0]);
        input.onchange=()=>{
          r[key]=input.value;
          if(key==='kind'){
            const p=api.getPlane(),n=r.coordinateSpace==='normalized',xmin=n?0:p.xMin,xmax=n?1:p.xMax,ymin=n?0:p.yMin,ymax=n?1:p.yMax;
            if(['x-band','y-band','between'].includes(r.kind)){r.from=r.kind==='y-band'?ymin:xmin;r.to=r.kind==='y-band'?ymax:xmax;}
            else if(r.kind==='rect')Object.assign(r,{xMin:xmin,xMax:xmax,yMin:ymin,yMax:ymax});
            else if(r.kind==='polygon')r.points=[{x:xmin,y:ymin},{x:xmax,y:ymin},{x:xmax,y:ymax}];
            if(r.kind==='between'){
              const curves=api.getSeries().filter(s=>s.kind!=='bar').map((s,j)=>s.reconstruction?.seriesId||s.seriesId||s.objectId||`series-${j+1}`);
              if(curves.length){r.upperSeriesId ||= curves[0];r.lowerSeriesId ||= curves[1]||curves[0];}
            }
          }
          changed();
        };
        l.append(input);parent.append(l);
      };
      addSelect('kind','종류',[['x-band','세로 띠'],['y-band','가로 띠'],['rect','사각형'],['polygon','다각형'],['between','두 곡선 사이']]);
      addSelect('axis','읽는 축',[['y','왼쪽'],['y2','오른쪽']],fields);addSelect('coordinateSpace','좌표',[['data','데이터'],['normalized','영역 비율']],fields);
      const keys=r.kind==='rect'?['xMin','xMax','yMin','yMax','level','opacity']:r.kind==='polygon'?['level','opacity']:['from','to','level','opacity'];
      for(const key of keys){const label=document.createElement('label');label.textContent=({from:'시작',to:'끝',level:'회색 값',opacity:'불투명도'})[key]||key;const input=document.createElement('input');input.type='number';input.step='any';input.style.width='70px';input.className='gm-num';input.dataset.regionField=key;input.dataset.regionIndex=i;input.setAttribute('aria-label',`영역 ${i+1} ${key}`);input.value=r[key]??(key==='opacity'?1:key==='level'?180:0);input.onchange=()=>{const v=Number(input.value);if(!input.value.trim()||!Number.isFinite(v)||(key==='level'&&(v<0||v>255))||(key==='opacity'&&(v<0||v>1))){input.setCustomValidity('범위 안의 유효한 값을 입력하세요.');return;}input.setCustomValidity('');r[key]=v;api.onChange();};label.append(input);(key==='level'||key==='opacity'?editor:fields).append(label);if(key==='level'||key==='opacity')label.className='gm-engine-region-tone';}
      if(r.kind==='polygon'){const input=document.createElement('textarea');input.rows=2;input.style.width='100%';input.className='gm-num';input.dataset.regionField='points';input.dataset.regionIndex=i;input.setAttribute('aria-label',`영역 ${i+1} 꼭짓점`);input.value=(r.points||[]).map(p=>`${p.x},${p.y}`).join(' ');input.onchange=()=>{const pairs=input.value.trim().split(/\s+/).map(t=>t.split(',').map(Number));if(pairs.length<3||pairs.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v)))){input.setCustomValidity('꼭짓점을 x,y 형식으로 3개 이상 입력하세요.');return;}input.setCustomValidity('');r.points=pairs.map(([x,y])=>({x,y}));api.onChange();};fields.append(input);}
      if(r.kind==='between'){const options=api.getSeries().filter(s=>s.kind!=='bar').map((s,j)=>[s.reconstruction?.seriesId||s.seriesId||s.objectId||`series-${j+1}`,s.endLabel||`계열 ${j+1}`]);if(options.length){addSelect('upperSeriesId','첫 곡선',options);addSelect('lowerSeriesId','둘째 곡선',options);}}
      const note=document.createElement('p');note.className='gm-ax-note';note.textContent=regionEditor.isSelected(r)?'미리보기의 파란 손잡이를 끌어 조절하세요. Esc는 이번 드래그를 취소합니다.':'회색 값: 0은 검정, 255는 흰색';editor.append(note,precise);
      host.append(row);
    });
    syncDisplayProperties(overlay);
  }
  let barSeries=null,barCount=-1;
  function syncBars(s){
    barControls.hidden=s?.kind!=='bar';if(barControls.hidden)return;
    if(barSeries!==s||barCount!==s.items.length){
      barSeries=s;barCount=s.items.length;barControls.replaceChildren();
      s.items.forEach((it,i)=>{
        const label=document.createElement('label');label.className='gm-engine-bar-tone';label.textContent=`${it.label||`막대 ${i+1}`} · 회색 값`;
        const input=document.createElement('input');input.type='number';input.className='gm-num';input.min=0;input.max=255;input.step='any';input.value=it.fillLevel??170;input.dataset.barIndex=i;input.setAttribute('aria-label',`막대 ${i+1} 회색 값`);
        input.onchange=()=>{const n=Number(input.value);if(!input.value.trim()||!Number.isFinite(n)||n<0||n>255){input.setCustomValidity('0~255 회색 값을 입력하세요.');return;}input.setCustomValidity('');it.fillLevel=n;changed();};
        label.append(input);barControls.append(label);
      });
    }
    barControls.querySelectorAll('[data-bar-index]').forEach(input=>{if(document.activeElement!==input)input.value=s.items[Number(input.dataset.barIndex)].fillLevel??170;});
  }
  function sync(){
    const cfg=api.getCfg();if(!cfg)return;const p=api.getPlane(),e=cfg.engine||{},s=api.getSelected();
    const set=(id,value)=>{const input=get(id);if(document.activeElement!==input)input.value=Number.isFinite(value)?String(Number(value.toPrecision(6))):value??'';};
    for(const a of ['x','y']){set(`gm-engine-${a}-scale`,e[`${a}Scale`]||p[`${a}Scale`]||'linear');get(`gm-engine-${a}-scale`).disabled=cfg.coordinateMode==='observed';}
    const recommended=isExamStyle(cfg),m=examMetrics(p);
    get('gm-style-recommended').checked=recommended;set('gm-output-width',cfg.outputWidth??p.w);
    get('gm-size-advice').textContent=graphSizeAdvice(cfg.outputWidth??p.w);
    set('gm-engine-arrowScale',(cfg.graphStyle?.arrowScale??1)*100);
    set('gm-engine-strokeWidth',recommended?m.axis:e.strokeWidth??p.strokeWidth??.3);
    get('gm-tickscale').closest('.gm-scale-item').hidden=recommended;
    get('gm-axisscale').closest('.gm-row').querySelector('.gm-row-lbl').textContent=recommended?'전체 라벨 크기':'좌표 / 성분 크기';
    get('gm-engine-arrow-Y2').closest('label').hidden=!cfg.y2On;
    for(const a of ['X','Y','Y2'])get(`gm-engine-arrow-${a}`).checked=e[`axisArrow${a}`]??p[`axisArrow${a}`]??(cfg.variant!=='box');
    for(const k of ['boxTickTop','boxTickRight']){get(`gm-engine-${k}`).checked=e[k]??p[k]??false;get(`gm-engine-${k}`).disabled=cfg.variant!=='box';}
    selected.hidden=!s;
    for(const id of ['gm-engine-point-appearance','gm-engine-data-details','gm-engine-fit-details'])get(id).hidden=s?.kind!=='points';
    get('gm-engine-bar-details').hidden=s?.kind!=='bar';
    if(s){get('gm-engine-line').checked=s.lineVisible!==false;set('gm-engine-marker',s.markerShape||'none');set('gm-engine-marker-size',s.markerSize??.8);set('gm-engine-marker-stroke',s.markerStrokeWidth??.25);set('gm-engine-dash-pattern',(s.dashPattern||[]).join(', '));get('gm-engine-data').disabled=s.kind!=='points';get('gm-engine-data-apply').disabled=s.kind!=='points';get('gm-engine-fit').disabled=s.kind!=='points'||!s.reconstruction||s.reconstruction.certainty==='exact';get('gm-engine-fit-restore').disabled=!s.originalMathPoints;if(s.kind==='bar')set('gm-engine-bar-levels',s.items.some(it=>it.fillLevel!==undefined)?s.items.map(it=>it.fillLevel??170).join(', '):'');}
    syncBars(s);
    syncRegions();
  }
  function renderRegions(svg,plane,series,enabled){
    preview={svg,plane,series,enabled};
    if(api.getSelectedRegion)setActiveRegion(api.getSelectedRegion());
    const specs=api.getCfg().regions||[],rendered=series.filter(s=>s.sourceKind==='region');
    svg.querySelectorAll('[data-region-hit], [data-region-editor]').forEach(el=>el.remove());
    if(enabled)svg.querySelectorAll('[data-graph-region]').forEach((shape,i)=>{
      const graph=rendered[i];
      const spec=graph && (specs.find(r=>(graph.regionSpec?.id!=null && r.id===graph.regionSpec.id)||(graph.id!=null && r.objectId===graph.id))||specs[i]);
      if(!spec)return;
      const index=specs.indexOf(spec),hit=shape.cloneNode(false);
      hit.removeAttribute('data-graph-region');hit.removeAttribute('id');
      hit.dataset.regionHit=String(index);hit.dataset.displayKey=`region:${spec.id??index}`;
      hit.setAttribute('fill','transparent');hit.setAttribute('fill-opacity','1');hit.setAttribute('stroke','transparent');
      hit.setAttribute('pointer-events','all');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');
      hit.setAttribute('aria-label',`영역 ${index+1} 선택`);hit.setAttribute('aria-pressed',String(regionEditor.isSelected(spec)));
      hit.style.cursor='pointer';hit.style.touchAction='none';
      hit.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;e.preventDefault();e.stopPropagation();requestRegionSelection(spec);});
      hit.addEventListener('mousedown',e=>{e.preventDefault();e.stopPropagation();});
      hit.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
      hit.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();e.stopPropagation();requestRegionSelection(spec);overlay.querySelectorAll('[data-region-hit]').forEach(el=>{if(Number(el.dataset.regionHit)===index)el.focus({preventScroll:true});});});
      shape.after(hit);
    });
    regionEditor.render(svg,plane,series,enabled);
  }
  return {sync,selectRegion,renderRegions,cancelRegionDrag:regionEditor.cancel};
}
