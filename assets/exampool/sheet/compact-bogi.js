import {wrapHangingText} from './handoff.js';
import {exportLayoutHwpx} from './native-hwpx.js?v=1014-compact-panel';

const decode=text=>text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const normalized=text=>text.replace(/\s+/g,'');
const tableKey=run=>JSON.stringify([run.secIdx,run.parentParaIdx,run.cellPath.slice(0,-1),run.cellPath.at(-1).controlIndex]);

// Migrate just the reference 보기 in an approved native document. Its title,
// border styles, paragraph/character styles and all other objects survive.
// Complex or manually mixed runs are retained rather than flattened.
export async function compactSavedBogi(document,question,JSZip,CFB){
  const bytes=exportLayoutHwpx(document,CFB),zip=await JSZip.loadAsync(bytes);
  let xml=await zip.file('Contents/section0.xml').async('string');
  const allRuns=[];for(let page=0;page<document.pageCount();page++)allRuns.push(...JSON.parse(document.getPageTextLayout(page)).runs);
  const titles=allRuns.filter(r=>r.text==='<보 기>'&&r.cellPath?.length),tables=[],stack=[];
  for(const token of xml.matchAll(/<hp:tbl\b[^>]*>|<\/hp:tbl>/g)){
    if(token[0].startsWith('</')){const table=stack.pop();table.end=token.index+token[0].length;tables.push(table);}
    else stack.push({start:token.index});
  }
  const changes=[];
  for(const table of tables.sort((a,b)=>a.start-b.start)){
    const source=xml.slice(table.start,table.end);
    if(!/^<hp:tbl\b[^>]*rowCnt="3"[^>]*colCnt="3"/.test(source)||!source.includes('&lt;보 기&gt;')||source.slice(source.indexOf('>')+1).includes('<hp:tbl '))continue;
    const cells=[...source.matchAll(/<hp:tc\b[^>]*>[\s\S]*?<\/hp:tc>/g)],cell=cells[5];if(cells.length!==6||!cell)continue;
    const paragraphs=[...cell[0].matchAll(/<hp:p\b[^>]*>[\s\S]*?<\/hp:p>/g)];
    const texts=paragraphs.map(p=>decode([...p[0].matchAll(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g)].map(m=>m[1].replace(/<[^>]*>/g,'')).join('')));
    const bogi=question.blocks.find(b=>b.kind==='bogi'&&b.lines.length===texts.length&&b.lines.every((l,i)=>normalized((/^[ㄱ-ㅎ]$/.test(l.label)?l.label+'.':l.label)+' '+l.text)===normalized(texts[i])));
    if(!bogi)continue;
    const title=titles.find(t=>allRuns.filter(r=>r.cellPath?.at(-1)?.cellIndex===5&&tableKey(r)===tableKey(t)&&r.charStart===0).map(r=>normalized(r.text)).every((text,i)=>normalized(texts[i]||'').startsWith(text)));
    if(!title)continue;
    const runs=allRuns.filter(r=>r.cellPath?.at(-1)?.cellIndex===5&&tableKey(r)===tableKey(title));
    const size=cell[0].match(/<hp:cellSz\b[^>]*width="(\d+)"[^>]*height="(\d+)"/);if(!size)continue;
    let height=7+(title.cellPath.length>1?3:0),lastGap=0,body=cell[0],safe=true;
    for(let i=paragraphs.length-1;i>=0;i--){
      const p=paragraphs[i],nativeRuns=runs.filter(r=>r.cellPath.at(-1).cellParaIndex===i),ids=new Set([...p[0].matchAll(/<hp:run\b[^>]*charPrIDRef="(\d+)"/g)].map(m=>m[1]));
      if(ids.size!==1||!nativeRuns.length||p[0].includes('<hp:equation')||p[0].includes('<hp:pic')){safe=false;break;}
      const widths=new Map();let font=0;
      for(const r of nativeRuns){font=Math.max(font,r.fontSize||r.h);for(let c=0;c<r.text.length;c++){const advance=r.charX?.[c+1]-r.charX?.[c];if(Number.isFinite(advance))widths.set(r.text[c],advance);}}
      const measure=text=>[...text].reduce((sum,c)=>sum+(widths.get(c)??(c===' '?font*.5:font)),0);
      const l=bogi.lines[i],prefix=(/^[ㄱ-ㅎ]$/.test(l.label)?l.label+'.':l.label)+' ';
      const wrapped=wrapHangingText(prefix+l.text,Number(size[1])/75-12,prefix,measure),lineCount=wrapped.split('\n').length;
      const lineYs=[...new Set(nativeRuns.map(r=>r.y))].sort((a,b)=>a-b),pitch=lineYs.length>1?lineYs[1]-lineYs[0]:font*1.6;
      height+=lineCount*pitch;if(i===paragraphs.length-1)lastGap=pitch-font;
      const replacement=p[0].replace(/<hp:run\b[\s\S]*<\/hp:run>/,`<hp:run charPrIDRef="${[...ids][0]}"><hp:t>${escape(wrapped).replace(/\n/g,'<hp:lineBreak/>')}</hp:t></hp:run>`).replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'');
      body=body.slice(0,p.index)+replacement+body.slice(p.index+p[0].length);
    }
    if(!safe)continue;
    const bodyHeight=Math.ceil((height-lastGap)*75),oldHeight=Number(size[2]);
    body=body.replace(/(<hp:cellSz\b[^>]*height=")\d+"/,`$1${bodyHeight}"`).replace(/<hp:cellMargin\b[^>]*\/>/,'<hp:cellMargin left="450" right="450" top="225" bottom="300"/>');
    let updated=source.slice(0,cell.index)+body+source.slice(cell.index+cell[0].length);
    // The table size precedes its cells. Leave column widths and title rows.
    updated=updated.replace(/(<hp:sz\b[^>]*height=")(\d+)"/,(_m,start,old)=>`${start}${Number(old)+bodyHeight-oldHeight}"`);
    changes.push({start:table.start,end:table.end,text:updated});titles.splice(titles.indexOf(title),1);
  }
  for(const change of changes.sort((a,b)=>b.start-a.start))xml=xml.slice(0,change.start)+change.text+xml.slice(change.end);
  if(!changes.length)return bytes;
  zip.file('Contents/section0.xml',xml);return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
