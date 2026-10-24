import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeQuestionImport,applyQuestionIndent,applyReferenceBogiIndent} from '../assets/exampool/sheet/typeset-model.js';
import {applyTableAlignment,applyHangingIndent,installTableShortcuts} from '../js/rhwp-exam-table-controls.js';
const require=createRequire(import.meta.url),JSZip=require('../assets/exampool/sheet/vendor/jszip.min.js');
const json=JSON.stringify;
const path=[{controlIndex:0,cellIndex:0,cellParaIndex:4},{controlIndex:0,cellIndex:6,cellParaIndex:0}];
const lists=[{listId:2,isCell:true,sectionIndex:0,hostListId:0,hostPara:2,controlIndex:0,cellIndex:0},{listId:9,isCell:true,sectionIndex:0,hostListId:2,hostPara:4,controlIndex:0,cellIndex:6}];
function fixture(inCell=false){
 const calls=[],pos=inCell?{sectionIndex:0,parentParaIndex:2,cellPath:path,charOffset:3}:{sectionIndex:0,paragraphIndex:1,charOffset:3};
 const d={getCursorModel:()=>json({lists}),getCursorRect:(_s,_p,offset)=>json({x:56.7+offset*6}),getCursorRectByPath:(_s,_p,_path,offset)=>json({x:70+offset*6}),applyParaFormat:(...args)=>{calls.push(['body',...args]);return json({ok:true});},applyParaFormatAtCursor:(...args)=>{calls.push(['list',...args]);return json({ok:true});}};
 const cursor={isInCell:()=>inCell,hasSelection:()=>false},input={cursor,getCursorPosition:()=>pos,textarea:{}},bridge={input,wasm:{borrowDocumentHandle:()=>d},transaction:(name,fn)=>{calls.push(['undo',name]);return fn();}};
 return {bridge,calls,d,pos};
}
test('inline table anchors are centered independently of text paragraphs, including nested anchors',async()=>{
 const zip=new JSZip();zip.file('Contents/header.xml','<hh:paraProperties itemCnt="1"><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/><hc:left value="1500"/><hc:intent value="0"/></hh:paraPr></hh:paraProperties>');
 zip.file('Contents/section0.xml','<hp:p paraPrIDRef="0"><hp:t>prose</hp:t></hp:p><hp:p paraPrIDRef="0"><hp:tbl><hp:outMargin left="283" right="283" top="283"/><hp:tr><hp:tc hasMargin="0"><hp:p paraPrIDRef="0"><hp:tbl><hp:tr><hp:tc hasMargin="0"><hp:p paraPrIDRef="0"><hp:t>A</hp:t></hp:p></hp:tc></hp:tr></hp:tbl></hp:p></hp:tc></hp:tr></hp:tbl></hp:p>');
 const result=await JSZip.loadAsync(await normalizeQuestionImport(await zip.generateAsync({type:'uint8array'}),JSZip)),h=await result.file('Contents/header.xml').async('string'),s=await result.file('Contents/section0.xml').async('string');
 assert(h.includes('itemCnt="2"'));assert(h.includes('horizontal="CENTER"'));assert(h.includes('horizontal="JUSTIFY"'));
 assert.equal((s.match(/paraPrIDRef="1"/g)||[]).length,2);assert(s.includes('paraPrIDRef="0"><hp:t>prose'));assert(!s.includes('hasMargin="0"'));assert(s.includes('left="0" right="0" top="283"'));
});
test('question indent uses the actual width of the complete number prefix',()=>{
 const f=fixture();f.d.pageCount=()=>1;f.d.getPageTextLayout=()=>json({runs:[{secIdx:0,paraIdx:1,text:'12. '}]});f.d.reflowLinesegs=()=>{};
 applyQuestionIndent(f.d,'12');assert.deepEqual(JSON.parse(f.calls[0][3]),{indent:-3600});
});
test('reference bogi measures actual labels and changes only the matching nested paragraphs',async()=>{
 const titlePath=[{controlIndex:0,cellIndex:0,cellParaIndex:0},{controlIndex:0,cellIndex:1,cellParaIndex:0}],bodyPath=titlePath.map(v=>({...v}));bodyPath[1].cellIndex=5;
 const run=(text,cellPath,charStart=0)=>({secIdx:0,parentParaIdx:0,text,cellPath,charStart});
 const runs=[run('<보 기>',titlePath),run('ㄱ. 긴 문장',bodyPath),run('이어지는 문장',bodyPath,8),run('ㄱ. 다른 표',path)];
 const zip=new JSZip();zip.file('Contents/header.xml','<hh:paraProperties itemCnt="1"><hh:paraPr id="0"><hc:intent value="0" unit="HWPUNIT"/></hh:paraPr></hh:paraProperties>');
 const p=t=>`<hp:p paraPrIDRef="0"><hp:run><hp:t>${t}</hp:t></hp:run><hp:linesegarray><hp:lineseg vertpos="9000"/></hp:linesegarray></hp:p>`,cell=t=>`<hp:tc><hp:subList>${p(t)}</hp:subList></hp:tc>`;
 const inner='<hp:tbl><hp:tr>'+['','&lt;보 기&gt;','','','','ㄱ. 긴 문장'].map(cell).join('')+'</hp:tr></hp:tbl>';
 const original=p('<hp:tbl><hp:tr><hp:tc><hp:subList>'+p(inner)+'</hp:subList></hp:tc></hp:tr></hp:tbl>')+p('ㄱ. 다른 표');zip.file('Contents/section0.xml',original);
 const bytes=await zip.generateAsync({type:'uint8array'}),d={pageCount:()=>1,getPageTextLayout:()=>json({runs}),getCursorRectByPath:(_s,_p,_path,offset)=>json({x:75+(offset===3?26.3:0)}),exportHwpx:()=>bytes,
   // 10-24 지적 9: 「ㄱ.」 뒤 보통 띄어쓰기를 고정 띄어쓰기(U+00A0)로 바꾼다 — 바꾼 자리를 기록.
   edits:[],deleteTextInCellByPath(...a){this.edits.push(['del',...a]);},insertTextInCellByPath(...a){this.edits.push(['ins',...a]);}};
 const result=await JSZip.loadAsync(await applyReferenceBogiIndent(d,JSZip));
 assert.deepEqual(d.edits.map(e=>[e[0],e[4],e.at(-1)]),[['del',2,1],['ins',2,'\u00a0']],'「ㄱ.」 뒤 한 칸만 고정 띄어쓰기로');
 const h=await result.file('Contents/header.xml').async('string'),s=await result.file('Contents/section0.xml').async('string');
 assert(Math.abs(Number(h.match(/value="(-\d+)"/)[1])/75+26.3)<.02);assert(h.includes('itemCnt="2"'));assert.equal((s.match(/paraPrIDRef="1"/g)||[]).length,1);assert(s.includes('paraPrIDRef="0"><hp:run><hp:t>ㄱ. 다른 표'));assert.equal((s.match(/vertpos="9000"/g)||[]).length,(original.match(/vertpos="9000"/g)||[]).length-1);
});
test('Shift+Tab keeps text unchanged and formats the current body or nested cell in one undo step',()=>{
 for(const inCell of [false,true]){const f=fixture(inCell);assert(applyHangingIndent(f.bridge));assert.equal(f.calls[0][0],'undo');const call=f.calls[1];assert.equal(call[0],inCell?'list':'body');assert.deepEqual(JSON.parse(call[3]),{indent:-2700});if(inCell)assert.deepEqual(call.slice(1,3),[9,0]);}
});
test('table position targets the nested anchor rather than aligning the text inside a cell',()=>{
 const f=fixture(true);applyTableAlignment(f.bridge,'right');assert.deepEqual(f.calls[1].slice(0,3),['list',2,4]);assert.deepEqual(JSON.parse(f.calls[1][3]),{alignment:'right'});
 assert.throws(()=>applyTableAlignment(fixture().bridge,'center'),/셀을 먼저/);
});
test('Shift+Tab only intercepts the native editor; sheet navigation retains its shortcut',()=>{
 const f=fixture(),listeners=[];f.bridge.editor={element:{contentDocument:{addEventListener:(_n,fn)=>listeners.push(fn)}}};installTableShortcuts(f.bridge);
 let prevented=0;const event={key:'Tab',shiftKey:true,target:{},preventDefault:()=>prevented++,stopImmediatePropagation:()=>{}};listeners[0](event);assert.equal(prevented,0);
 event.target=f.bridge.input.textarea;listeners[0](event);assert.equal(prevented,1);
});
