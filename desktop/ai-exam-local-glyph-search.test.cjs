const test=require('node:test'),assert=require('node:assert/strict');
const api=import('../js/ai-exam-label-removal.js');
// 11-09 라벨 안정화: AI가 「삭제 가능성」만 보류했거나 AI 탐색 상자가 글자를 비켜 간 글자 라벨은, AI가 본 글자 자리에서 실제 글자 잉크를
// 다시 찾아 좁은 상자로 같은 픽셀 검사를 한다. 글자만 지우고 틀·점·선은 그대로, 원문·소속이 불확실하거나 지시선 라벨이면 다시 찾지 않는다.
const fixture=({uncertainty='removal',mode='text',frame=false,dots=false,touch=false,marker=false}={})=>{
 const width=120,height=60,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 for(let x=40;x<=50;x++)for(let y=20;y<=21;y++)dark(x,y);for(let y=20;y<=33;y++){dark(45,y);dark(46,y);}
 if(frame){for(let x=28;x<=72;x++){dark(x,8);dark(x,46);}for(let y=8;y<=46;y++){dark(28,y);dark(72,y);}}
 if(dots)for(const [x,y] of [[54,26],[55,26],[54,27],[55,27],[44,15],[45,15],[44,16],[45,16]])dark(x,y);
 if(touch)for(let x=47;x<=90;x++)dark(x,33);
 // 점 표시: 글자 바로 위(2px 떨어짐)의 채운 원 — 위치를 나타내는 과학 표시이며 글자 높이의 절반쯤이다.
 if(marker)for(let y=11;y<=17;y++)for(let x=42;x<=48;x++)if((x-45)**2+(y-14)**2<=10)dark(x,y);
 const label={id:'a',text:'T',sourceRef:1,scope:'general',mode,typography:{bounds:{x:43/120,y:17/60,w:12/120,h:15/60}}};
 const plan={labels:[label],uncertainties:uncertainty?[{sourceRef:1,labelId:'a',component:'text',domain:uncertainty,reason:'원본 획과 배경을 픽셀 단위로 확정할 수 없음'}]:[],
  protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[]};
 return {width,height,data,plan};
};
const glyph=(x,y)=>(y>=20&&y<=21&&x>=40&&x<=50)||((x===45||x===46)&&y>=20&&y<=33);
test('removal-only uncertainty: glyph ink found from the observed text position is erased; every other pixel stays exact',async()=>{
 const {removeExamLabelPixels}=await api,f=fixture(),r=removeExamLabelPixels(f);
 assert.equal(r.report.status,'complete');assert.deepEqual(r.removedLabelIds,['a']);assert.equal(r.report.localTextSearches.length,1);
 for(let i=0;i<f.width*f.height;i++){const x=i%f.width,y=Math.floor(i/f.width);
  if(glyph(x,y))assert.equal(r.data[i*4],255);else assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));}
});
test('a frame around the text and nearby dots are scientific structure and are never erased',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const opt of [{frame:true},{dots:true},{frame:true,dots:true},{marker:true}]){
  const f=fixture(opt),r=removeExamLabelPixels(f);
  assert.equal(r.report.status,'complete',JSON.stringify(opt));
  for(let i=0;i<f.width*f.height;i++){const x=i%f.width,y=Math.floor(i/f.width);
   if(glyph(x,y))assert.equal(r.data[i*4],255);else assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4));}
 }
});
test('text or ownership uncertainty, leader labels and text touching a structure line keep the original pixels',async()=>{
 const {removeExamLabelPixels}=await api;
 for(const opt of [{uncertainty:'text'},{uncertainty:'ownership'},{mode:'leader'},{touch:true}]){
  const f=fixture(opt),r=removeExamLabelPixels(f);
  assert.notEqual(r.report.status,'complete',JSON.stringify(opt));assert.deepEqual(r.removedLabelIds,[]);assert.deepEqual(r.data,f.data);
 }
});

