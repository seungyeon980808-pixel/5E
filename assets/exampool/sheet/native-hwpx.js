// The pinned native HWPX writer omits equation and explicit-break line segments.
// Preserve the native engine's actual segments from its HWP serialization;
// do not estimate text widths, baselines or inline-control offsets in JS.
export function exportLayoutHwpx(document,CFB){
  const bytes=document.exportHwpx();
  if(!CFB)throw Error('한글 저장 도구를 준비한 뒤 다시 시도하세요.');
  const archive=CFB.read(bytes,{type:'array'}),decode=new TextDecoder(),encode=new TextEncoder();
  let binary=null,changed=false;
  for(let section=0;section<document.getSectionCount();section++){
    const file=archive.FileIndex[archive.FullPaths.findIndex(p=>p.endsWith(`Contents/section${section}.xml`))];
    if(!file)throw Error('한글 구역을 읽지 못했습니다.');
    let xml=decode.decode(file.content);
    // Cached line positions on an empty inline-table anchor can place the
    // table above the preceding wrapped prompt when HWPX is reopened. Let
    // the engine calculate that anchor from its real table height. Preserve
    // every text/equation paragraph and all nested cell line geometry.
    const flow=restackPictureLines(clearEmptyTableAnchorLines(xml));if(flow!==xml){xml=flow;file.content=encode.encode(xml);file.size=file.content.length;changed=true;}
    // 어울림 그림(글자처럼 취급 안 함)이 든 문단도 줄 배치를 빠뜨리면 다시 열 때 글이 그림 쪽으로 흐른다.
    const floating=/<hp:pos\b[^>]*treatAsChar="0"/;
    if(!xml.includes('<hp:equation')&&!xml.includes('<hp:lineBreak')&&!floating.test(xml))continue;
    binary ||= CFB.read(document.exportHwp(),{type:'array'});
    const header=binary.FileIndex[binary.FullPaths.findIndex(p=>p.endsWith('/FileHeader'))].content;
    const stream=binary.FileIndex[binary.FullPaths.findIndex(p=>p.endsWith(`/BodyText/Section${section}`))].content;
    let body=new Uint8Array(stream);if(header[36]&1){body.l=0;body=CFB.utils._inflateRaw(body);}
    const data=new DataView(body.buffer,body.byteOffset,body.byteLength),segments=[];
    for(let pos=0;pos<body.length;){
      if(pos+4>body.length)throw Error('한글 문단 정보가 불완전합니다.');
      const record=data.getUint32(pos,true);pos+=4;let size=record>>>20;
      if(size===4095){size=data.getUint32(pos,true);pos+=4;}
      if(pos+size>body.length)throw Error('한글 문단 범위를 확인하세요.');
      const tag=record&1023;
      if(tag===66)segments.push([]);
      if(tag===69){if(size%36||!segments.length)throw Error('한글 줄 배치를 읽지 못했습니다.');
        for(let i=0;i<size;i+=36)segments.at(-1).push(Array.from({length:9},(_,j)=>data.getUint32(pos+i+j*4,true)));
      }
      pos+=size;
    }
    const paragraphs=[],stack=[];
    for(const match of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>/g)){
      if(match[0].startsWith('</')){const p=stack.pop();if(!p)throw Error('한글 문단 구조를 확인하세요.');p.end=match.index;}
      else{const p={start:match.index,body:match.index+match[0].length};paragraphs.push(p);stack.push(p);}
    }
    if(stack.length||paragraphs.length!==segments.length)throw Error('수식 문단의 저장 배치를 확인하지 못했습니다. 문항 조판을 다시 여세요.');
    const keys=['textpos','vertpos','vertsize','textheight','baseline','spacing','horzpos','horzsize','flags'];let output=xml;
    // Work backwards so nested paragraph edits retain their original offsets.
    for(let i=paragraphs.length-1;i>=0;i--){const p=paragraphs[i],body=xml.slice(p.body,p.end);
      // Only leaf equation/break paragraphs require the writer repair. Parent table
      // paragraphs retain their native cell placement and borders.
      if((!body.includes('<hp:equation')&&!body.includes('<hp:lineBreak')&&!floating.test(body))||body.includes('<hp:p ')||!segments[i].length)continue;
      const clean=body.replace(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/g,'');
      const lines='<hp:linesegarray>'+segments[i].map(values=>'<hp:lineseg '+keys.map((key,j)=>`${key}="${values[j]}"`).join(' ')+'/>').join('')+'</hp:linesegarray>';
      output=output.slice(0,p.body)+clean+lines+output.slice(p.end);changed=true;
    }
    output=restackPictureLines(output);
    file.content=encode.encode(output);file.size=file.content.length;
  }
  return changed?new Uint8Array(CFB.write(archive,{type:'array',fileType:'zip'})):bytes;
}

