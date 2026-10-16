import {FORMAT,clone,validate,tableCovered} from './model.js';
import {mathParts} from './typeset-model.js';
import {splitWidths,sizedWidth,gapPx,choiceColumns} from './placement.js';

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels=['①','②','③','④','⑤'];
function choiceWidth(value,fontSize){
  const em=fontSize*4/3;
  return mathParts(value).reduce((sum,part)=>sum+(part.math?Math.max(4,[...part.text].length*.65)*em:[...part.text].reduce((n,c)=>n+em*(/\s/.test(c)?.5:c.codePointAt(0)<256?.62:1),0)),0);
}
// Short combinations share one baseline, as in the supplied exam. Longer
// choices get fewer columns; their numbers and continuation text stay together.
export function choiceGrid(choices,width,fontSize=11,layout){
  const fixed=choiceColumns(layout,choices.length);
  if(fixed)return {cols:fixed,widths:Array(fixed).fill(width/fixed),singleLine:fixed===choices.length};
  const sizes=choices.map((c,i)=>choiceWidth(labels[i]+' '+c.text,fontSize)+4);
  if(choices.every(c=>!/[\r\n]/.test(c.text))&&sizes.reduce((a,b)=>a+b,0)<=width){
    const gap=(width-sizes.reduce((a,b)=>a+b,0))/sizes.length;
    return {cols:sizes.length,widths:sizes.map(w=>w+gap),singleLine:true};
  }
  const max=Math.max(...sizes),cols=[3,2,1].find(n=>n<=choices.length&&max<=width/n)||1;
  return {cols,widths:Array(cols).fill(width/cols)};
}
// Break at word boundaries before native import. Cell auto-layout alone can
// squeeze a long header into one line and paint its Latin units into the next
// cell. Explicit lines keep the actual text editable and its font unchanged.
export function wrapQuestionText(value,width,fontSize=11){
  if(!width)return String(value??'');
  const em=fontSize*4/3,limit=Math.max(em,width),lines=[];
  const measure=word=>{
    let equations=0;const plain=word.replace(/EXAMPOOL_EQ_\d+_END/g,()=>{equations++;return '';});
    return equations*em*3+[...plain].reduce((sum,c)=>sum+em*(c.codePointAt(0)<256?/^[MW@]$/.test(c)?.95:.62:1),0);
  };
  for(const original of String(value??'').split(/\r?\n/)){
    let line='',used=0;
    for(const word of original.split(/\s+/)){
      const size=measure(word),space=line?em*.5:0;
      if(line&&used+space+size>limit){lines.push(line);line=word;used=size;}
      else{line+=(line?' ':'')+word;used+=space+size;}
    }
    lines.push(line);
  }
  return lines.join('\n');
}
export function handoffQuestion(value){
  const q=clone(value);q.references=[];
  validate({format:FORMAT,questions:[q],documents:[]});
  if(!q.ask.trim())throw Error('발문을 입력한 뒤 한글로 보내세요.');
  return q;
}