// 11-09 라벨 안정화(한글 자모 묶음): 한 글자 안에서 위아래로 쌓인 자모(ㅎ 위·ㅁ 아래, 오른쪽 ㅣ)를 한 글자로 묶어 다시 찾는다 —
// 가장 큰 자모만 잡아 아래 받침이 남으면 안 된다. 글자 위 작은 원 표시는 묶지 않는다.
test('Hangul syllables made of stacked jamo are erased whole; a small circle above the word is not merged into it', async () => {
 const {removeExamLabelPixels}=await api;
 const width=120,height=70,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 // 「힘」 비슷한 글자: 위 가로획(ㅎ 머리)·가운데 동그라미·아래 네모(ㅁ)는 세로로 떨어져 있고, 오른쪽 세로획(ㅣ)은 따로 길다.
 for(let x=42;x<=50;x++){dark(x,22);dark(x,23);}                       // 위 짧은 가로획
 for(let x=40;x<=52;x++)for(const y of [26,32])dark(x,y);for(let y=26;y<=32;y++){dark(40,y);dark(52,y);} // 가운데 네모(ㅇ 대신)
 for(let x=40;x<=52;x++)for(const y of [36,42])dark(x,y);for(let y=36;y<=42;y++){dark(40,y);dark(52,y);} // 아래 네모(ㅁ)
 for(let y=21;y<=35;y++){dark(56,y);dark(57,y);}                        // 오른쪽 세로획
 // 글자 위 작은 원 표시(다른 물체)
 for(let y=10;y<=15;y++)for(let x=45;x<=50;x++)if((x-47.5)**2+(y-12.5)**2<=7)dark(x,y);
 const label={id:'a',text:'힘',sourceRef:1,scope:'general',mode:'text',typography:{bounds:{x:39/120,y:20/70,w:20/120,h:23/70}}};
 const plan={labels:[label],uncertainties:[{sourceRef:1,labelId:'a',component:'text',domain:'removal',reason:'배경 분리 불확실'}],protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[]};
 const r=removeExamLabelPixels({width,height,data,plan});
 assert.equal(r.report.status,'complete');assert.deepEqual(r.removedLabelIds,['a']);
 for(const [x,y] of [[45,22],[40,30],[46,42],[56,30]])assert.equal(r.data[(y*width+x)*4],255,`${x},${y} 글자 획이 남음`);
 for(let i=0;i<width*height;i++){const x=i%width,y=Math.floor(i/width);if(y<=16)assert.deepEqual(r.data.slice(i*4,i*4+4),data.slice(i*4,i*4+4));}
});

// 11-09 라벨 안정화(L7 구조 훼손 막기): 글자 옆 범례 기호(속이 찬 점), 글자 옆 화살표, 글자 아래 긴 막대는 글자로 잡지 않는다.
test('legend marks, arrows and bars beside or under a Hangul label are kept while the label glyphs are erased', async () => {
 const {removeExamLabelPixels}=await api;
 const width=160,height=80,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 const syl=x0=>{for(let x=x0;x<=x0+9;x++){dark(x,24);dark(x,32);}for(let y=24;y<=32;y++){dark(x0,y);dark(x0+9,y);}for(let y=22;y<=40;y++){dark(x0+13,y);dark(x0+14,y);}for(let x=x0;x<=x0+12;x++)dark(x,37);};
 syl(50);syl(70);                                                       // 「열점」 비슷한 두 글자(각 15px 너비)
 for(let y=28;y<=35;y++)for(let x=36;x<=43;x++)if((x-39.5)**2+(y-31.5)**2<=14)dark(x,y);   // 왼쪽 범례 점(●)
 for(let x=92;x<=118;x++){dark(x,31);dark(x,32);}for(const [dx,dy] of [[-1,-1],[-2,-2],[-3,-3],[-1,1],[-2,2],[-3,3]])dark(118+dx,31+dy); // 오른쪽 화살표
 for(let x=48;x<=88;x++)for(let y=46;y<=48;y++)dark(x,y);                // 아래 긴 막대
 const label={id:'a',text:'열점',sourceRef:1,scope:'general',mode:'text',typography:{bounds:{x:48/160,y:20/80,w:40/160,h:22/80}}};
 const plan={labels:[label],uncertainties:[{sourceRef:1,labelId:'a',component:'text',domain:'removal',reason:'x'}],protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[]};
 const r=removeExamLabelPixels({width,height,data,plan});
 assert.deepEqual(r.removedLabelIds,['a']);
 for(const [x,y] of [[50,28],[63,30],[70,24],[83,38]])assert.equal(r.data[(y*width+x)*4],255,`${x},${y} 글자 획이 남음`);
 for(const [x,y] of [[39,31],[100,31],[60,47],[85,47]])assert.equal(r.data[(y*width+x)*4],0,`${x},${y} 구조가 지워짐`);
});

