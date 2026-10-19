// 기출 목록 검색의 순수 함수(화면 상태와 상관없음). 문항 카드(card-editor.js) 라이브러리 칸이 쓴다(2026-10-19 밤 리팩토링, 동작 그대로).
// 검색 규칙은 5e.ai.kr/examlibrary 기출 탐색기와 같다: 띄어쓰기·대소문자 무시, 제목 8점·태그 5점·본문 1점.
const F={id:0,year:1,month:2,no:3,page:4,box:5,pdfFile:6,parts:7,tags:8,hasFigure:9,record:10,text:11};
const MONTH={6:'6월 모평',9:'9월 모평',11:'수능'};// 색인의 월 값은 숫자(6·9·11)
const shortTitle=(year,month,label,no)=>`${label.replace('물리학','물리').replace('생명과학','생명').replace('지구과학','지구').replace('Ⅰ','1').replace('Ⅱ','2')} ${String(year).slice(2)}년 ${Number(month)===11?'수능':Number(month)+'평'} ${no}번`;
const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('ko');
const splitWords=v=>norm(v).trim().split(/[#，,\s]+/u).filter(Boolean);
const pastScore=(i,words)=>words.reduce((n,w)=>n+(norm(i.title+' '+i.short).includes(w)?8:0)+(norm(i.tags.join(' ')).includes(w)?5:0)+(norm(i.text).includes(w)?1:0),0);

export {F,MONTH,shortTitle,norm,splitWords,pastScore};