// HTML is an import boundary, not a screenshot: RHWP creates native nested
// tables, cell spans, text paragraphs and embedded picture controls from it.
export function wrapHangingText(value,width,prefix,measure){
  const indent=measure(prefix),lines=[];
  for(const original of String(value).split(/\r?\n/)){
    let line='';
    for(const word of original.split(/\s+/)){
      const candidate=line?line+' '+word:word,limit=width-(lines.length?indent:0);
      if(line&&measure(candidate)>limit){lines.push(line);line=word;}
      else line=candidate;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
export async function buildQuestionHtml(value,prepareFigure=async f=>f,width=540,{native=false,measureText}={}){
  const q=handoffQuestion(value),images=[],texts=[],warnings=[],tables=[],equations=[];
  const recordTable=(rows,cols,merges=[])=>tables.push({rows,cols,merges:merges.map(m=>`${m.r}:${m.c}:${m.rs}:${m.cs}`).sort()});
  const text=(v,width=null,fontSize=11,wrap=null)=>{
    let value=String(v??'');
    if(native)value=mathParts(value).map(part=>{if(!part.math){if(part.text.trim())texts.push(part.text);return part.text;}const marker=`EXAMPOOL_EQ_${equations.length}_END`;equations.push({marker,script:part.text,fontSize:fontSize*100});return marker;}).join('');
    else if(value.trim())texts.push(value);
    value=wrap?wrap(value):wrapQuestionText(value,width,fontSize);
    const body=E(value).replace(/\r?\n/g,'<br>');return native?`<span style="font-family:함초롬바탕;font-size:${fontSize}pt">${body}</span>`:body;
  };
  const p=(v,width=null,fontSize=11)=>`<p style="margin:4px 0">${text(v,width,fontSize)}</p>`;
  const opening=q.blocks.find(b=>b.parent===null),firstText=opening?.kind==='text'&&opening.text?opening:null;
  const prefix=q.number?`${q.number}. `:'';
  const picture=async(f,width,align)=>{
    if(!f)return '';
    const image=await prepareFigure(clone(f));
    if(!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(image.data))throw Error('한글에 넣을 그림을 PNG로 준비하지 못했습니다.');
    const ratio=Number(image.height)/Number(image.width);
    if(!Number.isFinite(ratio)||ratio<=0)throw Error('그림 크기를 확인하세요.');
    const w=Math.min(width,Number(image.width)),h=w*ratio;
    images.push(image.data);
    const img=`<img src="${image.data}" width="${Math.round(w)}" height="${Math.round(h)}" alt="${E(image.name)}">`;
    return align?`<p style="margin:0;text-align:${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}">${img}</p>`:img;
  };
  const table=async(t,width,choices=false,align)=>{
    recordTable(t.rows,t.cols+(choices?1:0),t.merges.map(m=>({...m,c:m.c+(choices?1:0)})));
    const fontSize=t.cols>3?9:10,cellWidth=(width-(choices?25:0))/t.cols;
    const rowHeights=Array(t.rows).fill(30);
    for(let r=0;r<t.rows;r++)for(let c=0;c<t.cols;c++){
      if(tableCovered(t,r,c))continue;
      const m=t.merges.find(m=>m.r===r&&m.c===c),span=m?.rs||1;
      const lines=wrapQuestionText(t.cells[r][c].value,cellWidth*(m?.cs||1)-16,fontSize).split('\n').length;
      const needed=Math.ceil(lines*fontSize*4/3*1.6+12);
      if(span===1)rowHeights[r]=Math.max(rowHeights[r],needed);
      else {const height=rowHeights.slice(r,r+span).reduce((a,b)=>a+b,0);if(needed>height)for(let i=r;i<r+span;i++)rowHeights[i]+=(needed-height)/span;}
    }
    let html=`<table${align?` align="${{왼쪽:'left',가운데:'center',오른쪽:'right'}[align]}"`:''} style="border-collapse:collapse;width:${width}px">`;
    for(let r=0;r<t.rows;r++){
      html+='<tr>';
      if(choices)html+=`<td style="border:none;width:25px">${text(r?labels[r-1]:'')}</td>`;
      for(let c=0;c<t.cols;c++){
        if(tableCovered(t,r,c))continue;
        const cell=t.cells[r][c],m=t.merges.find(m=>m.r===r&&m.c===c),tag=r<t.headerRows?'th':'td';
        const formatted=text(cell.value,cellWidth*(m?.cs||1)-16,fontSize).replace(/^<span[^>]*>|<\/span>$/g,'');
        // Separate paragraphs let the native cell center the entire header
        // block. A soft line break centers only its first line in this engine.
        let body=await picture(cell.figure,cellWidth*(m?.cs||1)-16)+formatted.split('<br>').map(line=>`<p style="margin:0;text-align:center;font-family:함초롬바탕;font-size:${fontSize}pt">${line}</p>`).join('');
        if(t.diagonal&&r===0&&c===0){
          body=p(t.diagonal.col)+p(t.diagonal.row)+body;
          warnings.push('대각선 머리글의 축 이름은 전달됩니다. 사선은 한글에서 지정하세요.');
        }
        html+=`<${tag}${m?` rowspan="${m.rs}" colspan="${m.cs}"`:''} style="border:1px solid #555;width:${cellWidth}px;height:${rowHeights.slice(r,r+(m?.rs||1)).reduce((a,b)=>a+b,0)}px;padding:4px;text-align:center;vertical-align:middle">${body}</${tag}>`;
      }
      html+='</tr>';
    }
    return html+'</table>'+(t.note?p(t.note,width-12,10):'');
  };
  // 간격(mm): 구성 앞에 높이를 가진 빈 문단을 둔다. 값이 없으면 넣지 않는다.
  const spacer=b=>{const px=gapPx(b);return px?`<p style="margin:0;font-size:1pt;line-height:100%;height:${Math.round(px)}px;margin-top:${Math.round(px)}px"> </p>`:'';};
  const walk=async(parent,width,onlyId=null)=>{
    let html='';
    for(const b of q.blocks.filter(b=>b.parent===parent&&(!onlyId||b.id===onlyId))){
      if(b===firstText)continue;
      html+=spacer(b);
      if(b.kind==='text')html+=b.text?p(b.text,width):'';
      else if(b.kind==='figure'){
        if(b.figure)html+=p('')+await picture(b.figure,sizedWidth(b,width),b.align)+(/^\(.+\)$/.test(b.label)||b.text?p((/^\(.+\)$/.test(b.label)?b.label:'')+(b.text?' '+b.text:''),width):'');
      }else if(b.kind==='table')html+=await table(b.table,sizedWidth(b,width),false,b.align);
      else if(b.kind==='group'){
        const boxed=b.boxed===true||b.boxed===undefined&&b.label==='실험',children=q.blocks.filter(x=>x.parent===b.id);let body;
        const innerWidth=Math.max(35,width-(boxed?22:0));
        if(boxed&&b.layout==='나란히'&&children.length>1){
          // 상자 + 가로 묶음은 한 표로 만든다. 표를 세 겹 넣으면(상자→가로→결과표) 한글 엔진이
          // 안쪽 표의 병합을 잃는다. 첫 행은 묶음 이름(합친 칸), 둘째 행은 자식 칸.
          const widths=splitWidths(children,width),n=children.length,rule='1px solid #555';
          recordTable(2,n,[{r:0,c:0,rs:1,cs:n}]);
          let cells='';
          for(const [i,child] of children.entries())cells+=`<td style="border:none;border-bottom:${rule};${i===0?`border-left:${rule};`:''}${i===n-1?`border-right:${rule};`:''}padding:5px 8px 8px;vertical-align:top;width:${widths[i]}px">${await walk(b.id,Math.max(35,widths[i]-22),child.id)}</td>`;
          html+=`<table style="border-collapse:collapse;width:${width}px"><tr><td colspan="${n}" style="border:none;border-top:${rule};border-left:${rule};border-right:${rule};width:${width}px;padding:8px 8px 0">${p(b.label)}</td></tr><tr>${cells}</tr></table>`;
          continue;
        }
        if(b.layout==='나란히'&&children.length){
          recordTable(1,children.length);
          body=`<table style="border-collapse:collapse;width:${innerWidth}px"><tr>`;
          // Render the children individually while keeping their own descendants.
          const widths=splitWidths(children,innerWidth);
          for(const [i,child] of children.entries()){
            body+=`<td style="border:none;padding:5px;vertical-align:top;width:${widths[i]}px">${await walk(b.id,Math.max(35,widths[i]-16),child.id)}</td>`;
          }
          body+='</tr></table>';
        }else body=await walk(b.id,innerWidth);
        if(boxed)recordTable(1,1);
        html+=boxed?`<table style="border-collapse:collapse;width:${width}px"><tr><td style="border:1px solid #555;width:${width}px;height:32px;padding:8px">${p(b.label)}${body}</td></tr></table>`:body;
      }else if(b.lines){
        if(b.kind==='bogi'){
          // The supplied exam uses a centered title that interrupts the top
          // rule. A native table preserves that cutout without a bitmap or a
          // floating overlay: two shallow header rows and one merged body.
          const titleWidth=54,side=(width-titleWidth)/2,rule='0.4pt solid #000';
          recordTable(3,3,[{r:0,c:1,rs:2,cs:1},{r:2,c:0,rs:1,cs:3}]);
          const empty='<p style="margin:0;font-size:1pt;line-height:100%"> </p>';
          const sideCell=(edge,line=false)=>`<td style="width:${side}px;height:12px;padding:0.1px;border:none;${line?`border-bottom:${rule}`:`border-${edge}:${rule}`} ;vertical-align:top">${empty}</td>`;
          let bodyLines=0;
          const measure=measureText||((v)=>choiceWidth(v,11));
          const body=b.lines.map(l=>{
            const label=/^[ㄱ-ㅎ]$/.test(l.label)?l.label+'.':l.label,prefix=label+' ';
            const wrap=v=>{const result=wrapHangingText(v,width-12,prefix,measure);bodyLines+=result.split('\n').length;return result;};
            return `<p style="margin:0;text-align:left;line-height:150%">${text(prefix+l.text,null,11,wrap)}</p>`;
          }).join('');
          // The last line needs its glyph height and bottom padding, rather
          // than another full line gap. Explicit height also protects nested
          // tables, whose parent does not expand an implicit HTML row.
          const bodyHeight=Math.ceil(Math.max(0,bodyLines-1)*11*4/3*1.6+11*4/3+7+(b.parent?3:0));
          html+=`<table style="border-collapse:collapse;width:${width}px"><tr>${sideCell('left',true)}<td rowspan="2" style="width:${titleWidth}px;height:24px;padding:0.1px;border:none;vertical-align:middle"><p style="margin:0;text-align:center;line-height:100%">${text('<보 기>')}</p></td>${sideCell('right',true)}</tr><tr>${sideCell('left')}${sideCell('right')}</tr><tr><td colspan="3" style="width:${width}px;height:${bodyHeight}px;padding:3px 6px 4px;border:none;border-left:${rule};border-right:${rule};border-bottom:${rule};vertical-align:top">${body}</td></tr></table>`;
        }else html+=(b.kind==='steps'?p(b.label):'')+b.lines.map(l=>p(l.label+' '+l.text,width)).join('');
      }
    }
    return html;
  };
  // A question number belongs to the opening paragraph. Native hanging
  // indentation is measured from this prefix after import, never added spaces.
  let html=`<p style="margin:4px 0;text-align:left">${text(prefix+(firstText?firstText.text:q.ask),width-prefix.length*7)}</p>`+await walk(null,width)+(firstText?p(q.ask,width):'');
  if(q.type!=='서술형'){
    if(q.style==='대응표')html+=await table(q.choiceTable,width,true);
    else if(q.style==='그림·그래프'){
      {const per=choiceColumns(q.choiceLayout,q.choices.length)||2;recordTable(Math.ceil(q.choices.length/per),per);}
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      const per=choiceColumns(q.choiceLayout,q.choices.length)||2;for(let i=0;i<q.choices.length;i+=per){html+='<tr>';for(let j=i;j<i+per;j++){const c=q.choices[j];html+=`<td style="border:none;width:${width/per}px;padding:5px;vertical-align:top">${c?p(labels[j]+' '+c.text)+await picture(c.figure,width/per-20):''}</td>`;}html+='</tr>';}
      html+='</table>';
    }else {
      const fontSize=q.style==='조합'?10:11,grid=choiceGrid(q.choices,width,fontSize,q.choiceLayout),rows=Math.ceil(q.choices.length/grid.cols);
      recordTable(rows,grid.cols);
      html+=`<table style="border-collapse:collapse;width:${width}px">`;
      for(let row=0;row<rows;row++){
        const cells=grid.widths.map((w,col)=>{const i=row*grid.cols+col,c=q.choices[i],available=grid.singleLine?w-4:w-8-choiceWidth(labels[i]+' ',fontSize),value=c?labels[i]+' '+c.text:'';return {w,value,height:Math.max(25,Math.ceil(wrapQuestionText(value,available,fontSize).split('\n').length*fontSize*4/3*1.6+6)),available};});
        const height=Math.max(...cells.map(c=>c.height));
        html+='<tr>'+cells.map(c=>`<td style="border:none;width:${c.w}px;height:${height}px;padding:2px;vertical-align:top"><p style="margin:0;text-align:left;line-height:150%">${text(c.value,c.available,fontSize)}</p></td>`).join('')+'</tr>';
      }
      html+='</table>';
    }
  }
  html+='<p><br></p>';
  return {html:`<div style="font-family:함초롬바탕;font-size:10pt">${html}</div>`,images,texts,tables,equations,warnings:[...new Set(warnings)]};
}

export function verifyNativeQuestion(document,plan){
  const normalized=v=>String(v).replace(/\s+/g,' ').trim();
  const raw=document.getTextFileText(),body=normalized(raw.startsWith('"')?JSON.parse(raw):raw);
  if(plan.texts.some(v=>!body.includes(normalized(v))))throw Error('한글에서 일부 글을 읽지 못했습니다. 기존 시험지는 보존했습니다.');
  const seen=new Set(),images=[],tables=new Map();
  for(let page=0;page<document.pageCount();page++)for(const c of JSON.parse(document.getPageControlLayout(page)).controls||[]){
    if(c.type==='table'){
      const key=JSON.stringify(c.stableIndex||[c.secIdx,c.paraIdx,c.controlIdx]),item=tables.get(key)||{rows:c.rowCount,cols:c.colCount,merges:new Set()};
      for(const cell of c.cells||[])if(cell.rowSpan>1||cell.colSpan>1)item.merges.add(`${cell.row}:${cell.col}:${cell.rowSpan}:${cell.colSpan}`);
      tables.set(key,item);continue;
    }
    if(c.type!=='image')continue;
    const path=JSON.stringify(c.cellPath||[]),key=JSON.stringify([c.secIdx,c.paraIdx,path,c.controlIdx]);
    if(seen.has(key))continue;seen.add(key);
    images.push(document.getControlImageData(c.secIdx,c.paraIdx,path,c.controlIdx));
  }
  const expected=plan.images.map(v=>Uint8Array.from(atob(v.split(',')[1]),c=>c.charCodeAt(0)));
  for(const bytes of expected){const at=images.findIndex(v=>v.length===bytes.length&&v.every((b,i)=>b===bytes[i]));if(at<0)throw Error('한글에서 일부 그림을 읽지 못했습니다. 기존 시험지는 보존했습니다.');images.splice(at,1);}
  if(images.length)throw Error('한글 그림 개수가 원래 문항과 다릅니다. 기존 시험지는 보존했습니다.');
  const actual=[...tables.values()].map(t=>JSON.stringify({rows:t.rows,cols:t.cols,merges:[...t.merges].sort()})).sort();
  const expectedTables=plan.tables.map(t=>JSON.stringify(t)).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expectedTables))throw Error('한글에서 표의 행·열 또는 병합이 달라졌습니다. 기존 시험지는 보존했습니다.');
}