// 11-09 라벨 안정화(동그라미 글자): AI가 ㉢을 「ㄷ」으로 읽고 글자만 감싼 탐색 상자를 줘도, 고리까지 그 글자의 획으로 지우고
// 동그라미 글자로 복원한다. 네모 틀 안 글자와 고리 안 대문자(물체·입자일 수 있음)는 틀·고리를 그대로 둔다.
const ringFixture=({text='ㄷ',square=false}={})=>{
 const width=100,height=80,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 const cx=50,cy=40,R=17,shape=new Set(),glyph=new Set();
 if(square){for(let x=cx-R;x<=cx+R;x++)for(const y of [cy-R,cy-R+1,cy+R-1,cy+R])shape.add(y*width+x);for(let y=cy-R;y<=cy+R;y++)for(const x of [cx-R,cx-R+1,cx+R-1,cx+R])shape.add(y*width+x);}
 else for(let y=0;y<height;y++)for(let x=0;x<width;x++){const d=Math.hypot(x-cx,y-cy);if(d>=R-1.2&&d<=R+.6)shape.add(y*width+x);}
 for(let x=42;x<=58;x++)for(const y of [32,33,47,48])glyph.add(y*width+x);for(let y=32;y<=48;y++){glyph.add(y*width+42);glyph.add(y*width+43);}  // 「ㄷ」 비슷한 글자
 for(const i of [...shape,...glyph])dark(i%width,Math.floor(i/width));
 const label={id:'c',text,sourceRef:1,scope:'general',mode:'text',typography:{role:'symbol',bounds:{x:40/width,y:30/height,w:20/width,h:20/height}}};
 const plan={labels:[label],uncertainties:[],protectedRegions:[],preservedMarks:[],removalRegions:[],
  inkSearchRegions:[{id:'s1',labelId:'c',sourceRef:1,ownership:'confirmed',component:'text',backgroundMode:'sample-flat',background:[255,255,255,255],bounds:{x:.41,y:31/height,w:.19,h:19/height}}]};
 return {width,height,data,plan,shape,glyph};
};
test('a single jamo inside a ring is a circled character: the ring is erased with the glyph and the label is restored as ㉢', async () => {
 const {removeExamLabelPixels}=await api,f=ringFixture(),r=removeExamLabelPixels(f);
 assert.deepEqual(r.removedLabelIds,['c']);
 assert.equal(r.report.localTextSearches.find(s=>s.labelId==='c')?.text,'㉢');
 for(const i of [...f.shape,...f.glyph])assert.equal(r.data[i*4],255);
});
test('a square frame around a jamo and a ring around a capital letter stay; only the glyph inside is erased', async () => {
 const {removeExamLabelPixels}=await api;
 for(const opt of [{square:true},{text:'A'}]){
  const f=ringFixture(opt),r=removeExamLabelPixels(f);
  assert.deepEqual(r.removedLabelIds,['c'],JSON.stringify(opt));
  assert.equal(r.report.localTextSearches?.find(s=>s.labelId==='c')?.text,undefined,JSON.stringify(opt));
  for(const i of f.shape)assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4),JSON.stringify(opt));
  for(const i of f.glyph)assert.equal(r.data[i*4],255,JSON.stringify(opt));
 }
});

// 11-09 라벨 안정화: AI가 그림 거의 전체를 보호 상자 하나로 덮거나, 다른 라벨의 지우기·원문 불확실 상자가 넉넉해 이웃 글자에 걸쳐도
// 다시 찾은 글자는 지운다. 그림 일부를 가리키는 작은 보호 상자와 소속이 불확실한 영역에 걸친 글자는 그대로 둔다.
test('broad protection or another label\'s removal box does not block a re-found glyph; a small protected box or an ownership doubt still does', async () => {
 const {removeExamLabelPixels}=await api;
 const glyphBox={x:39/120,y:19/60,w:13/120,h:16/60};
 const cases=[
  ['whole-figure protection',p=>{p.protectedRegions=[{sourceRef:1,bounds:{x:0,y:0,w:1,h:1},reason:'그림 전체 보존'}];},true],
  ['another label\'s removal box over this glyph',p=>{p.labels.push({id:'b',text:'U',sourceRef:1,scope:'general',mode:'text',typography:{bounds:{x:80/120,y:17/60,w:12/120,h:15/60}}});
    p.uncertainties.push({sourceRef:1,labelId:'b',component:'text',domain:'removal',reason:'넉넉한 상자',bounds:{x:30/120,y:10/60,w:70/120,h:30/60}});},true],
  ['small protected box on the glyph',p=>{p.protectedRegions=[{sourceRef:1,bounds:glyphBox,reason:'구조'}];},false],
  ['ownership doubt on the glyph',p=>{p.uncertainties.push({sourceRef:1,domain:'ownership',reason:'그림 일부인지 모름',bounds:glyphBox});},false]];
 for(const [name,edit,erased] of cases){
  const f=fixture();edit(f.plan);const r=removeExamLabelPixels(f);
  assert.equal(r.removedLabelIds.includes('a'),erased,name);
  for(let i=0;i<f.width*f.height;i++){const x=i%f.width,y=Math.floor(i/f.width);
   if(erased && glyph(x,y))assert.equal(r.data[i*4],255,name);else assert.deepEqual(r.data.slice(i*4,i*4+4),f.data.slice(i*4,i*4+4),name);}
 }
});