export function clearEmptyTableAnchorLines(xml){
  const stack=[],ranges=[];
  for(const token of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>|<hp:tbl\b|<hp:t(?:\s[^>]*)?>[\s\S]*?<\/hp:t>/g)){
    if(token[0].startsWith('<hp:p '))stack.push({table:false,text:false});
    else if(token[0]==='</hp:p>'){
      const p=stack.pop();if(stack.length||!p?.table||p.text)continue;
      const start=xml.lastIndexOf('</hp:run>',token.index)+9,tail=xml.slice(start,token.index),line=tail.match(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/);
      if(line)ranges.push([start+line.index,start+line.index+line[0].length]);
    }else if(token[0].startsWith('<hp:tbl')&&stack.length===1)stack[0].table=true;
    else if(stack.length===1&&token[0].replace(/<[^>]+>/g,'').trim())stack[0].text=true;
  }
  for(const [start,end] of ranges.reverse())xml=xml.slice(0,start)+xml.slice(end);
  return xml;
}

// 글 없이 그림만 든 문단(글 아래 그림)의 줄 위치도 들여올 때의 값(수식 자리표시 글자로 길어진 앞 문단 기준)이 남아
// 그림 위에 큰 빈칸이 생긴다. 줄 배치를 지우면 한글 엔진이 그림을 빠뜨리므로, 바로 앞 문단이 끝나는 자리로 고쳐 둔다.
// 앞 문단 끝을 모르면(줄 배치를 비운 표 문단) 0으로 두어 엔진이 흐름대로 놓게 한다.
export function restackPictureLines(xml){
  const stack=[],roots=[];
  for(const token of xml.matchAll(/<hp:p\b[^>]*>|<\/hp:p>|<hp:pic\b|<hp:tbl\b|<hp:t(?:\s[^>]*)?>[\s\S]*?<\/hp:t>/g)){
    if(token[0].startsWith('<hp:p ')){const p={start:token.index,pic:false,other:false};if(!stack.length)roots.push(p);stack.push(p);}
    else if(token[0]==='</hp:p>'){const p=stack.pop();if(!stack.length&&p)p.end=token.index;}
    else if(stack.length===1&&token[0].startsWith('<hp:pic'))stack[0].pic=true;
    else if(stack.length===1&&(token[0].startsWith('<hp:tbl')||token[0].replace(/<[^>]+>/g,'').trim()))stack[0].other=true;
  }
  const value=(tag,key)=>Number(tag.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1]);
  const edits=[];let prevEnd=null;
  for(const p of roots){
    if(p.end===undefined){prevEnd=null;continue;}
    const tail=xml.slice(p.start,p.end),own=tail.slice(tail.lastIndexOf('</hp:run>')+1),array=own.match(/<hp:linesegarray>[\s\S]*?<\/hp:linesegarray>/),segs=array?[...array[0].matchAll(/<hp:lineseg\b[^>]*>/g)].map(m=>m[0]):[];
    if(p.pic&&!p.other&&segs.length===1){
      const want=prevEnd??0,at=p.start+(tail.length-own.length)+array.index+array[0].indexOf(segs[0]);
      if(value(segs[0],'vertpos')!==want)edits.push([at,segs[0],segs[0].replace(/\bvertpos="-?\d+"/,`vertpos="${want}"`)]);
    }else if(p.pic&&!p.other&&!array){
      // 가운데 맞춘 그림 문단은 한글 엔진의 HWPX 쓰기가 줄 배치를 빠뜨린다. 그림 크기로 한 줄을 써 둔다.
      const pics=[...tail.matchAll(/<hp:pic\b[\s\S]*?<\/hp:pic>/g)].map(m=>m[0]),size=pic=>{const sz=pic.match(/<hp:sz\b[^>]*>/)?.[0]||'',margin=pic.match(/<hp:outMargin\b[^>]*>/)?.[0]||'';return {w:value(sz,'width')+(value(margin,'left')||0)+(value(margin,'right')||0),h:value(sz,'height')+(value(margin,'top')||0)+(value(margin,'bottom')||0)};};
      const sizes=pics.map(size).filter(s=>Number.isFinite(s.w)&&Number.isFinite(s.h));
      if(sizes.length===pics.length&&sizes.length){
        const h=Math.max(...sizes.map(s=>s.h)),w=sizes.reduce((a,s)=>a+s.w,0);
        const seg=`<hp:lineseg textpos="0" vertpos="${prevEnd??0}" vertsize="${h}" textheight="${h}" baseline="${Math.round(h*.85)}" spacing="600" horzpos="0" horzsize="${w}" flags="393216"/>`;
        edits.push([p.end,'',`<hp:linesegarray>${seg}</hp:linesegarray>`]);segs.push(seg);
      }
    }
    const last=segs.at(-1);prevEnd=last?value(last,'vertpos')+value(last,'vertsize')+value(last,'spacing'):null;
    if(!Number.isFinite(prevEnd))prevEnd=null;
  }
  for(const [at,old,next] of edits.reverse())xml=xml.slice(0,at)+next+xml.slice(at+old.length);
  return xml;
}
