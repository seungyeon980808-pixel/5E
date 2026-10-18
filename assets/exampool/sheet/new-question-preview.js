// 새 문항 창의 예시 문항(평가원 서식). 승인된 시안(5e-design-mockups/new-question.html)의 그림·서식을 그대로 옮겼다.
// 그림은 2026학년도 수능 물리학Ⅰ을 본떠 계산으로 그린다. 시험지 서식 클래스는 창의 단계 목록과 겹치지 않게 nq- 아래에 둔다.
import {FORMS,STRUCTS,LAYOUTS} from './templates.js';
// ── 예시 문항(평가원 서식) ──
// ── 예시 그림: 2026학년도 수능 물리학Ⅰ을 본떠 그린다. 선 0.85~1.1, 빗금 0.5, 이름은 작게, 둘레 여백 없이 자른 viewBox ──
const ARROW=(x,y,dir)=>dir==='up'?`<path d="M${x-2.6} ${y+6}L${x} ${y}l2.6 6z" fill="#111" stroke="none"/>`:`<path d="M${x-6} ${y-2.6}L${x} ${y}l-6 2.6z" fill="#111" stroke="none"/>`;
const HATCH=(x1,x2,y,step=8)=>{let d='';for(let x=x1;x<=x2-5;x+=step)d+=`M${x} ${y+6}l5-6`;return `<path d="${d}" stroke="#111" stroke-width=".5" fill="none"/>`;};
const WALL=(x,y1,y2,step=8)=>{let d='';for(let y=y1;y<=y2-5;y+=step)d+=`M${x-6} ${y+5}l6-5`;return `<path d="${d}" stroke="#111" stroke-width=".5" fill="none"/>`;};
const SERIF='font-family="Times New Roman,serif" fill="#111"',SANS='font-family="Apple SD Gothic Neo,sans-serif" fill="#111"';
const G={
  // 마찰 없는 수평면 위 물체 A(속력 v)와 정지한 B
  cart:()=>`<svg viewBox="0 0 300 76" width="380"><g fill="none" stroke="#111" stroke-width=".9"><path d="M6 62H294"/><rect x="40" y="30" width="46" height="32"/><rect x="196" y="24" width="58" height="38"/><path d="M96 46H140"/></g>${ARROW(146,46,'right')}${HATCH(8,292,62)}<g ${SERIF} font-size="13" text-anchor="middle"><text x="63" y="51">A</text><text x="225" y="48">B</text><text x="120" y="39" font-style="italic">v</text></g></svg>`,
  // 벽에 연결된 용수철과 물체(글 옆 작은 그림)
  spring:()=>{let z='M12 48H22';const n=8,x0=22,x1=78,w=(x1-x0)/n;for(let i=0;i<n;i++)z+=`L${(x0+w*(i+.5)).toFixed(1)} ${i%2?54:42}`;z+=`L${x1} 48H86`;
    return `<svg viewBox="0 0 170 74" width="210"><g fill="none" stroke="#111" stroke-width=".9"><path d="M12 8V66"/><path d="M12 66H164"/><path d="${z}"/><rect x="86" y="34" width="36" height="32"/></g>${WALL(12,8,66)}${HATCH(14,162,66)}<text x="104" y="54" ${SERIF} font-size="13" font-style="italic" text-anchor="middle">m</text></svg>`;},
  // 빗면 위 물체: 빗면 각도를 계산해 물체 밑면을 붙인다
  slope:()=>{const x1=16,x2=172,yb=74,yt=16,ang=Math.atan2(yb-yt,x2-x1),deg=ang*180/Math.PI,s=.52,bw=30,bh=17;
    const px=x1+(x2-x1)*s,py=yb-(yb-yt)*s,cx=px+Math.sin(ang)*bh/2,cy=py-Math.cos(ang)*bh/2;
    return `<svg viewBox="0 0 190 86" width="230"><g fill="none" stroke="#111" stroke-width=".85"><path d="M${x1-10} ${yb}H${x2+12}"/><path d="M${x1} ${yb}L${x2} ${yt}V${yb}"/><g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(-deg).toFixed(2)})"><rect x="${-bw/2}" y="${-bh/2}" width="${bw}" height="${bh}" fill="#fff"/></g><path d="M${x1+24} ${yb}A24 24 0 0 0 ${(x1+24*Math.cos(ang)).toFixed(1)} ${(yb-24*Math.sin(ang)).toFixed(1)}"/></g>${HATCH(x1-8,x2+12,yb)}<g ${SERIF} font-size="11.5" text-anchor="middle"><text x="${x1+31}" y="${yb-4}" font-style="italic">θ</text><text x="${cx.toFixed(1)}" y="${(cy+4).toFixed(1)}">A</text></g></svg>`;},
  // 충돌 전: 공 A가 정지한 공 B를 향해 운동
  balls:(w=220)=>`<svg viewBox="0 0 180 66" width="${w}"><g fill="none" stroke="#111" stroke-width=".9"><path d="M6 56H174"/><circle cx="42" cy="44" r="12"/><circle cx="132" cy="42" r="14"/><path d="M60 44H92"/></g>${ARROW(98,44,'right')}${HATCH(8,172,56)}<g ${SERIF} font-size="12" text-anchor="middle"><text x="42" y="48">A</text><text x="132" y="46">B</text><text x="77" y="37" font-style="italic">v</text></g></svg>`,
  // 충돌 후: A, B가 함께 오른쪽으로
  after:(w=150)=>`<svg viewBox="0 0 180 66" width="${w}"><g fill="none" stroke="#111" stroke-width=".9"><path d="M6 56H174"/><circle cx="70" cy="44" r="12"/><circle cx="96" cy="42" r="14"/><path d="M116 42H146"/></g>${ARROW(152,42,'right')}${HATCH(8,172,56)}<g ${SERIF} font-size="12" text-anchor="middle"><text x="70" y="48">A</text><text x="96" y="46">B</text><text x="131" y="35" font-style="italic">v′</text></g></svg>`,
  // 위치-시간 그래프(14번 본뜸): x_A=4d-0.5d(t/t0-1)^2, x_B=2d-0.5d(t/t0-2)^2
  graph:(w=250)=>{const X0=34,Y0=150,TU=46,DU=28,tx=t=>X0+t*TU,ty=x=>Y0-x*DU,A=t=>4-.5*(t-1)**2,B=t=>2-.5*(t-2)**2;
    const path=f=>{let d='';for(let t=0;t<=3.62;t+=.04)d+=(d?'L':'M')+tx(t).toFixed(1)+' '+ty(f(t)).toFixed(1);return d;};
    const lab=(t,f,dx,dy,c)=>`<text x="${(tx(t)+dx).toFixed(1)}" y="${(ty(f(t))+dy).toFixed(1)}">${c}</text>`;
    return `<svg viewBox="0 0 220 168" width="${w}"><g fill="none" stroke="#111" stroke-width=".85"><path d="M${X0} ${Y0}V12"/><path d="M${X0} ${Y0}H206"/></g>${ARROW(X0,8,'up')}${ARROW(210,Y0,'right')}<g fill="none" stroke="#111" stroke-width=".6" stroke-dasharray="2.4 2.2"><path d="M${X0} ${ty(4)}H${tx(1)}V${Y0}"/><path d="M${X0} ${ty(2)}H${tx(2)}V${Y0}"/></g><g fill="none" stroke="#111" stroke-width="1.1"><path d="${path(A)}"/><path d="${path(B)}"/></g><g ${SANS} font-size="9"><text x="${X0+5}" y="15">위치</text><text x="196" y="164">시간</text></g><g ${SERIF} font-size="11.5"><text x="${X0-11}" y="${Y0+14}">0</text><text x="${X0-21}" y="${ty(4)+4}" font-style="italic">4d</text><text x="${X0-21}" y="${ty(2)+4}" font-style="italic">2d</text><text x="${tx(1)-4}" y="${Y0+14}" font-style="italic">t<tspan font-size="8" dy="2.5" font-style="normal">0</tspan></text><text x="${tx(2)-7}" y="${Y0+14}">2<tspan font-style="italic">t</tspan><tspan font-size="8" dy="2.5">0</tspan></text>${lab(2.55,A,7,-3,'A')}${lab(2.3,B,3,-7,'B')}</g></svg>`;},
  // 실험 장치: 수평 궤도 위 수레 A, B와 속력 측정 장치
  device:()=>`<svg viewBox="0 0 150 74" width="100%"><g fill="none" stroke="#111" stroke-width=".9"><path d="M4 62H146"/><rect x="14" y="44" width="34" height="14"/><circle cx="21" cy="60" r="2.4"/><circle cx="41" cy="60" r="2.4"/><rect x="92" y="44" width="40" height="14"/><circle cx="99" cy="60" r="2.4"/><circle cx="125" cy="60" r="2.4"/><path d="M54 51H80"/><path d="M68 4V30M62 30H74M64 30V38M72 30V38"/></g>${ARROW(86,51,'right')}<g ${SERIF} font-size="11" text-anchor="middle"><text x="31" y="55">A</text><text x="112" y="55">B</text></g><text x="76" y="12" ${SANS} font-size="8.5">속력 측정 장치</text></svg>`
};
const dt=fill=>`<table class="kt${fill?' fill':''}"><tr><th>물체</th><th>질량</th><th>충돌 전 속력</th><th>충돌 후 속력</th></tr><tr><td class="s">A</td><td><i>m</i></td><td>2<i>v</i></td><td><i>v</i></td></tr><tr><td class="s">B</td><td>2<i>m</i></td><td>0</td><td>(가)</td></tr></table>`;
const dtSmall=`<table class="kt"><tr><th>물체</th><th>속력</th></tr><tr><td class="s">A</td><td>2<i>v</i></td></tr><tr><td class="s">B</td><td><i>v</i></td></tr></table>`;
const mat=(svg,cap)=>`<div class="mat">${svg}${cap?`<span class="cap">${cap}</span>`:''}</div>`;
const CAPS=['(가)','(나)','(다)'];
// 자료 종류별 그림: 큰 자리(단 폭)·글 옆·여러 칸을 나눈다.
function material(kind,size,cap,i){
  if(kind==='fig')return mat(size==='big'?G.cart():size==='side'?G.spring():(i%2?G.balls():G.slope()),cap);
  if(kind==='graph')return mat(G.graph(size==='big'?300:size==='side'?200:250),cap);
  if(kind==='table')return mat(size==='big'?dt(false):dtSmall,cap);
  if(kind==='group')return `<div class="mat"><div class="group"><div class="group-in">${mat(G.balls(150),'Ⅰ')}${mat(G.after(150),'Ⅱ')}</div></div><span class="cap">${cap}</span></div>`;
  return '';
}
const WORD={fig:'그림',graph:'그래프',table:'표',group:'그림'};
const WHAT={fig:'물체가 운동하는 모습을',graph:'물체 A, B의 위치를 시간에 따라',table:'충돌 전후 물체의 속력을',group:'Ⅰ, Ⅱ에서 물체가 충돌하기 전과 후의 모습을'};
function introOne(kind,size){
  if(kind==='fig')return size==='side'?'그림과 같이 용수철에 연결된 질량이 <i>m</i>인 물체를 평형 위치에서 잡아당겼다가 가만히 놓았더니 물체가 단진동을 하였다. 용수철의 질량과 모든 마찰은 무시한다.':'그림은 마찰이 없는 수평면에서 질량이 <i>m</i>인 물체 A가 정지해 있는 질량이 2<i>m</i>인 물체 B를 향해 속력 <i>v</i>로 운동하는 모습을 나타낸 것이다.';
  if(kind==='graph')return '그림은 동일 직선상에서 등가속도 운동을 하는 물체 A, B의 위치를 시간에 따라 나타낸 것이다.';
  return '표는 물체 A, B가 충돌하기 전과 후의 속력을 나타낸 것이다.';
}
function introMany(kinds){
  // 평가원식: "그림 (가)는 …을, 그래프 (나)는 …을 나타낸 것이다." 같은 종류가 이어지면 종류 말을 생략한다.
  if(kinds.every(k=>k==='fig'))return `그림 ${kinds.map((_,i)=>CAPS[i]).join(', ')}는 물체가 운동하는 모습을 나타낸 것이다.`;
  return kinds.map((k,i)=>`${i===0||k!==kinds[i-1]?WORD[k]+' ':''}${CAPS[i]}는 ${WHAT[k]}`).join(', ')+' 나타낸 것이다.';
}
function arrange(text,list,layout){
  if(!list.length)return `<p>${text}</p>`;
  if(layout==='side')return `<div class="sidewrap"><div><p>${text}</p></div><div class="mats">${list.join('')}</div></div>`;
  const cls=layout==='stack'?'mats stack':layout==='mix'?'mats mix':'mats';
  return `<p>${text}</p><div class="${cls}">${list.join('')}</div>`;
}
// 자료 구조마다 자료 종류를 바꿔 위아래로 보여 줄 예시들
const VARIANTS={
  big:[['자료가 그림일 때',['fig']],['자료가 그래프일 때',['graph']],['자료가 표일 때',['table']]],
  small:[['자료가 그림일 때',['fig']],['자료가 그래프일 때',['graph']],['자료가 표일 때',['table']]],
  two:[['그림 + 그래프',['fig','graph']],['그림 + 표',['fig','table']],['그림 + 그림',['fig','fig']]],
  many:[['그림 · 그림 · 그래프',['fig','fig','graph']],['그림 · 그래프 · 표',['fig','graph','table']],['(가) 안에 그림 두 개를 묶은 경우',['group','graph']]],
  condition:[['상자 안에 글만',[]],['상자 안에 그림',['fig']],['상자 안에 표',['table']]],
  experiment:[['결과가 표일 때',['table']],['장치 그림 + 결과표',['fig','table']],['결과가 그래프일 때',['graph']]],
  none:[['',[]]]
};
function bodyHtml(s,kinds){
  const L=s.layout||'below';
  if(s.struct==='none')return `<p>질량이 <i>m</i>인 물체가 높이 <i>h</i>에서 자유 낙하하여 지면에 닿는 순간의 속력은 <i>v</i>이다. 공기 저항은 무시한다.</p>`;
  if(s.struct==='small'||s.struct==='big'){const size=s.struct==='small'?'side':'big';return arrange(introOne(kinds[0],size),[material(kinds[0],size,'',0)],s.struct==='small'?'side':'below');}
  if(s.struct==='two'||s.struct==='many')return arrange(introMany(kinds),kinds.map((k,i)=>material(k,'multi',CAPS[i],i)),L);
  if(s.struct==='condition'){
    const text='<div class="cond"><div>· 물체 A, B의 질량은 각각 <i>m</i>, 2<i>m</i>이다.</div><div>· A는 속력 <i>v</i>로 정지한 B와 정면으로 충돌한다.</div><div>· 충돌 후 A, B는 한 덩어리가 되어 운동한다.</div></div>';
    const k=kinds[0];
    const inner=k==='fig'?`<div class="sidewrap">${text}<div class="mats">${mat(G.balls(200))}</div></div>`:k==='table'?`${text}<div class="single">${dtSmall}</div>`:text;
    return `<p>다음은 물체의 운동에 대한 조건이다.</p><div class="box">${inner}</div>`;
  }
  // 실험 상자(13번 본뜸): 과정은 내어쓰기, 장치 그림은 오른쪽 위, 결과표는 상자 폭 가득
  const steps='<div><span class="tag">〔실험 과정〕</span><div class="proc">(가) 수레 A, B의 질량을 측정한다.</div><div class="proc">(나) 정지한 B를 향해 A를 밀어 충돌시킨다.</div><div class="proc">(다) 충돌 전후 A, B의 속력을 측정한다.</div></div>';
  const res=kinds[kinds.length-1];
  const result=`<div class="result"><span class="tag">〔실험 결과〕</span>${res==='graph'?`<div class="single">${G.graph(240)}</div>`:dt(true)}</div>`;
  const inner=kinds.includes('fig')?`<div class="steps">${steps}<div>${G.device()}</div></div>${result}`:`${steps}${result}`;
  return `<p>다음은 충돌에 대한 실험이다.</p><div class="box">${inner}</div>`;
}
// [3점]은 앞 낱말과 한 덩어리로 붙여 혼자 다음 줄로 떨어지지 않게 한다.
const ASK={combo:'이에 대한 설명으로 옳은 것만을 &lt;보기&gt;에서 있는 대로 고른 <span class="pts">것은? [3점]</span>',
  single:'충돌 직후 B의 <span class="pts">속력은? [3점]</span>',
  pair:'A, B, C에 해당하는 물리량으로 옳은 것은?',
  talk:'제시한 내용이 옳은 학생만을 있는 대로 고른 것은?'};
