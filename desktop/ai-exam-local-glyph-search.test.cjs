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
