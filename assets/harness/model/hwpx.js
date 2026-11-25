// 한글에서 고친 판(HWPX) — 지금 문항과의 「차이 보고」(결정 2: 보고까지만, 반영하지 않음).
// HWPX는 deflate로 압축한 ZIP이라 backup-zip.js(STORE 전용)로 못 읽는다. 중앙 목록을 직접 읽고 DecompressionStream으로 푼다.
// 완벽한 대조가 목표가 아니다. 「눈에 띄는 차이」(순서·글·빠진 것·배점)를 놓치지 않는 쪽으로 판단한다.

const dec=new TextDecoder('utf-8');
const MAX_ENTRY=64*1024*1024;

async function inflateRaw(bytes){
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// 이름 → 풀린 바이트. want(name)이 참인 항목만 푼다.
export async function readZipEntries(input,want=()=>true){
  const u8=input instanceof Uint8Array?input:new Uint8Array(input),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let end=-1;for(let p=u8.length-22;p>=Math.max(0,u8.length-0xffff-22);p--)if(dv.getUint32(p,true)===0x06054b50){end=p;break;}
  if(end<0)throw Error('한글 파일(HWPX)이 아니거나 손상되었습니다.');
  const count=dv.getUint16(end+10,true),start=dv.getUint32(end+16,true),out=new Map();
  let p=start;
  for(let i=0;i<count;i++){
    if(dv.getUint32(p,true)!==0x02014b50)throw Error('HWPX 중앙 목록이 손상되었습니다.');
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),size=dv.getUint32(p+24,true);
    const nlen=dv.getUint16(p+28,true),xlen=dv.getUint16(p+30,true),clen=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nlen));p+=46+nlen+xlen+clen;
    if(!want(name))continue;
    if(size>MAX_ENTRY||csize>MAX_ENTRY)throw Error('HWPX 항목이 너무 큽니다.');
    if(dv.getUint32(off,true)!==0x04034b50)throw Error('HWPX 항목이 손상되었습니다.');
    const ds=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),raw=u8.subarray(ds,ds+csize);
    if(method===0)out.set(name,raw.slice());
    else if(method===8)out.set(name,await inflateRaw(raw));
    else throw Error(`지원하지 않는 HWPX 압축 방식입니다(${method}).`);
  }
  return out;
}
const ENT={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"};
const unescapeXml=s=>s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>e[0]==='#'?String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):Number(e.slice(1))):ENT[e]??m);
// 섹션 XML 하나 → 문단 글 목록. 표 안 문단(문단 안 문단)도 연 순서대로 따로 낸다.
export function sectionParagraphs(xml){
  const out=[],stack=[],re=/<hp:p[\s>]|<\/hp:p>|<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g;let m;
  while((m=re.exec(xml))){
    const t=m[0];
    if(t.startsWith('</hp:p'))stack.pop();
    else if(t.startsWith('<hp:p'))stack.push(out.push('')-1);
    else if(stack.length){const inner=m[1].replace(/<hp:tab\b[^>]*\/>/g,'\t').replace(/<hp:lineBreak\b[^>]*\/>/g,' ').replace(/<[^>]+>/g,'');out[stack[stack.length-1]]+=unescapeXml(inner);}
  }
  return out.map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
}
// 본문 문단 글 목록(Contents/section0.xml, section1.xml … 순서).
export async function hwpxText(bytes){
  const files=await readZipEntries(bytes,n=>/^Contents\/section\d+\.xml$/.test(n));
  const names=[...files.keys()].sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  if(!names.length)throw Error('HWPX 본문(Contents/section*.xml)을 찾지 못했습니다.');
  return names.flatMap(n=>sectionParagraphs(dec.decode(files.get(n))));
}

