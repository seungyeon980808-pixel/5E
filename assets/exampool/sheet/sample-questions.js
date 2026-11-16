// 학교 양식 등록 「조판 확정」(11-01) 견본 시험지 문항 6개: 짧은 문항 · 자료 상자(과정) · 표 · 그림 · 글 옆 그림 · 수식.
// 기출이 아니라 5E가 만든 연습 문항이다. 그림은 열 때마다 캔버스로 그린 PNG(파일을 싣지 않는다).
const id=()=>crypto.randomUUID();
const choices=list=>list.map(text=>({id:id(),text,figure:null}));
const COMBO=['ㄱ','ㄴ','ㄱ, ㄷ','ㄴ, ㄷ','ㄱ, ㄴ, ㄷ'];
const bogi=lines=>({id:id(),parent:null,kind:'bogi',label:'보기',text:'',layout:'세로',lines:lines.map((text,i)=>({id:id(),label:'ㄱㄴㄷ'[i],text}))});
const text=(t,parent=null)=>({id:id(),parent,kind:'text',label:'',text:t,layout:'세로'});
const base=(n,type,style,ask,blocks,list)=>({id:id(),number:String(n),type,preset:style==='조합'?'실험':'글·수식',style:style||'문장·수식',standardCode:'',ask,points:n<3?2:3,answer:null,modelAnswer:'',explanation:'',intent:'',
  source:'5E 견본 문항',references:[],blocks,choices:choices(list),
  choiceTable:{rows:6,cols:3,headerRows:1,role:'선지표',cells:Array.from({length:6},()=>Array.from({length:3},()=>({value:''}))),merges:[],note:'',diagonal:null}});

function png(w,h,draw){
  const c=Object.assign(document.createElement('canvas'),{width:w*2,height:h*2}),g=c.getContext('2d');
  g.scale(2,2);g.fillStyle='#fff';g.fillRect(0,0,w,h);g.strokeStyle='#222';g.fillStyle='#222';g.lineWidth=1.2;g.font='11px sans-serif';draw(g);
  return {name:'sample.png',data:c.toDataURL('image/png')};
}
const graph=()=>png(220,130,g=>{
  g.beginPath();g.moveTo(30,10);g.lineTo(30,110);g.lineTo(210,110);g.stroke();
  g.fillText('속력',2,16);g.fillText('시간',186,126);g.fillText('0',20,122);
  g.beginPath();g.moveTo(30,110);g.lineTo(90,50);g.lineTo(150,50);g.lineTo(200,90);g.lineWidth=1.6;g.stroke();
  g.setLineDash([3,3]);g.lineWidth=.8;for(const x of [90,150]){g.beginPath();g.moveTo(x,50);g.lineTo(x,110);g.stroke();}
  g.setLineDash([]);g.fillText('A',56,74);g.fillText('B',116,44);g.fillText('C',176,66);
});
const beaker=()=>png(150,120,g=>{
  g.beginPath();g.moveTo(35,20);g.lineTo(40,105);g.lineTo(110,105);g.lineTo(115,20);g.stroke();
  g.fillStyle='#dfe7f1';g.fillRect(40,55,70,48);g.fillStyle='#222';
  g.beginPath();g.moveTo(75,5);g.lineTo(75,80);g.stroke();g.beginPath();g.arc(75,86,6,0,Math.PI*2);g.stroke();
  g.fillText('온도계',82,16);g.fillText('물',90,90);
});

export function sampleQuestions(){
  const box={id:id(),parent:null,kind:'group',label:'실험',text:'',layout:'세로',boxed:true};
  const steps={id:id(),parent:box.id,kind:'steps',label:'실험 과정',text:'',layout:'세로',lines:[
    {id:id(),label:'(가)',text:'같은 양의 물을 비커 A, B에 넣고 처음 온도를 측정한다.'},
    {id:id(),label:'(나)',text:'A는 햇빛이 드는 곳에, B는 그늘에 10분 동안 둔다.'},
    {id:id(),label:'(다)',text:'A와 B의 나중 온도를 측정하여 처음 온도와 비교한다.'}]};
  const table={id:id(),parent:null,kind:'table',label:'',text:'',layout:'세로',table:{rows:3,cols:4,headerRows:1,role:'자료표',merges:[],note:'',diagonal:null,
    cells:[[{value:'물질'},{value:'질량(g)'},{value:'부피(mL)'},{value:'밀도(g/mL)'}],[{value:'A'},{value:'20'},{value:'10'},{value:'㉠'}],[{value:'B'},{value:'27'},{value:'10'},{value:'2.7'}]]}};
  const side={id:id(),parent:null,kind:'group',label:'',text:'',layout:'나란히',boxed:false};
  return [
    base(1,'객관식','','다음 중 물질의 상태 변화에서 열을 방출하는 것은?',[],['얼음이 녹는다.','물이 끓는다.','드라이아이스가 작아진다.','수증기가 물방울로 맺힌다.','젖은 빨래가 마른다.']),
    base(2,'합답형','조합','이에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?',[text('다음은 햇빛과 물의 온도 변화를 알아보는 실험이다.'),box,steps,bogi(['(나)에서 다르게 한 조건은 햇빛을 받는지 여부이다.','물의 양은 같게 해야 하는 조건이다.','이 실험으로 물의 끓는점을 알 수 있다.'])],COMBO),
    base(3,'합답형','조합','이에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?',[text('표는 물질 A와 B의 질량과 부피를 나타낸 것이다.'),table,bogi(['㉠은 2.0이다.','같은 부피일 때 질량은 B가 A보다 크다.','A와 B는 같은 물질이다.'])],COMBO),
    base(4,'객관식','','구간 A~C 중 물체의 속력이 일정한 구간만을 있는 대로 고른 것은?',[text('그림은 직선 위에서 운동하는 물체의 속력을 시간에 따라 나타낸 것이다.'),{id:id(),parent:null,kind:'figure',label:'',text:'',layout:'세로',size:60,figure:graph()}],['A','B','C','A, B','B, C']),
    withSide(5,side,beaker()),
    base(6,'객관식','','물체에 작용한 알짜힘의 크기는?',[text('질량이 $2 rm kg$인 물체가 $4 rm m/s$의 속력으로 운동하다가 $2$초 동안 일정한 힘을 받아 속력이 $10 rm m/s$가 되었다.')],['$2 rm N$','$4 rm N$','$6 rm N$','$8 rm N$','$12 rm N$']),
  ];
}
// 5번(글 옆 그림): 글 · 그림을 나란히 묶은 묶음 + 〈보기〉.
function withSide(n,side,figure){
  const q=base(n,'합답형','조합','이에 대한 설명으로 옳은 것만을 〈보기〉에서 있는 대로 고른 것은?',[],COMBO);
  q.blocks=[side,{...text('그림과 같이 비커에 물을 넣고 온도계를 꽂은 뒤 비커를 가열하면서 물의 온도를 측정하였다. 가열한 지 5분이 지나자 물이 끓기 시작하였다.',side.id),ratio:2},
    {id:id(),parent:side.id,kind:'figure',label:'',text:'',layout:'세로',ratio:1,size:40,figure},bogi(['가열하는 동안 물의 온도는 계속 높아진다.','물이 끓는 동안 열을 받는다.','5분 뒤 물의 상태는 모두 기체이다.'])];
  return q;
}
