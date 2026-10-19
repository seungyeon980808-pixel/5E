import {FORMAT,TYPES,PRESETS,STYLES,KINDS,targetDisplay,uid,clone,block,newQuestion,validate,migrate,syncForm} from './model.js';
import {checkXlsxSize,parseWorkbook as parseLegacy} from './legacy-io.js';
import {ROWS,fieldValue,writeField} from './vertical.js';
import {formatSize,formatGap,formatRatio,parseSize,parseGap,parseRatio,parseAlign,parseChoiceLayout} from './placement.js';
export {checkXlsxSize};
const MAIN=['번호','답안형','자료 구성','선지 표현','성취기준','발문','정답','배점','출처','해설','출제 의도','문항 ID'];
// 배치 열(폭 비율·크기·간격·정렬)은 2026-10 추가. 예전 파일에는 없어도 읽는다.
const PARTS_REQUIRED=['번호','순서','구성','이름','내용','그림','묶음','배치','문항 ID','구성 ID','상위 ID','선지 ID','항목 ID'];
const PARTS=['번호','순서','구성','이름','내용','그림','묶음','배치','폭 비율','크기','간격','정렬','아래 여백','문항 ID','구성 ID','상위 ID','선지 ID','항목 ID'];
const TABLES=['번호','표 이름','행','열','셀 범위','단위·각주','머리글 행','행 축','열 축','','','','문항 ID','구성 ID'];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const unesc=s=>s.replace(/&(?:amp|lt|gt|quot|apos);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[c]));
const relation=(id,target,type)=>`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${esc(target)}"/>`;
const relFile=entries=>`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries}</Relationships>`;
function imageExtent(f,sheet){let w=f.width||f.editable?.pixelWidth||160,h=f.height||f.editable?.pixelHeight||100;if(f.data.startsWith('data:image/png;')){const bytes=Uint8Array.from(atob(f.data.split(',')[1].slice(0,48)),c=>c.charCodeAt(0));if(bytes.length>=24){const view=new DataView(bytes.buffer);w=view.getUint32(16)||w;h=view.getUint32(20)||h;}}const scale=Math.min((sheet==='표'?125:165)/w,100/h);return {cx:Math.round(w*scale*9525),cy:Math.round(h*scale*9525)};}
function sheet(XLSX,wb,name,rows,widths,hiddenFrom) {
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map((wch,c)=>({wch,hidden:c>=hiddenFrom}));ws['!rows']=rows.map((_,i)=>({hpt:i?28:30}));
  for(const k of Object.keys(ws))if(k[0]!=='!'&&ws[k].t==='s')ws[k].z='@';
  XLSX.utils.book_append_sheet(wb,ws,name);return ws;
}
export function project(XLSX,data) {
  validate(data);const wb=XLSX.utils.book_new(),pack=clone(data),images=[],indices=[];
  const main=sheet(XLSX,wb,'문항',[
    ['항목',...data.questions.map(q=>q.managementId||q.number+'번 문항')],
    ...ROWS.map(row=>[row.label,...data.questions.map(q=>fieldValue(q,row.key))]),
    ['문항 ID',...data.questions.map(q=>q.id)]
  ],[20,...data.questions.map(()=>42)],501);
  main['!rows']=Array.from({length:ROWS.length+2},(_,r)=>({hpt:r&&ROWS[r-1]?.tall?72:26,hidden:r===ROWS.length+1}));
  const parts=[PARTS];
  const addImage=(figure,sheet,row,col,owner)=>{if(figure)images.push({figure:clone(figure),sheet,row,col,owner});};
  for(const q of data.questions){
    for(const [i,b] of q.blocks.entries()) {
      const r=parts.length;parts.push([q.number,i+1,KINDS[b.kind],b.label,b.text,'',q.blocks.find(x=>x.id===b.parent)?.label||'',b.layout,formatRatio(b.ratio),formatSize(b.size),formatGap(b.gap),b.align||'',formatGap(b.pad),q.id,b.id,b.parent||'','','']);
      if(b.kind==='figure')addImage(b.figure,'구성',r,5,{qid:q.id,bid:b.id});
      for(const [j,l] of (b.lines||[]).entries())parts.push([q.number,j+1,KINDS[b.kind]+' 항목',l.label,l.text,'',b.label,'','','','','','',q.id,b.id,'','',l.id]);
    }
    parts.push([q.number,q.blocks.length+1,'발문','발문',q.ask,'','','','','','','','',q.id,'','','','']);
    for(const [i,c] of q.choices.entries()){const r=parts.length;parts.push([q.number,i+1,'선지','①②③④⑤'[i],c.text,'','',q.choiceLayout||'','','','','','',q.id,'','',c.id,'']);addImage(c.figure,'구성',r,5,{qid:q.id,cid:c.id});}
  }
  const ps=sheet(XLSX,wb,'구성',parts,[9,8,14,20,62,25,20,12,9,8,8,8,9,40,40,40,40,40],12);
  images.filter(i=>i.sheet==='구성').forEach(i=>ps['!rows'][i.row]={hpt:86});
  const tableRows=[TABLES];
  for(const q of data.questions){for(const b of q.blocks.filter(b=>b.kind==='table'))indices.push({qid:q.id,bid:b.id,name:b.label,number:q.number,table:b.table});if(q.style==='대응표'||q.choiceTable.cells.some(row=>row.some(c=>c.value!==''||c.figure)))indices.push({qid:q.id,bid:'choices',name:'선지 대응표',number:q.number,table:q.choiceTable});}
  if(indices.length>1000)throw Error('엑셀 파일 하나에는 표 1,000개까지 담을 수 있습니다. 문항을 나누어 보관하세요.');
  for(const x of indices)tableRows.push([x.number,x.name,x.table.rows,x.table.cols,'',x.table.note,x.table.headerRows,x.table.diagonal?.row||'',x.table.diagonal?.col||'','','','',x.qid,x.bid]);
  tableRows.push([],['아래 표의 실제 셀을 편집하세요. 범위·병합·그림은 다시 불러올 때 반영됩니다.']);
  const ts=sheet(XLSX,wb,'표',tableRows,Array.from({length:14},(_,i)=>i===4?26:19),12);ts['!merges']=[];
  let start=tableRows.length+1;
  for(const [index,x] of indices.entries()){
    const t=x.table;XLSX.utils.sheet_add_aoa(ts,[[`${x.number}번 · ${x.name}`]],{origin:{r:start,c:0}});start++;
    const range={s:{r:start,c:0},e:{r:start+t.rows-1,c:t.cols-1}};x.range=XLSX.utils.encode_range(range);x.indexRow=index+1;x.headerRows=t.headerRows;
    XLSX.utils.sheet_add_aoa(ts,t.cells.map(row=>row.map(c=>c.value)),{origin:{r:start,c:0}});
    ts[`E${index+2}`]={t:'s',v:x.range,z:'@'};
    for(const m of t.merges)ts['!merges'].push({s:{r:start+m.r,c:m.c},e:{r:start+m.r+m.rs-1,c:m.c+m.cs-1}});
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++) {const cell=t.cells[r][c];if(typeof cell.value==='string'){ts[XLSX.utils.encode_cell({r:start+r,c})].z='@';}if(cell.figure){addImage(cell.figure,'표',start+r,c,{qid:x.qid,bid:x.bid,r,c});ts['!rows'][start+r]={hpt:86};}}
    start+=t.rows+3;
  }
  const refs=[['자료 이름','종류','쪽수','연결 문항','근거 대상','쪽','인용','자료 ID','문항 ID','대상 ID']];
  for(const d of data.documents){const links=data.questions.flatMap(q=>q.references.filter(r=>r.documentId===d.id).map(r=>({q,r})));if(!links.length)refs.push([d.name,{textbooks:'교과서',references:'참고자료',past:'기출'}[d.kind],d.pages.length,'','','','',d.id,'','']);for(const {q,r} of links)refs.push([d.name,{textbooks:'교과서',references:'참고자료',past:'기출'}[d.kind],d.pages.length,q.number,targetDisplay(q,r.target),r.page,r.quote,d.id,q.id,r.target]);}
  sheet(XLSX,wb,'자료',refs,[32,14,8,12,20,8,60,40,40,40],7);
  pack.excel={indices:indices.map(({table,...x})=>x),images:images.map(({figure,...x})=>x)};
  const json=JSON.stringify(pack),chunks=[];for(let i=0;i<json.length;){let end=Math.min(i+30000,json.length);if(end<json.length&&/[\uD800-\uDBFF]/.test(json[end-1]))end--;chunks.push([json.slice(i,end)]);i=end;}
  sheet(XLSX,wb,'_구조',[[FORMAT],...chunks],[30],0);wb.Workbook={Sheets:wb.SheetNames.map(name=>({name,Hidden:name==='_구조'?1:0}))};
  return {wb,pack,images};
}
export async function exportExcel(XLSX,JSZip,data) {
  const {wb,pack,images}=project(XLSX,data),zip=await JSZip.loadAsync(XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true}));
  await enhanceZip(zip,wb.SheetNames,images,pack.excel.indices);
  const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
  // 다시 올릴 수 있는 크기(20 MB)를 넘으면 내려받지 않는다. 올리기용 문구(「…파일을 선택하세요」)가 나오면 무엇이 문제인지 알 수 없었다.
  if(bytes.byteLength>20*1024*1024)throw new Error(`내려받을 엑셀이 ${(bytes.byteLength/1048576).toFixed(1)} MB라 다시 올릴 수 있는 20 MB를 넘습니다. 그림이 든 문항 수나 그림 크기를 줄여 주세요.`);
  checkXlsxSize(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));return bytes;
}
export async function enhanceZip(zip,names,images,indices=[]) {
  let types=await zip.file('[Content_Types].xml').async('string');
  let styles=await zip.file('xl/styles.xml').async('string');const count=Number(styles.match(/<cellXfs count="(\d+)"/)?.[1]||0);
  const header=count,body=count+1;
  // Append formats, keeping all original text number formats and bindings intact.
  const fills=Number(styles.match(/<fills count="(\d+)"/)?.[1]);styles=styles.replace(/<fills count="\d+"/,`<fills count="${fills+1}"`).replace('</fills>','<fill><patternFill patternType="solid"><fgColor rgb="FFE5F0E8"/><bgColor indexed="64"/></patternFill></fill></fills>');
  styles=styles.replace(/<cellXfs count="\d+"/,`<cellXfs count="${count+2}"`).replace('</cellXfs>',`<xf numFmtId="0" fontId="0" fillId="${fills}" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`);zip.file('xl/styles.xml',styles);
  for(const [si,name] of names.entries()) {
    const path=`xl/worksheets/sheet${si+1}.xml`;let xml=await zip.file(path).async('string');
    if(name!=='_구조'){
      const view='<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>';
      xml=xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/,view);
      xml=xml.replace(/<c\b([^>]*)>/g,(tag,attrs)=>{const row=Number(attrs.match(/\br="[A-Z]+(\d+)"/)?.[1]);if(row!==1&&name!=='표')return tag;let h=row===1;
        if(name==='표')h||=indices.some(t=>{const first=Number(t.range.match(/[A-Z]+(\d+)/)?.[1]);return row>=first&&row<first+(t.headerRows??1);});
        if(h)return `<c${attrs.replace(/\s+s="\d+"/,'')} s="${header}">`;return tag;});
    }
    if(name==='문항')xml=xml.replace('</worksheet>',`<dataValidations count="3">${[['B2:SG2',TYPES],['B15:SG15',PRESETS],['B16:SG16',STYLES]].map(([ref,values])=>`<dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="목록에서 선택" error="정해진 목록의 값을 입력하세요." sqref="${ref}"><formula1>${esc('"'+values.join(',')+'"')}</formula1></dataValidation>`).join('')}</dataValidations></worksheet>`);
    const pics=images.filter(i=>i.sheet===name);if(pics.length){
      const drawing=`drawing${si+1}.xml`,rels=[],anchors=[];
      for(const [pi,img] of pics.entries()){
        const [,mime,b64]=img.figure.data.match(/^data:([^;]+);base64,(.+)$/);const ext=mime==='image/jpeg'?'jpeg':mime==='image/webp'?'webp':'png';
        const media=`picture-${si+1}-${pi+1}.${ext}`;zip.file('xl/media/'+media,b64,{base64:true});rels.push(relation('rId'+(pi+1),'../media/'+media,'image'));const extent=imageExtent(img.figure,name);
        if(!types.includes(`Extension="${ext}"`))types=types.replace('</Types>',`<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
        anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${img.col}</xdr:col><xdr:colOff>40000</xdr:colOff><xdr:row>${img.row}</xdr:row><xdr:rowOff>40000</xdr:rowOff></xdr:from><xdr:ext cx="${extent.cx}" cy="${extent.cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${pi+1}" name="${esc(img.figure.name)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${pi+1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${extent.cx}" cy="${extent.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
      }
      zip.file('xl/drawings/'+drawing,`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`);
      zip.file('xl/drawings/_rels/'+drawing+'.rels',relFile(rels.join('')));
      zip.file(`xl/worksheets/_rels/sheet${si+1}.xml.rels`,relFile(relation('rIdPictures','../drawings/'+drawing,'drawing')));
      types=types.replace('</Types>',`<Override PartName="/xl/drawings/${drawing}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.drawing+xml"/></Types>`);
      xml=xml.replace('</worksheet>','<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdPictures"/></worksheet>');
    }
    zip.file(path,xml);
  }zip.file('[Content_Types].xml',types);
}
function readRows(XLSX,ws,limit=10000,maxCols=99){if(!ws?.['!ref'])return [];const range=XLSX.utils.decode_range(ws['!ref']);if(range.e.r>limit||range.e.c>maxCols)throw Error('시트가 불러올 수 있는 크기를 초과했습니다.');for(const [key,c] of Object.entries(ws))if(key[0]!=='!'&&c.f)throw Error('계산 수식이 있는 셀은 값으로 붙여넣어 주세요. 문항 수식은 문자로 입력하세요.');return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true});}
const nonempty=row=>row.some(v=>v!==''&&v!==undefined);
function namedRows(XLSX,ws,headers,limit){const rows=readRows(XLSX,ws,limit),head=rows.shift()||[];for(const h of headers)if(!head.includes(h))throw Error(`'${h}' 열을 찾을 수 없습니다.`);if(new Set(head.filter(Boolean)).size!==head.filter(Boolean).length)throw Error('중복된 열 이름을 확인하세요.');return rows.map((r,i)=>({row:i+1,values:r})).filter(x=>nonempty(x.values)).map(({row,values:r})=>({row,...Object.fromEntries(head.map((h,c)=>[h,r[c]??'']))}));}
const text=v=>String(v??'');
export async function importExcel(XLSX,JSZip,buffer) {
  checkXlsxSize(buffer);const wb=XLSX.read(buffer,{type:'array',cellStyles:true});
  if(!wb.Sheets['_구조']){const old=parseLegacy(XLSX,wb);return {...migrate(old),backedIds:old.backedIds,warnings:['기본 문항 열을 불러옵니다. 구성·표 시트가 있는 새 양식은 내려받기로 만들 수 있습니다.']};}
  const rows=readRows(XLSX,wb.Sheets['_구조'],900);if(rows[0]?.[0]!==FORMAT)throw Error('문항 구조의 버전을 확인하세요.');const serialized=rows.slice(1).map(r=>r[0]).join('');if(serialized.length>24*1024*1024)throw Error('연결 자료가 너무 큽니다.');
  let pack;try{pack=JSON.parse(serialized);}catch{throw Error('숨김 구조 정보가 손상되었습니다.');}validate(pack);const old=new Map(pack.questions.map(q=>[q.id,q]));
  const questions=[],qmap=new Map(),overrides=[];
  if(wb.Sheets['문항']?.A1?.v==='항목'){
    const rows=readRows(XLSX,wb.Sheets['문항'],100,500),labels=rows.map(r=>r[0]);
    if(new Set(labels).size!==labels.length||!ROWS.filter(r=>!r.optional).every(r=>labels.includes(r.label))||!labels.includes('문항 ID'))throw Error('세로 시트의 항목 이름·문항 ID를 확인하세요.');
    for(let c=1;c<rows[0].length;c++){
      const id=text(rows[labels.indexOf('문항 ID')][c])||uid();if(qmap.has(id))throw Error('문항 ID가 중복되었습니다.');
      const q=old.has(id)?clone(old.get(id)):newQuestion(String(c));q.id=id;
      for(const row of ROWS){if(row.open||!labels.includes(row.label))continue;const value=text(rows[labels.indexOf(row.label)][c]??'');if(value!==fieldValue(q,row.key)){
        if(['passage','choices','bogi','steps','dialogue'].includes(row.key))overrides.push({q,key:row.key,value});else writeField(q,row.key,value);
      }}q.blocks=[];questions.push(q);qmap.set(id,q);
    }
  }else for(const r of namedRows(XLSX,wb.Sheets['문항'],MAIN,501)){
    const id=text(r['문항 ID'])||uid();if(qmap.has(id))throw Error('문항 ID가 중복되었습니다.');const q=old.has(id)?clone(old.get(id)):newQuestion(r['번호']);
    Object.assign(q,{id,number:text(r['번호']),type:text(r['답안형']),preset:text(r['자료 구성']),style:text(r['선지 표현']),standardCode:text(r['성취기준']),ask:text(r['발문']),points:r['배점']===''?3:Number(r['배점']),source:text(r['출처']),explanation:text(r['해설']),intent:text(r['출제 의도'])});
    if(q.type==='서술형')q.modelAnswer=text(r['정답']);else q.answer=r['정답']===''?null:Number(r['정답'])-1;q.blocks=[];questions.push(q);qmap.set(id,q);
  }
  const getQ=r=>{if(r['문항 ID']){const q=qmap.get(text(r['문항 ID']));if(!q)throw Error('구성·표·자료의 문항 연결이 끊겼습니다.');return q;}const qs=questions.filter(q=>q.number===text(r['번호']||r['연결 문항']));if(qs.length!==1)throw Error('문항 번호를 통해 구성을 연결할 수 없습니다. 번호와 숨김 ID를 확인하세요.');return qs[0];};
  const positions=[],blockIds=new Set(),lines=[];
  for(const r of namedRows(XLSX,wb.Sheets['구성'],PARTS_REQUIRED,10000)){
    const q=getQ(r);if(r['구성']==='발문'){if(text(r['내용'])!==q.ask&&old.get(q.id)?.ask===q.ask)q.ask=text(r['내용']);continue;}
    if(r['구성']==='선지') {let c=q.choices.find(c=>c.id===text(r['선지 ID']));if(!c)c=q.choices['①②③④⑤'.indexOf(r['이름'])];if(!c)throw Error('선지의 번호를 확인하세요.');c.text=text(r['내용']);if(text(r['배치']).trim()){const layout=parseChoiceLayout(r['배치']);if(q._choiceLayoutSeen&&q.choiceLayout!==layout)throw Error('한 문항의 선지 배열은 하나로 입력하세요.');q.choiceLayout=layout;q._choiceLayoutSeen=true;}positions.push({sheet:'구성',row:r.row,col:5,owner:{qid:q.id,cid:c.id}});continue;}
    if(text(r['구성']).endsWith(' 항목')){lines.push({q,r});continue;}
    const kind=Object.keys(KINDS).find(k=>KINDS[k]===r['구성']);if(!kind)throw Error('구성 종류는 설명·그림·표·묶음·과정·대화·보기 중에서 입력하세요.');const bid=text(r['구성 ID'])||uid(),nodeKey=q.id+':'+bid;if(blockIds.has(nodeKey))throw Error('구성 ID가 중복되었습니다.');blockIds.add(nodeKey);
    const previous=old.get(q.id)?.blocks.find(b=>b.id===bid),b=previous&&previous.kind===kind?clone(previous):block(kind);b.id=bid;b.label=text(r['이름']);b.text=text(r['내용']);b.parent=text(r['상위 ID'])||null;b.layout=text(r['배치'])||'세로';for(const [key,col,parse] of [['ratio','폭 비율',parseRatio],['size','크기',parseSize],['gap','간격',parseGap],['align','정렬',parseAlign],['pad','아래 여백',parseGap]]){const v=parse(r[col]);if(v===undefined)delete b[key];else b[key]=v;}if(b.lines)b.lines=[];b._order=Number(r['순서']);if(!Number.isFinite(b._order))throw Error('구성 순서는 숫자로 입력하세요.');q.blocks.push(b);
    if(kind==='figure')positions.push({sheet:'구성',row:r.row,col:5,owner:{qid:q.id,bid}});
  }
  for(const {q,r} of lines){const b=q.blocks.find(b=>b.id===text(r['구성 ID']));if(!b?.lines)throw Error('과정·대화·보기 항목의 연결을 확인하세요.');b.lines.push({id:text(r['항목 ID'])||uid(),label:text(r['이름']),text:text(r['내용']),_order:Number(r['순서'])});}
  questions.forEach(q=>{if(!q._choiceLayoutSeen)delete q.choiceLayout;delete q._choiceLayoutSeen;});
  questions.forEach(q=>{q.blocks.sort((a,b)=>a._order-b._order);q.blocks.forEach(b=>{delete b._order;if(b.lines){b.lines.sort((a,b)=>a._order-b._order);b.lines.forEach(l=>delete l._order);}});});
  const tws=wb.Sheets['표'],tableRows=readRows(XLSX,tws,20000),th=tableRows[0];if(!TABLES.filter(Boolean).every(h=>th.includes(h)))throw Error('표 목록의 열 이름을 확인하세요.');
  const indices=pack.excel?.indices||[];const indexCount=indices.length;
  if(indexCount>1000)throw Error('표 개수가 너무 많습니다.');const seenTables=new Set();
  for(const [ri,row] of tableRows.slice(1,indexCount+1).entries()){
    const r=Object.fromEntries(th.map((h,c)=>[h,row[c]??'']));if(!r['셀 범위'])throw Error('표의 셀 범위가 없습니다.');const q=getQ(r),bid=text(r['구성 ID']),b=bid==='choices'?null:q.blocks.find(b=>b.id===bid&&b.kind==='table');if(bid!=='choices'&&!b)throw Error('표와 구성의 연결이 끊겼습니다.');const key=q.id+':'+bid;if(seenTables.has(key))throw Error('표 ID가 중복되었습니다.');seenTables.add(key);
    if(!/^[A-Z]{1,2}[1-9]\d*:[A-Z]{1,2}[1-9]\d*$/.test(r['셀 범위']))throw Error('표의 셀 범위를 확인하세요.');const rg=XLSX.utils.decode_range(r['셀 범위']),rows=rg.e.r-rg.s.r+1,cols=rg.e.c-rg.s.c+1;if(rows!==Number(r['행'])||cols!==Number(r['열'])||rows>30||cols>12||rg.e.r>20000||rg.e.c>99)throw Error('표의 행·열과 셀 범위가 다릅니다.');
    const t=b?b.table:q.choiceTable,oldCells=clone(t.cells);t.rows=rows;t.cols=cols;t.headerRows=Number(r['머리글 행']);t.note=text(r['단위·각주']);t.diagonal=r['행 축']||r['열 축']?{row:text(r['행 축']),col:text(r['열 축'])}:null;
    t.cells=Array.from({length:rows},(_,y)=>Array.from({length:cols},(_,x)=>{const v=tws[XLSX.utils.encode_cell({r:rg.s.r+y,c:rg.s.c+x})]?.v??'';const cell=oldCells[y]?.[x]?clone(oldCells[y][x]):{value:''};if(v!==cell.value)delete cell.raw;cell.value=v;positions.push({sheet:'표',row:rg.s.r+y,col:rg.s.c+x,owner:{qid:q.id,bid,r:y,c:x}});return cell;}));t.merges=[];
    for(const m of tws['!merges']||[]){const intersects=m.s.r<=rg.e.r&&m.e.r>=rg.s.r&&m.s.c<=rg.e.c&&m.e.c>=rg.s.c;if(!intersects)continue;if(m.s.r<rg.s.r||m.e.r>rg.e.r||m.s.c<rg.s.c||m.e.c>rg.e.c)throw Error('병합이 표 범위를 벗어났습니다.');t.merges.push({r:m.s.r-rg.s.r,c:m.s.c-rg.s.c,rs:m.e.r-m.s.r+1,cs:m.e.c-m.s.c+1});}
  }
  for(const q of questions)for(const b of q.blocks.filter(b=>b.kind==='table'))if(!seenTables.has(q.id+':'+b.id))throw Error('구성에서 사용하는 표가 표 목록에 없습니다.');
  const documents=clone(pack.documents);questions.forEach(q=>q.references=q.references.filter(r=>!r.documentId));
  for(const r of namedRows(XLSX,wb.Sheets['자료'],['자료 이름','종류','쪽수','자료 ID','문항 ID','대상 ID','쪽','인용'],10000)) {
    const d=documents.find(d=>d.id===text(r['자료 ID']));if(!d)throw Error('자료 원문을 찾지 못했습니다. 새 자료는 화면에서 파일로 추가하세요.');d.name=text(r['자료 이름']);d.kind={'교과서':'textbooks','참고자료':'references','기출':'past'}[r['종류']]||d.kind;
    if(r['문항 ID']||r['연결 문항']){const q=getQ(r);q.references.push({target:text(r['대상 ID'])||'question',label:d.name+' '+r['쪽']+'쪽',documentId:d.id,page:Number(r['쪽']),quote:text(r['인용'])});}
  }
  const zip=await JSZip.loadAsync(buffer);const pics=await readPictures(zip,wb.SheetNames);
  for(const p of positions){const q=qmap.get(p.owner.qid),o=p.owner,b=o.bid==='choices'?{table:q.choiceTable}:q.blocks.find(b=>b.id===o.bid);const holder=o.cid?q.choices.find(c=>c.id===o.cid):o.r!==undefined?b?.table.cells[o.r]?.[o.c]:b;if(!holder)continue;
    const pic=pics.find(i=>i.sheet===p.sheet&&i.row===p.row&&i.col===p.col);if(pic){holder.figure=holder.figure?.data===pic.figure.data?{...holder.figure,name:pic.figure.name}:pic.figure;}else if(Object.hasOwn(holder,'figure'))holder.figure=null;
  }
  const unassigned=pics.filter(pic=>!positions.some(p=>p.sheet===pic.sheet&&p.row===pic.row&&p.col===pic.col));
  if(unassigned.length)throw Error(`구성·표의 지정 셀 밖에 그림 ${unassigned.length}개가 있습니다. 그림을 원래 구성의 그림 칸 또는 표 셀에 배치한 뒤 다시 올려주세요. 기존 입력은 보존했습니다.`);
  for(const {q,key,value} of overrides)writeField(q,key,value);
  for(const q of questions)syncForm(q);
  return {...validate({format:FORMAT,questions,documents}),backedIds:[...old.keys()],warnings:[]};
}
export async function readPictures(zip,names) {
  const pics=[],attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m=>[m[1],unesc(m[2])]));
  const resolve=(base,target)=>{if(/^[a-z]+:/i.test(target))throw Error('외부 그림 연결은 지원하지 않습니다. 그림을 파일 안에 넣어주세요.');const parts=(target.startsWith('/')?target.slice(1):base+'/'+target).split('/'),out=[];for(const p of parts)if(p==='..')out.pop();else if(p!=='.'&&p)out.push(p);return out.join('/');};
  const workbookXml=await zip.file('xl/workbook.xml').async('string'),workbookRels=await zip.file('xl/_rels/workbook.xml.rels').async('string'),wrels=[...workbookRels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map(m=>attrs(m[0]));
  const sheets=[...workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?\s*>/g)].map(m=>attrs(m[0]));
  for(const name of names) {
    const s=sheets.find(s=>s.name===name),wr=wrels.find(r=>r.Id===s?.['r:id']);if(!wr)throw Error('시트의 내부 연결을 확인하세요.');const sp=resolve('xl',wr.Target),base=sp.slice(0,sp.lastIndexOf('/'));
    const sheetXml=await zip.file(sp)?.async('string');const rid=sheetXml?.match(/<(?:\w+:)?drawing\b[^>]*r:id="([^"]+)"/)?.[1];if(!rid)continue;
    const sr=await zip.file(base+'/_rels/'+sp.slice(sp.lastIndexOf('/')+1)+'.rels')?.async('string');const rel=[...(sr||'').matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map(m=>attrs(m[0])).find(r=>r.Id===rid);if(!rel||rel.TargetMode==='External')throw Error('그림의 내부 연결을 확인하세요.');const dp=resolve(base,rel.Target);
    const dr=await zip.file(dp)?.async('string');if(!dr)throw Error('그림 배치 정보가 없습니다.');const dbase=dp.slice(0,dp.lastIndexOf('/')),dre=await zip.file(dbase+'/_rels/'+dp.slice(dp.lastIndexOf('/')+1)+'.rels')?.async('string');const rels=[...(dre||'').matchAll(/<Relationship\b[^>]*\/?\s*>/g)].map(m=>attrs(m[0]));
    for(const m of dr.matchAll(/<(?:\w+:)?(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/(?:\w+:)?(?:oneCellAnchor|twoCellAnchor)>/g)){const a=m[0],from=a.match(/<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/)?.[1];if(!from)continue;const row=Number(from.match(/<(?:\w+:)?row>(\d+)</)?.[1]),col=Number(from.match(/<(?:\w+:)?col>(\d+)</)?.[1]),embed=a.match(/r:embed="([^"]+)"/)?.[1];if(!embed)continue;const rel=rels.find(r=>r.Id===embed);if(!rel||rel.TargetMode==='External')throw Error('그림의 내부 연결을 확인하세요.');const path=resolve(dbase,rel.Target),f=zip.file(path);if(!f)throw Error('그림 파일이 없습니다.');const ext=path.split('.').pop().toLowerCase();if(!['png','jpg','jpeg','webp'].includes(ext))throw Error('엑셀 그림은 PNG·JPEG·WebP를 사용하세요.');const base64=await f.async('base64');if(base64.length>8*1024*1024)throw Error('그림이 너무 큽니다.');pics.push({sheet:name,row,col,figure:{name:unesc(a.match(/name="([^"]*)"/)?.[1]||'그림'),data:`data:image/${ext==='jpg'?'jpeg':ext};base64,${base64}`}});}
  }return pics;
}