/* ---------- 차이 ---------- */
const CIRCLED='①②③④⑤';
const POINTS=/\[\s*(\d+(?:\.\d+)?)\s*점\s*\]/;
// 비교용: 수식($…$, 한글에서는 수식 객체라 글에 안 나옴)·배점 표시·공백을 뺀다.
const norm=s=>String(s??'').replace(/\$[^$]*\$/g,'').replace(/\[\s*\d+(?:\.\d+)?\s*점\s*\]/g,'').replace(/[\s ]+/g,'');
function bigrams(s){const m=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);m.set(k,(m.get(k)||0)+1);}return m;}
export function similarity(a,b){
  a=norm(a);b=norm(b);if(a===b)return 1;if(a.length<2||b.length<2)return 0;
  const x=bigrams(a),y=bigrams(b);let both=0;for(const [k,n] of x)both+=Math.min(n,y.get(k)||0);
  return 2*both/(a.length-1+b.length-1);
}
const NUM=/^\s*(\d{1,2})\s*[.．]\s*/,JAMO=/^\s*([ㄱ-ㅎ])\s*[.．]\s*/;
// 문단을 문항 번호(줄 앞 「N.」)로 묶는다. 첫 번호 앞(머리글·안내)은 버린다.
export function groupByNumber(paragraphs,max=99){
  const groups=[];let cur=null;
  for(const p of paragraphs){
    const m=p.match(NUM),n=m?Number(m[1]):0;
    if(m&&n>=1&&n<=max&&!groups.some(g=>g.no===n)){cur={no:n,paragraphs:[p.replace(NUM,'')]};groups.push(cur);continue;}
    if(cur)cur.paragraphs.push(p);
  }
  return groups;
}
// 문단을 선지(①…) 자리에서 다시 나누고, 표시(① · ㄱ.)를 떼어 둔다.
function segmentsOf(group){
  const out=[];
  for(const p of group.paragraphs)for(const part of p.split(/(?=[①②③④⑤])/)){
    const t=part.trim();if(!t)continue;
    if(CIRCLED.includes(t[0]))out.push({mark:t[0],text:t.slice(1).trim()});
    else{const j=t.match(JAMO);out.push(j?{mark:j[1],text:t.replace(JAMO,'')}:{mark:null,text:t});}
  }
  return out;
}
// 문항에서 한글 지면에 글로 나오는 조각. kind: text(지문·발문 줄) / line(보기·과정·대화 줄) / choice(선지).
function piecesOf(q){
  const out=[];const lines=(s,what)=>String(s||'').split('\n').map(x=>x.trim()).filter(x=>norm(x)).forEach(x=>out.push({kind:'text',what,text:x}));
  for(const b of q.blocks||[]){
    if(b.kind==='text')lines(b.text,b.label||'지문');
    if(b.kind==='bogi')for(const l of b.lines||[])if(norm(l.text))out.push({kind:'line',mark:l.label,what:`보기 ${l.label}`,text:l.text});
    if(b.kind==='steps'||b.kind==='dialogue')for(const l of b.lines||[])if(norm(l.text))out.push({kind:'text',what:`${b.label} ${l.label}`,text:l.text});
  }
  lines(q.ask,'발문');
  if(q.type!=='서술형'&&q.style!=='대응표')(q.choices||[]).forEach((c,i)=>{if(norm(c.text))out.push({kind:'choice',mark:CIRCLED[i],what:`선지 ${CIRCLED[i]}`,text:c.text});});
  return out;
}
const fullText=g=>norm(g.paragraphs.join(''));
const questionText=q=>norm(piecesOf(q).map(p=>p.text).join(''));
// paragraphs: hwpxText 결과. questions: 지금 판의 문항(시험지 순서). 번호는 순서(1부터)로 본다.
export function diffAgainst(paragraphs,questions){
  const result={order:[],text:[],missing:[],points:[]};
  const groups=groupByNumber(paragraphs,Math.max(questions.length+10,20));
  // 문항 ↔ 묶음 짝짓기: 글이 가장 비슷한 것부터(순서가 바뀌어도 따라감).
  const pairs=[];
  groups.forEach((g,gi)=>{const gt=fullText(g);questions.forEach((q,qi)=>pairs.push({gi,qi,s:similarity(gt,questionText(q))}));});
  pairs.sort((a,b)=>b.s-a.s||Math.abs(groups[a.gi].no-(a.qi+1))-Math.abs(groups[b.gi].no-(b.qi+1)));
  const qOf=new Map(),gOf=new Map();
  for(const p of pairs){if(p.s<0.3||qOf.has(p.qi)||gOf.has(p.gi))continue;qOf.set(p.qi,p.gi);gOf.set(p.gi,p.qi);}
  // 배점 표시 방식: 대부분 문항에 [N점]이 있으면 「모두 표시」, 3점만 있으면 「3점만 표시」(수능식).
  const marked=groups.map(g=>g.paragraphs.join(' ').match(POINTS)).filter(Boolean).map(m=>Number(m[1]));
  const style=marked.length&&marked.length>=Math.ceil(groups.length/2)&&!marked.every(v=>v===3)?'all':marked.length&&marked.every(v=>v===3)?'three':'none';
  questions.forEach((q,qi)=>{
    const no=qi+1;
    if(!qOf.has(qi)){result.missing.push({no,what:'문항 전체'});return;}
    const g=groups[qOf.get(qi)],segs=segmentsOf(g),all=fullText(g);
    if(g.no!==no)result.order.push({no,from:no,to:g.no});
    const free=segs.filter(s=>s.mark===null);
    for(const p of piecesOf(q)){
      const want=norm(p.text);if(!want)continue;
      let seg=null,score=0;
      if(p.kind==='choice'||p.kind==='line'){
        // 짧은 선지(「ㄱ, ㄴ」)는 어디에나 들어 있으므로 같은 표시(①·ㄱ)가 붙은 조각과 견준다.
        seg=segs.find(s=>s.mark===p.mark)||null;
        if(seg?norm(seg.text)===want:all.includes(want))continue;score=seg?1:0;}
      else{if(all.includes(want))continue;for(const s of free){const v=similarity(p.text,s.text);if(v>score){score=v;seg=s;}}}
      if(seg&&score>=0.5)result.text.push({no,what:p.what,before:p.text,after:seg.text.replace(POINTS,'').trim()});
      else result.missing.push({no,what:`${p.what}: ${p.text.length>40?p.text.slice(0,40)+'…':p.text}`});
    }
    const found=g.paragraphs.join(' ').match(POINTS),pts=Number(q.points);
    if(found&&Number(found[1])!==pts)result.points.push({no,before:pts,after:Number(found[1])});
    else if(!found&&(style==='all'||style==='three'&&pts===3))result.points.push({no,before:pts,after:null});
  });
  return result;
}