function choicesHtml(t){
  const L=['①','②','③','④','⑤'];
  const row=list=>`<div class="ch r5">${list.map((x,i)=>`<div>${L[i]} ${x}</div>`).join('')}</div>`;
  if(t==='combo')return row(['ㄱ','ㄴ','ㄱ, ㄷ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ']);
  if(t==='talk')return row(['A','C','A, B','B, C','A, B, C']);
  if(t==='single')return row(['<i>v</i>/3','<i>v</i>/2','2<i>v</i>/3','<i>v</i>','3<i>v</i>/2']);
  // 대응 선지: 값 3개 → 2열. 맨 윗줄 묶음 위에만 열 제목.
  const V=[['속력','가속도','운동량'],['속력','운동량','가속도'],['가속도','속력','운동량'],['가속도','운동량','속력'],['운동량','속력','가속도']];
  const head='<div class="pair-row headrow"><span></span><span>A</span><span>B</span><span>C</span></div>';
  const r=i=>`<div class="pair-row"><span>${L[i]}</span>${V[i].map(v=>`<span>${v}</span>`).join('')}</div>`;
  return `<div class="pair">${head}${head}${r(0)}${r(1)}${r(2)}${r(3)}${r(4)}</div>`;
}
function paperHtml(s,hl,kinds=[]){
  const reg=(key,tag,html)=>`<div data-region="${key}" data-tag="${tag}" class="${hl===key?'hl':''}">${html}</div>`;
  const talk=`<div class="talk"><div><b>학생 A</b><span>충돌 과정에서 A와 B의 운동량의 합은 보존돼.</span></div><div><b>학생 B</b><span>충돌 후 A의 운동 에너지는 증가해.</span></div><div><b>학생 C</b><span>A가 받은 충격량의 크기는 B가 받은 충격량의 크기와 같아.</span></div></div>`;
  const bogi=`<div class="bogi"><div>ㄱ. 충돌 과정에서 A와 B의 운동량의 합은 보존된다.</div><div>ㄴ. 충돌 후 B의 속력은 <i>v</i>보다 크다.</div><div>ㄷ. 충돌하는 동안 A가 B에 작용하는 힘의 크기와 B가 A에 작용하는 힘의 크기는 같다.</div></div>`;
  const tagS=s.struct?STRUCTS[s.struct].name+(s.layout?' · 배치 '+LAYOUTS[s.layout]+' (자동)':''):'자료 구조';
  const body=s.struct?bodyHtml(s,kinds):'<p style="color:#9aa0a8">자료 구조를 고르면 자료가 여기에 놓입니다.</p>';
  const material=reg('struct',tagS,s.type==='talk'?(s.struct&&s.struct!=='none'?bodyHtml(s,kinds):''):body);
  const lead=s.type==='talk'?'<p>다음은 충돌에 대해 학생 A, B, C가 나눈 대화이다.</p>':'';
  const typePart=reg('type',FORMS[s.type].name+' · 선지 자동',`${s.type==='talk'?talk:''}<p>${ASK[s.type]}</p>${s.type==='combo'?bogi:''}${choicesHtml(s.type)}`);
  return `<div class="paper"><div class="q"><span class="qn">7.</span><div class="qb">${lead}${material}${typePart}</div></div></div>`;
}
// 자료 구조를 고르면 자료 종류별 예시를 위아래로 나란히.
export function previewHtml(s,hl){
  if(!s.type)return `<div class="empty">유형을 고르면<br>예시 문항이 여기에 보입니다.</div>`;
  const list=s.struct?VARIANTS[s.struct]:[['',[]]];
  const guide=s.struct&&s.struct!=='none'?`<p class="guide">자료는 그림·그래프·표 무엇이든 됩니다. 틀을 만든 뒤 문항 카드에서 각 칸에 무엇을 넣을지 고르면 됩니다. 아래는 자료 종류별로 어떻게 보이는지입니다.</p>`:'';
  return guide+list.map(([label,kinds])=>`<figure class="variant">${label?`<figcaption>${label}</figcaption>`:''}${paperHtml(s,hl,kinds)}</figure>`).join('');
}
