import {validPlacement,validChoiceLayout} from './placement.js';
import {normalizeExams,validateExams} from './exams.js';
import {validateAuthoring,remapAuthoring} from '../authoring/schema.js';
// The visible sheets are projections of this ordered, nested question document.
export const FORMAT='5e-question-sheet-v2';
export const TYPES=['객관식','합답형','서술형'];
export const PRESETS=['글·수식','그림','그림 비교','그림·표','실험','대화'];
export const STYLES=['문장·수식','조합','대응표','그림·그래프'];
// 문항 단계: 초안 → 검토 중 → 완성. 완성한 문항의 내용을 고치면 검토 중으로 돌아간다.
export const WORKFLOWS={draft:'초안',review:'검토 중',complete:'완성'};
// 어울림: 그림이 첫 지문(바로 앞 글) 문단에 붙어 오른쪽(정렬이 왼쪽이면 왼쪽)에 떠 있고, 글이 그 옆·아래로 흐른다. 맨 바깥 그림만.
export const WRAP='어울림';
export const isWrapped=b=>b?.kind==='figure'&&b.layout===WRAP&&!b.parent;
export const KINDS={text:'설명',figure:'그림',table:'표',group:'묶음',steps:'과정',dialogue:'대화',bogi:'보기'};
export const uid=()=>crypto.randomUUID();
export const clone=v=>structuredClone(v);
export const makeTable=(rows=3,cols=3,role='자료표')=>({rows,cols,headerRows:1,role,cells:Array.from({length:rows},()=>Array.from({length:cols},()=>({value:''}))),merges:[],note:'',diagonal:null});
export function block(kind,parent=null,label=KINDS[kind]) {
  const b={id:uid(),parent,kind,label,text:'',layout:'세로'};
  if(kind==='table')b.table=makeTable();
  if(kind==='figure')b.figure=null;
  if(kind==='group')b.boxed=false;
  if(['steps','bogi','dialogue'].includes(kind))b.lines=Array.from({length:kind==='steps'?2:3},(_,i)=>({id:uid(),label:kind==='dialogue'?String.fromCharCode(65+i):kind==='bogi'?['ㄱ','ㄴ','ㄷ'][i]:`(${['가','나'][i]})`,text:''}));
  return b;
}
export function newQuestion(number='1',type='객관식',preset='글·수식',style=type==='합답형'?'조합':'문장·수식') {
  const q={id:uid(),number:String(number),type,preset,style,standardCode:'',ask:'',points:3,answer:null,modelAnswer:'',explanation:'',intent:'',source:'',references:[],blocks:[],choices:Array.from({length:5},()=>({id:uid(),text:'',figure:null})),choiceTable:makeTable(6,3,'선지표')};
  applyPreset(q,preset); if(type==='합답형')q.blocks.push(block('bogi'));
  return q;
}
// 문항 유형(새 문항 창의 ① 유형): 합답형·일반 정답형·대응·짝·학생 대화·서술형. q.form은 type·style과 함께 움직인다.
export const FORM_KEYS=['combo','single','pair','talk','essay'];
const FORM_TYPE={combo:'합답형',single:'객관식',pair:'객관식',talk:'객관식',essay:'서술형'};
// 저장된 q.form이 없거나(엑셀·예전 파일) type·style과 어긋나면 type·style·대화 칸으로 정한다.
export function formOf(q){
  if(q.type==='서술형')return 'essay';
  if(q.type==='합답형')return 'combo';
  if(q.style==='대응표')return 'pair';
  if(q.form==='single'||q.form==='talk')return q.form;
  return q.blocks.some(b=>b.kind==='dialogue')?'talk':'single';
}
// 엑셀에서 유형을 바꿔 들여온 문항: 이미 q.form이 있으면 같은 규칙으로 다시 맞춘다(없으면 그대로 둔다).
export function syncForm(q){if(q.form!==undefined&&q.form!==formOf(q))q.form=formOf(q);}
// 유형을 바꿀 때 지워질, 글이 든 칸(보기·대화). 비어 있으면 묻지 않고 지운다.
const FORM_BLOCK={combo:'bogi',talk:'dialogue'};
export function formLosses(q,form){const kind=FORM_BLOCK[formOf(q)];if(!kind||FORM_BLOCK[form]===kind)return [];return q.blocks.filter(b=>b.kind===kind&&b.lines.some(l=>l.text.trim()));}
export function applyForm(q,form){
  if(!FORM_KEYS.includes(form))throw Error('문항 유형을 확인하세요.');
  const from=formOf(q),gone=FORM_BLOCK[from];
  if(gone&&FORM_BLOCK[form]!==gone)q.blocks=q.blocks.filter(b=>b.kind!==gone);
  q.type=FORM_TYPE[form];q.form=form;
  if(form==='combo'||form==='talk')q.style='조합';else if(form==='pair')q.style='대응표';else if(q.style==='조합'||q.style==='대응표')q.style='문장·수식';
  const at=()=>{const i=q.blocks.findIndex(b=>b.kind==='bogi'&&!b.parent);return i<0?q.blocks.length:i;};
  if(form==='combo'&&!q.blocks.some(b=>b.kind==='bogi'))q.blocks.push(block('bogi'));
  if(form==='talk'&&!q.blocks.some(b=>b.kind==='dialogue')){const d=block('dialogue');d.lines.forEach(l=>l.label='학생 '+l.label);q.blocks.splice(at(),0,d);}
  if(form==='pair'&&q.choiceTable.cells[0].every(c=>!String(c.value).trim()))['A','B','C'].forEach((v,c)=>{if(q.choiceTable.cells[0][c])q.choiceTable.cells[0][c].value=v;});
}
export function applyPreset(q,preset) {
  if(!PRESETS.includes(preset))throw Error('자료 구성을 선택하세요.');
  q.preset=preset;
  const additions=[];
  if(!q.blocks.some(b=>b.kind==='text'&&!b.parent))additions.push(block('text',null,'자료 설명'));
  if(preset==='그림')additions.push(block('figure'));
  if(preset==='그림 비교'||preset==='그림·표') {
    const g=block('group',null,preset);g.layout='나란히';additions.push(g,block('figure',g.id,'(가)'),block(preset==='그림 비교'?'figure':'table',g.id,'(나)'));
  }
  if(preset==='실험') {const g=block('group',null,'실험');g.boxed=true;additions.push(g,block('steps',g.id,'실험 과정'),block('figure',g.id,'실험 장치'),block('table',g.id,'실험 결과'));}
  if(preset==='대화')additions.push(block('figure'),block('dialogue'));
  // Switching a preset adds material; existing content is never deleted.
  q.blocks.push(...additions);return q;
}
// 글 옆 자료(가로 묶음이 문항 맨 앞): 묶음의 첫 글이 문항 번호가 붙는 첫 지문이다.
export function openingSideText(q){const o=q.blocks.find(b=>!b.parent);if(o?.kind!=='group'||o.layout!=='나란히'||o.boxed===true)return null;const c=q.blocks.find(b=>b.parent===o.id);return c?.kind==='text'?c:null;}
// 시트의 '지문' 칸: 맨 앞 글 옆 지문과 묶음 밖 설명들.
export const passageBlocks=q=>{const side=openingSideText(q);return [...(side?[side]:[]),...q.blocks.filter(b=>b.kind==='text'&&!b.parent)];};
export function parentOptions(q,b) {
  const descendants=new Set([b.id]);let changed=true;
  while(changed){changed=false;for(const x of q.blocks)if(descendants.has(x.parent)&&!descendants.has(x.id)){descendants.add(x.id);changed=true;}}
  return q.blocks.filter(x=>x.kind==='group'&&!descendants.has(x.id));
}
export function tableCovered(t,r,c){return t.merges.some(m=>r>=m.r&&r<m.r+m.rs&&c>=m.c&&c<m.c+m.cs&&(r!==m.r||c!==m.c));}
export function cellValue(s) {
  // Preserve leading zeroes, decimals with trailing zeroes, unknowns and formulas as literal text.
  return /^-?(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(s)&&Number.isFinite(Number(s))?Number(s):s;
}
export function mergeCells(t,range) {
  const [r,c,er,ec]=range;if(er===r&&ec===c)return;
  if(t.merges.some(m=>r<m.r+m.rs&&er>=m.r&&c<m.c+m.cs&&ec>=m.c))throw Error('이미 병합된 셀은 먼저 병합을 풀어주세요.');
  for(let y=r;y<=er;y++)for(let x=c;x<=ec;x++)if((y!==r||x!==c)&&(t.cells[y][x].value!==''||t.cells[y][x].figure))throw Error('병합할 영역의 첫 셀 외에는 비워주세요. 입력한 내용은 보존했습니다.');
  t.merges.push({r,c,rs:er-r+1,cs:ec-c+1});
}
export function migrate(old) {
  if(old?.format===FORMAT)return validate(old);
  const docs=old.documents||[];
  const questions=(old.questions||[]).map(v=>{
    if(v.blocks)return clone(v);
    const q=newQuestion(v.number);q.type=v.type||'객관식';q.style=q.type==='합답형'?'조합':'문장·수식';q.id=v.id;
    for(const key of ['ask','standardCode','points','answer','modelAnswer','explanation','intent','references'])if(v[key]!==undefined)q[key]=clone(v[key]);
    q.blocks[0].text=v.passage||'';
    if(v.figure){const b=block('figure');b.figure=clone(v.figure);q.blocks.push(b);q.preset='그림';}
    if(v.bogi?.some(Boolean)||v.bogiVisible){const b=block('bogi');b.lines=v.bogi.map((text,i)=>({id:uid(),label:['ㄱ','ㄴ','ㄷ'][i]||String(i+1),text}));q.blocks.push(b);}
    q.choices=v.choices.map(text=>({id:uid(),text,figure:null}));normalizeReferences(q);return q;
  });return validate({format:FORMAT,questions,documents:docs});
}
export function fromLegacy(v) {
  const q=newQuestion(v.number);q.id=v.id;q.ask=v.ask;q.intent=v.intent||'';q.standardCode=v.standard_code||'';q.blocks[0].text=v.passage;
  q.choices=v.choices.map(x=>({id:x.id,text:x.text,figure:null}));
  if(v.bogi_items.length){const b=block('bogi');b.lines=clone(v.bogi_items);q.blocks.push(b);q.type='합답형';q.style='조합';}
  const snap=v.asset?.confirmed||v.asset?.draft;if(snap){const b=block('figure');b.figure={name:snap.name,data:snap.png,editable:clone(snap),asset:clone(v.asset)};q.blocks.push(b);q.preset='그림';}
  q.references=(v.references||[]).map(ref=>({target:ref.field||'question',label:ref.title,quote:ref.quote,documentId:ref.resourceId,page:ref.page}));normalizeReferences(q);return q;
}
function normalizeReferences(q){for(const ref of q.references){const choice=ref.target.match(/^choice-([0-4])$/),bogi=ref.target.match(/^bogi-([0-2])$/);if(choice)ref.target=q.choices[Number(choice[1])].id;if(bogi)ref.target=q.blocks.find(b=>b.kind==='bogi')?.lines[Number(bogi[1])]?.id||'question';if(ref.target==='bogi')ref.target=q.blocks.find(b=>b.kind==='bogi')?.id||'question';if(ref.target==='passage')ref.target=q.blocks.find(b=>b.kind==='text')?.id||'question';}}
export function targetDisplay(q,target){if(target==='question'||target==='ask')return '문항';const b=q.blocks.find(b=>b.id===target);if(b)return b.label;for(const b of q.blocks){const l=b.lines?.find(l=>l.id===target);if(l)return b.label+' '+l.label;}const at=q.choices.findIndex(c=>c.id===target);return at>=0?'선지 '+'①②③④⑤'[at]:'문항';}
// 그림 data URL 형식 검사는 그림마다 한 번만(같은 그림 객체·같은 data면 통과로 기억). 키 입력마다 문항 전체를 검사하는데,
// 그림 15개(약 18MB)면 이 정규식만 키 하나에 100ms 넘게 걸려 카드 입력이 버벅였다.
const checkedImages=new WeakMap();
// JSON.stringify(data).length와 같은 값을 문자열을 만들지 않고 센다(키마다 18MB 문자열을 새로 만들던 것).
// 긴 글(4096자 넘음)은 그림·조판 base64라 이스케이프할 글자가 없으므로 길이+2로 센다.
export function jsonSize(v){
  if(v===null)return 4;const t=typeof v;
  if(t==='string')return v.length>4096?v.length+2:JSON.stringify(v).length;
  if(t==='number')return Number.isFinite(v)?String(v).length:4;if(t==='boolean')return v?4:5;
  if(t!=='object')return 0;if(typeof v.toJSON==='function')return jsonSize(v.toJSON());
  if(Array.isArray(v)){let n=2+Math.max(0,v.length-1);for(const x of v){const k=typeof x;n+=x===undefined||k==='function'||k==='symbol'?4:jsonSize(x);}return n;}
  let n=2,first=true;for(const key of Object.keys(v)){const x=v[key],k=typeof x;if(x===undefined||k==='function'||k==='symbol')continue;n+=(first?0:1)+JSON.stringify(key).length+1+jsonSize(x);first=false;}return n;
}
// only: 이 문항만 자세히 검사(카드에서 한 문항의 글만 고칠 때). 다른 문항은 ID 중복만 본다.
export function validate(data,{only=null}={}) {
  const str=(v,max=32767)=>typeof v==='string'&&v.length<=max;
  const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(v);
  const image=f=>{if(!f)return true;if(!str(f.name,240)||!str(f.data,8*1024*1024))return false;if(checkedImages.get(f)===f.data)return true;
    const ok=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(f.data);if(ok)checkedImages.set(f,f.data);return ok;};
  const table=t=>{if(!t||!Number.isInteger(t.rows)||t.rows<1||t.rows>30||!Number.isInteger(t.cols)||t.cols<1||t.cols>12||!Array.isArray(t.cells)||t.cells.length!==t.rows||!Number.isInteger(t.headerRows)||t.headerRows<0||t.headerRows>t.rows||!str(t.note)||!['자료표','선지표','과정표'].includes(t.role)||!Array.isArray(t.merges)||t.merges.length>360)throw Error('표 크기·머리글·내용을 확인하세요.');
    t.cells.forEach(row=>{if(!Array.isArray(row)||row.length!==t.cols)throw Error('표의 열 개수가 다릅니다.');row.forEach(c=>{if(!c||!(str(c.value)||typeof c.value==='number'&&Number.isFinite(c.value))||!image(c.figure)||c.raw!==undefined&&!str(c.raw))throw Error('표 셀의 값 또는 그림 형식이 올바르지 않습니다.');});});
    const covered=new Set();for(const m of t.merges){if(![m.r,m.c,m.rs,m.cs].every(Number.isInteger)||m.r<0||m.c<0||m.rs<1||m.cs<1||m.r+m.rs>t.rows||m.c+m.cs>t.cols)throw Error('병합 범위가 표를 벗어났습니다.');for(let r=m.r;r<m.r+m.rs;r++)for(let c=m.c;c<m.c+m.cs;c++){const k=`${r}:${c}`;if(covered.has(k))throw Error('병합 범위가 겹칩니다.');covered.add(k);if((r!==m.r||c!==m.c)&&(t.cells[r][c].value!==''||t.cells[r][c].figure||t.cells[r][c].raw))throw Error('병합 뒤에 숨은 셀 내용이 있습니다. 병합을 풀거나 숨은 셀을 비운 뒤 가져오세요.');}}
    if(t.diagonal&&(!str(t.diagonal.row,120)||!str(t.diagonal.col,120)))throw Error('대각선 머리글을 확인하세요.');
  };
  if(!data||data.format!==FORMAT||!Array.isArray(data.questions)||data.questions.length>500||!Array.isArray(data.documents)||data.documents.length>40)throw Error('문항 파일의 형식이나 개수를 확인하세요.');
  const ids=new Set();for(const q of data.questions){if(only&&q!==only&&q&&typeof q.id==='string'&&!ids.has(q.id)){ids.add(q.id);continue;}if(!q||!id(q.id)||ids.has(q.id)||!TYPES.includes(q.type)||!PRESETS.includes(q.preset)||!STYLES.includes(q.style)||!Array.isArray(q.blocks)||q.blocks.length>80||!Array.isArray(q.choices)||q.choices.length!==5)throw Error('문항 유형·ID·구성을 확인하세요.');ids.add(q.id);
    for(const k of ['number','standardCode','ask','modelAnswer','explanation','intent','source'])if(!str(q[k],k==='number'?40:k==='standardCode'?80:32767))throw Error('문항 입력 내용이 너무 길거나 형식이 다릅니다.');
    for(const k of ['unitLarge','unitMiddle','unitSmall','managementId','templateKey'])if(q[k]!==undefined&&!str(q[k],240))throw Error('단원·관리번호를 확인하세요.');
    if(q.form!==undefined&&!FORM_KEYS.includes(q.form)||q.structure!==undefined&&!['two','big','small','condition','many','experiment','none'].includes(q.structure))throw Error('새 문항 틀의 유형·자료 구조를 확인하세요.');
    if(q.concepts!==undefined&&(!Array.isArray(q.concepts)||q.concepts.length>100||!q.concepts.every(v=>str(v,240))))throw Error('핵심개념은 100개 이내로 입력하세요.');
    // 문항별 기준 용지(선택): 조판을 처음 열 때의 용지. 기출(평가원 단 폭 약 110mm)은 B4.
    if(q.paper!==undefined&&!['A4','B4','A3'].includes(q.paper))throw Error('문항 기준 용지는 A4·B4·A3 중 하나입니다.');
    if(q.typeset!==undefined&&(!q.typeset||!str(q.typeset.bytes,12*1024*1024)||!str(q.typeset.fingerprint,100)||!str(q.typeset.baselineText,1000000)||!['A4','A3','B4'].includes(q.typeset.profile?.paper)||![1,2].includes(q.typeset.profile?.columns)))throw Error('저장한 조판 문서를 확인하세요.');
    if(q.reviews!==undefined&&(!Array.isArray(q.reviews)||q.reviews.length>200||!q.reviews.every(m=>m&&['me','ai'].includes(m.role)&&str(m.text,20000))))throw Error('AI 대화 기록을 확인하세요.');
    if(q.authoring!==undefined)validateAuthoring(q.authoring);
    if(q.workflow!==undefined&&!Object.hasOwn(WORKFLOWS,q.workflow))throw Error('문항 단계는 초안·검토 중·완성 중 하나입니다.');
    if(!validChoiceLayout(q.choiceLayout))throw Error('선지 배열은 한 줄·3+2·2열·세로 중에서 고르세요.');
    if(!Number.isFinite(q.points)||q.points<0||q.points>10000||!(q.answer===null||Number.isInteger(q.answer)&&q.answer>=0&&q.answer<5))throw Error('정답은 1~5, 배점은 0~10,000으로 입력하세요.');
    const bids=new Set();for(const b of q.blocks){if(!b||!id(b.id)||bids.has(b.id)||!Object.hasOwn(KINDS,b.kind)||!str(b.label,240)||!str(b.text)||!['세로','나란히',...(b.kind==='figure'?[WRAP]:[])].includes(b.layout))throw Error('구성의 종류·이름·ID를 확인하세요.');if(!validPlacement(b))throw Error('구성의 크기·간격·폭 비율·정렬을 확인하세요.');bids.add(b.id);if(b.kind==='table')table(b.table);if(b.kind==='figure'&&!image(b.figure))throw Error('그림 형식을 확인하세요.');if(['steps','bogi','dialogue'].includes(b.kind)&&(!Array.isArray(b.lines)||b.lines.length>30||!b.lines.every(l=>id(l.id)&&str(l.label,120)&&str(l.text))))throw Error('과정·대화·보기 내용을 확인하세요.');}
    const nodeIds=new Set(bids);
    for(const b of q.blocks){if(b.lines)for(const l of b.lines){if(nodeIds.has(l.id))throw Error('구성 항목 ID가 중복되었습니다.');nodeIds.add(l.id);}let node=b,seen=new Set([b.id]);while(node.parent){const p=q.blocks.find(x=>x.id===node.parent);if(!p||p.kind!=='group'||seen.has(p.id))throw Error('구성의 묶음 연결이 끊겼거나 순환합니다.');seen.add(p.id);node=p;}}
    q.choices.forEach(c=>{if(!id(c.id)||nodeIds.has(c.id)||!str(c.text)||!image(c.figure))throw Error('선지 ID 또는 내용을 확인하세요.');nodeIds.add(c.id);});table(q.choiceTable);
    if(q.choiceTable.rows!==6||q.choiceTable.headerRows!==1)throw Error('선지표는 머리글 1행과 5개 선지로 구성하세요.');
    if(!Array.isArray(q.references)||q.references.length>100||!q.references.every(r=>r&&str(r.target,100)&&str(r.label,300)&&str(r.quote)&&(r.page===undefined||Number.isInteger(r.page)&&r.page>0)))throw Error('근거 연결을 확인하세요.');
    for(const ref of q.references)if(ref.target!=='question'&&!nodeIds.has(ref.target)&&!/^choice-[0-4]$|^bogi-[0-2]$|^passage$|^ask$|^bogi$/.test(ref.target))throw Error('연결된 근거의 구성을 찾지 못했습니다.');
  }
  const dids=new Set();for(const d of data.documents){if(!d||!id(d.id)||dids.has(d.id)||!str(d.name,240)||!['textbooks','references','past'].includes(d.kind)||!['application/pdf','image/png','image/jpeg','image/webp','text/plain'].includes(d.mime)||!str(d.data,8*1024*1024)||!d.data.startsWith(`data:${d.mime};base64,`)||!/^data:[^;]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(d.data)||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>3000||!d.pages.every(p=>str(p,1000000)))throw Error('참고자료 파일이 올바르지 않습니다.');dids.add(d.id);}
  for(const q of data.questions)for(const ref of q.references)if(ref.documentId){const d=data.documents.find(x=>x.id===ref.documentId);if(!d||!Number.isInteger(ref.page)||ref.page>d.pages.length)throw Error('자료 원문 또는 쪽수 연결이 끊겼습니다.');}
  normalizeExams(data);validateExams(data);
  if(jsonSize(data)>24*1024*1024)throw Error('문항과 자료는 합쳐서 24 MB까지 저장할 수 있습니다.');
  return data;
}
export function duplicateQuestion(q) {
  const n=clone(q),ids=new Map();n.id=uid();for(const b of n.blocks){const old=b.id;b.id=uid();ids.set(old,b.id);b.lines?.forEach(l=>{const old=l.id;l.id=uid();ids.set(old,l.id);});}for(const c of n.choices){const old=c.id;c.id=uid();ids.set(old,c.id);}n.blocks.forEach(b=>b.parent=b.parent?ids.get(b.parent):null);n.references.forEach(r=>r.target=ids.get(r.target)||r.target);if(n.authoring)n.authoring=remapAuthoring(n.authoring,ids);return n;
}