// 11-09 라벨 안정화(글자 모양): AI가 글자 자리를 엉뚱한 곳(그림 아래 받침대 등)으로 주면 그 안의 세로 화살표·막대를 글자로 잡아
// 지우는 일이 있었다(검증 p1_2023_04_14_1의 「S」 자리에서 아래 화살표 14x34px를 지워 원본이 144px 훼손됐다).
// 글자는 세로로 길쭉하지 않다 — 세로/가로가 2.4배를 넘으면 그 글자가 아니다. 원래 길쭉한 글자(I·l·1·t 등)는 예외다.
const barFixture=(text='S')=>{
 const width=140,height=100,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 const bar=new Set();
 for(let y=30;y<=63;y++)for(let x=62;x<=75;x++)bar.add(y*width+x);   // 세로 막대(화살표 몸통) 14x34
 for(const i of bar)dark(i%width,Math.floor(i/width));
 const label={id:'s',text,sourceRef:1,scope:'general',mode:'text',typography:{role:'name',bounds:{x:50/width,y:30/height,w:40/width,h:34/height}}};
 const plan={labels:[label],uncertainties:[{sourceRef:1,labelId:'s',component:'text',domain:'removal',reason:'글자 영역과 배경을 확정하기 어렵다'}],
  protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[]};
 return {width,height,data,plan,bar};
};
test('a tall narrow bar at the observed text position is not the glyph: it stays, while a naturally tall letter is still erased', async () => {
 const {removeExamLabelPixels}=await api;
 const f=barFixture('S'),r=removeExamLabelPixels(f);
 assert.deepEqual(r.removedLabelIds,[],'세로 막대는 글자가 아니므로 지우지 않는다');
 assert.deepEqual(r.data,f.data,'원본 픽셀이 1픽셀도 바뀌지 않는다');
 assert.equal(r.report.localTextSearchRejections.find(x=>x.labelId==='s')?.reason,'glyph-shape-mismatch');
 const g=barFixture('I'),rg=removeExamLabelPixels(g);
 assert.deepEqual(rg.removedLabelIds,['s'],'원래 길쭉한 글자(I)는 그대로 지운다');
 for(const i of g.bar)assert.equal(rg.data[i*4],255);
});

// 11-09 라벨 안정화(넓음): AI가 준 글자 자리가 비켜 있어 옆 구조(네모 테두리 등)까지 한 덩어리로 집으면
// 전에는 「글자 수에 맞는 너비가 아니다」며 통째로 보류했다(개발·검증 47장에서 11건). 이제 가장 먼 가장자리 덩어리를
// 떼어 너비를 맞추고, 글자만 지운다 — 떼어 낸 구조는 1픽셀도 바뀌지 않는다.
const wideFixture=()=>{
 const width=200,height=100,data=new Uint8ClampedArray(width*height*4).fill(255),dark=(x,y)=>data.set([0,0,0,255],(y*width+x)*4);
 const glyph=new Set(),frame=new Set();
 for(let y=30;y<=49;y++){for(let x=40;x<=42;x++)glyph.add(y*width+x);for(let x=51;x<=53;x++)glyph.add(y*width+x);}
 for(let y=39;y<=40;y++)for(let x=43;x<=50;x++)glyph.add(y*width+x);          // 글자(H 모양) 14x20
 for(let x=62;x<=80;x++){frame.add(30*width+x);frame.add(49*width+x);}
 for(let y=30;y<=49;y++){frame.add(y*width+62);frame.add(y*width+80);}        // 옆 네모 테두리 19x20
 for(const i of glyph)dark(i%width,Math.floor(i/width));
 for(const i of frame)dark(i%width,Math.floor(i/width));
 // AI가 준 글자 자리가 비켜 넓게 잡혔다(글자 14px + 옆 테두리까지 41px) — 실제로 넓음 거절이 나던 모양.
 const label={id:'a',text:'A',sourceRef:1,scope:'general',mode:'text',typography:{role:'name',bounds:{x:40/width,y:30/height,w:41/width,h:20/height}}};
 return {width,height,data,plan:{labels:[label],uncertainties:[],protectedRegions:[],preservedMarks:[],removalRegions:[],inkSearchRegions:[]},glyph,frame};
};
test('a cluster that swallowed a neighbouring frame is trimmed to the glyph instead of being held, and the frame keeps every pixel', async () => {
 const {removeExamLabelPixels}=await api;
 const f=wideFixture(),r=removeExamLabelPixels(f);
 assert.deepEqual(r.removedLabelIds,['a'],'보류하지 않고 글자를 지운다');
 for(const i of f.glyph)assert.equal(r.data[i*4],255,'글자 획은 지워진다');
 for(const i of f.frame)assert.equal(r.data[i*4],0,'옆 네모 테두리는 그대로 남는다');
 assert.equal((r.report.localTextSearchRejections||[]).length,0,'넓다는 이유로 거절하지 않는다');
});
