export const TYPES=['객관식','합답형','서술형'];
export const COLUMNS=['번호','유형','성취기준','발문','정답','배점','지문','보기 ㄱ','보기 ㄴ','보기 ㄷ','선지 1','선지 2','선지 3','선지 4','선지 5','해설','출제 의도','문항 ID'];
const META_FORMAT='5e-exampool-sheet-concept-v1';
const idPattern=/^[a-zA-Z0-9_-]{1,80}$/;
export const blankQuestion=(number,type='객관식')=>({id:crypto.randomUUID(),number:String(number),title:'',type,standardCode:'',points:3,answer:null,passage:'',ask:'',bogi:['','',''],bogiVisible:type==='합답형',choices:['','','','',''],modelAnswer:'',explanation:'',intent:'',figure:null,references:[]});
function text(value,label,max=32767){if(value===null||value===undefined)return '';if(!['string','number'].includes(typeof value))throw new Error(`${label} 값이 올바르지 않습니다.`);const result=String(value);if(result.length>max)throw new Error(`${label} 내용이 너무 깁니다.`);return result;}
export function validatePackage(data){
  if(!data||!Array.isArray(data.questions)||data.questions.length>500||!Array.isArray(data.documents)||data.documents.length>40)throw new Error('문항 또는 연결자료의 형식이 올바르지 않습니다.');
  const ids=new Set();
  for(const q of data.questions){
    if(!q||!idPattern.test(q.id)||ids.has(q.id)||!TYPES.includes(q.type)||!Array.isArray(q.choices)||q.choices.length!==5||!Array.isArray(q.bogi)||q.bogi.length!==3||!Array.isArray(q.references)||q.references.length>100)throw new Error('문항의 유형·ID·선지 형식을 확인하세요.');ids.add(q.id);
    for(const key of ['number','passage','ask','modelAnswer','explanation','intent'])text(q[key],key,key==='number'?40:32767);
    text(q.standardCode,'성취기준',80);q.choices.forEach(v=>text(v,'선지'));q.bogi.forEach(v=>text(v,'보기'));
    if(!Number.isFinite(Number(q.points))||Number(q.points)<0||Number(q.points)>10000||!(q.answer===null||Number.isInteger(q.answer)&&q.answer>=0&&q.answer<5))throw new Error('배점 또는 정답 값을 확인하세요.');
    if(q.figure&&(!validData(q.figure.data)||!q.figure.data.startsWith('data:image/')))throw new Error('그림 파일 형식이 올바르지 않습니다.');
    for(const ref of q.references){if(!ref||typeof ref.target!=='string'||!/^question$|^choice-[0-4]$|^bogi-[0-2]$/.test(ref.target))throw new Error('근거 연결 형식이 올바르지 않습니다.');text(ref.label,'근거',300);text(ref.quote,'근거 문장');if(ref.documentId&&!idPattern.test(ref.documentId))throw new Error('근거 자료 ID가 올바르지 않습니다.');if(ref.page!==undefined&&(!Number.isInteger(ref.page)||ref.page<1))throw new Error('근거 자료 쪽수가 올바르지 않습니다.');}
  }
  const docIds=new Set();for(const d of data.documents){if(!d||!idPattern.test(d.id)||docIds.has(d.id)||!['textbooks','references'].includes(d.kind)||!validData(d.data)||!Array.isArray(d.pages)||!d.pages.length||d.pages.length>3000)throw new Error('연결자료 파일 형식이 올바르지 않습니다.');docIds.add(d.id);text(d.name,'자료 이름',240);d.pages.forEach(p=>text(p,'자료 원문',1000000));}
  for(const q of data.questions)for(const ref of q.references)if(ref.documentId){const d=data.documents.find(d=>d.id===ref.documentId);if(!d||ref.page>d.pages.length)throw new Error('연결한 자료 또는 쪽수를 찾을 수 없습니다.');}
  return data;
}
function validData(value){return typeof value==='string'&&value.length<=8*1024*1024&&/^data:(?:application\/pdf|image\/(?:png|jpeg|webp)|text\/plain);base64,[A-Za-z0-9+/]*={0,2}$/.test(value);}
export function parseWorkbook(XLSX,wb){
  const sheet=wb.Sheets['문항']||wb.Sheets[wb.SheetNames[0]];if(!sheet?.['!ref'])throw new Error('문항이 들어 있는 시트를 찾지 못했습니다.');
  const extent=XLSX.utils.decode_range(sheet['!ref']);if(extent.e.r>501||extent.e.c>99)throw new Error('엑셀은 문항 500개·열 100개 이내로 불러올 수 있습니다.');
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true});
  const headers=matrix[0].map(v=>String(v).trim()),positions=new Map();for(const [i,h] of headers.entries()){if(h&&positions.has(h))throw new Error(`'${h}' 열이 중복되어 있습니다.`);if(h)positions.set(h,i);}
  for(const name of ['번호','유형','발문'])if(!positions.has(name))throw new Error(`첫 행에 '${name}' 열이 필요합니다. 빈 양식을 내려받아 사용하세요.`);
  let metadata={questions:[],documents:[]};
  const metaSheet=wb.Sheets['연결자료'];if(metaSheet){const mr=XLSX.utils.decode_range(metaSheet['!ref']||'A1');if(mr.e.r>850||mr.e.c!==0)throw new Error('연결자료 데이터가 너무 큽니다.');const rows=XLSX.utils.sheet_to_json(metaSheet,{header:1,raw:true,defval:''});if(rows[0]?.[0]!==META_FORMAT)throw new Error('연결자료 형식을 확인할 수 없습니다.');const serialized=rows.slice(1).map(r=>r[0]).join('');if(serialized.length>24*1024*1024)throw new Error('연결자료 데이터가 너무 큽니다.');try{metadata=JSON.parse(serialized);}catch{throw new Error('연결자료 데이터가 손상되었습니다.');}if(metadata.format!==META_FORMAT)throw new Error('연결자료 버전이 올바르지 않습니다.');validatePackage(metadata);}
  const old=new Map(metadata.questions.map(q=>[q.id,q])),questions=[],ids=new Set();
  for(let r=1;r<matrix.length;r++){
    const row=matrix[r],get=name=>positions.has(name)?row[positions.get(name)]:'';
    const id=text(get('문항 ID'),`${r+1}행 ID`,80),content=['발문','지문','정답','보기 ㄱ','보기 ㄴ','보기 ㄷ','선지 1','선지 2','선지 3','선지 4','선지 5','해설','출제 의도'];
    if(!id&&!content.some(k=>get(k)!==''&&get(k)!==undefined))continue;
    for(const [name,c] of positions)if(COLUMNS.includes(name)&&sheet[XLSX.utils.encode_cell({r,c})]?.f)throw new Error(`${r+1}행 '${name}'에 수식이 있습니다. 계산된 값을 붙여넣어 주세요.`);
    if(id&&(!idPattern.test(id)||ids.has(id)))throw new Error(`${r+1}행 문항 ID가 올바르지 않거나 중복되었습니다.`);
    const q=old.has(id)?structuredClone(old.get(id)):blankQuestion(get('번호'));if(id)q.id=id;ids.add(q.id);
    q.number=text(get('번호'),`${r+1}행 번호`,40);q.type=text(get('유형'),`${r+1}행 유형`);
    if(!TYPES.includes(q.type))throw new Error(`${r+1}행 유형은 객관식·합답형·서술형 중에서 선택하세요.`);
    const keys={성취기준:'standardCode',발문:'ask',지문:'passage',해설:'explanation','출제 의도':'intent'};for(const [name,key]of Object.entries(keys))if(positions.has(name))q[key]=text(get(name),`${r+1}행 ${name}`,key==='standardCode'?80:32767);
    ['ㄱ','ㄴ','ㄷ'].forEach((letter,i)=>{if(positions.has('보기 '+letter))q.bogi[i]=text(get('보기 '+letter),`${r+1}행 보기 ${letter}`);});
    q.choices=q.choices.map((v,i)=>positions.has('선지 '+(i+1))?text(get('선지 '+(i+1)),`${r+1}행 선지 ${i+1}`):v);
    if(positions.has('배점')){const value=get('배점');q.points=value===''?3:Number(value);if(!Number.isFinite(q.points)||q.points<0||q.points>10000)throw new Error(`${r+1}행 배점은 0~10,000 사이의 숫자로 입력하세요.`);}
    if(positions.has('정답')){const value=get('정답');if(q.type==='서술형'){q.modelAnswer=text(value,`${r+1}행 모범답안`);}else{q.answer=value===''?null:Number(value)-1;if(q.answer!==null&&(!Number.isInteger(q.answer)||q.answer<0||q.answer>4))throw new Error(`${r+1}행 정답은 1~5 중에서 선택하세요.`);}}
    q.bogiVisible=q.type==='합답형'||q.bogi.some(Boolean);questions.push(q);
  }
  if(!questions.length)throw new Error('입력된 문항이 없습니다. 발문 또는 선지 내용을 입력한 뒤 불러오세요.');
  return {...validatePackage({questions,documents:metadata.documents}),backedIds:[...old.keys()]};
}
// 압축 폭탄 막기용 항목 수 한도. 256이던 때는 그림 약 234장(그래프 선지 47문항쯤)에서 내려받기가 막혔다(M13).
// 풀린 크기 합 48 MB 한도가 따로 있어 항목 수만 늘려도 안전하다.
const MAX_XLSX_ENTRIES=2048;
export function checkXlsxSize(buffer){
  if(buffer.byteLength>20*1024*1024)throw new Error('20 MB 이하의 엑셀 파일을 선택하세요.');
  const view=new DataView(buffer);let end=-1;for(let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('.xlsx 엑셀 파일을 선택하세요.');const count=view.getUint16(end+10,true),offset=view.getUint32(end+16,true);if(count>MAX_XLSX_ENTRIES||offset>=view.byteLength)throw new Error(`엑셀 파일 안의 항목(시트·그림)이 ${count.toLocaleString()}개라 한도 ${MAX_XLSX_ENTRIES.toLocaleString()}개를 넘습니다.`);
  let p=offset,total=0;for(let i=0;i<count;i++){if(p+46>view.byteLength||view.getUint32(p,true)!==0x02014b50)throw new Error('엑셀 파일이 손상되었습니다.');total+=view.getUint32(p+24,true);if(total>48*1024*1024)throw new Error('압축을 푼 엑셀 내용이 너무 큽니다.');p+=46+view.getUint16(p+28,true)+view.getUint16(p+30,true)+view.getUint16(p+32,true);}
}
