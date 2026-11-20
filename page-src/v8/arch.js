/* 11-20: architecture 시안 세 가지(?arch=1|2|3, 없으면 1). 1 한 장 구조도 · 2 출제 흐름 · 3 층 구조 */
(function(){
  'use strict';
  const v=new URLSearchParams(location.search).get('arch')||'1';
  const sec=document.createElement('section');sec.className='wrap arch arch'+v;sec.id='arch';
  const head='<div class="group"><b>architecture</b><span>한눈에 보는 5E</span></div>';
  const P={image:['5E_image','그림 · 그래프','AI 이미지 작업대 · 그래프 복원 · 편집기','g-image'],
    exam:['5E_exam','문항 · 시험지','문항 카드 · 기출 변형 · 시험지 조판 · 학교 양식','g-exam'],
    hwp:['5E_hwp','한글 시험지','시험지 쪽에서 그림·글 고치기 · 인쇄 전 조판','g-hwp']};
  const box=k=>`<a class="ar-p" href="#${P[k][3]}"><i>${k}</i><b>${P[k][1]}</b><span>${P[k][2]}</span></a>`;
  if(v==='1'){
    // 칸을 고르면 그 안쪽을 아래에 펼친다. 내용은 1.7.0·1.7.1 릴리스 노트 그대로.
    const D={
      image:['5E_image','그림 · 그래프',['교과서 · 기출 그림, 그래프 사진','AI 작업대','라벨 복원 · 부분 수정','라벨 편집','캔버스 · 문항 카드 · clipboard'],
        ['AI 작업대 — 이미지 변환 · 이미지 생성 · 그래프 복원 · 그래프 생성을 같은 틀에서','라벨 복원(베타) — 기출 그림의 글자를 지우고 원본 크기 · 위치 그대로 고칠 수 있는 라벨로','부분 수정 — 원본 · 지금 그림 · 지정한 영역을 함께 읽고 그 부분만','라벨 편집 — 글자 · 크기(pt) · 위치 · 지시선','그래프 — 원본 눈금 글자 높이를 재어 크기를 맞추고, 축 이름 · 눈금을 그래프 위에서'],'g-image'],
      exam:['5E_exam','문항 · 시험지',['문항 카드','실시간 한글 조판','시험지에 담기','학교 양식에 배치','점검 · 저장(.5e)'],
        ['유형(합답형 · 정답형 · 짝 고르기 · 대화·발표 · 서술형)과 자료 구조를 고르면 평가원 문항 틀로 시작','지문 · 자료 · 발문 · 〈보기〉 · 선지를 시험지 순서대로, 자료 칸은 그림 · 그래프 · 표 · 자료 상자','〈보기〉 ㄱ·ㄴ·ㄷ에 ○·×를 정하면 정답 선지가 정해짐','카드 옆 미리보기가 실제 HWP 조판 — 기본 수능 틀 B4, 단 폭 112mm, 본문 11.5pt','시험지: 담기 → 학교 양식으로 배치 → 순서 · 여백 → 점검 → HWPX · 5E_hwp로 보내기'],'g-exam'],
      hwp:['5E_hwp','한글 시험지',['HWP · HWPX 열기','쪽 위에서 고치기','그림은 그 자리에서','인쇄 · PDF'],
        ['한글 프로그램 없이 HWP · HWPX를 열고, 고치고, 저장','모드 세 가지 — ⌥⌘4 기본 · ⌥⌘5 집중 · ⌥⌘6 없음','문서 속 그림을 누르면 그 자리에서 다듬거나 AI 변환으로, 바꿔 넣어도 원래 칸에 맞춤','시험지 머리 · 문항 간격 · 단 채우기 · 용지 · 쪽 번호 · 머리말 · 〈보기〉 · ㄱㄴㄷ 선지','「인쇄 전 조판(모양만)」을 맡고, 문항 내용은 5E_exam이 맡음'],'g-hwp'],
      clip:['clipboard','세 프로그램이 함께 쓰는 서랍',['⌘C로 담기','⇧⌘V로 서랍 열기','커서 자리에 넣기'],
        ['그림 · 그래프 · 표를 세 프로그램이 같은 서랍으로 주고받음','맥 · 윈도우 클립보드의 캡처 그림도 들어옴','5E_hwp에서는 「커서 자리에 넣기」로 시험지 커서 자리에'],'g-clipboard'],
      ai:['AI 연결','그림 변환 · 라벨 · 그래프',['ChatGPT 계정 로그인','AI 작업대에서 실행','결과 확인 · 「적용」'],
        ['로그인한 ChatGPT 계정의 기능과 이용 한도 안에서 실행','실패로 끝나지 않도록 자동 재시도와 대체 모델','변경은 「적용」을 눌러야 들어감','AI를 쓰지 않는 것 — 기출 변형 · 조판 · 점검'],''],
      engine:['한글 엔진','rhwp',['HWP · HWPX 읽기','쪽 그리기','저장'],
        ['브라우저 안에서 한글 파일을 읽고 쓰는 엔진(rhwp)','5E_exam 미리보기와 5E_hwp 화면이 이 엔진의 실제 HWP 조판','한글 프로그램이 없어도 열고 고치고 저장'],''],
      restore:['기출 복원','AI 없이 한글 문항으로',['평가원 · 학평 원본 PDF','편집 가능한 한글 문항','원본은 근거로 연결'],
        ['원본 PDF를 AI 없이 편집 가능한 한글 문항으로','1,440문항 시험에서 95.7%가 제자리에 복원','미리 변환해 둔 문항은 1초 안에 열림'],'g-exam'],
      typeset:['조판','수능 틀 · 학교 양식',['문항','틀 고르기','쪽에 배치','새로 조판 ⌘Enter'],
        ['기본 수능 틀 — B4 원본 지면, 단 폭 112mm, 본문 11.5pt, 장평 95%, 자간 −3%, 줄 간격 145%','학교 원안지 한글 파일을 등록하면 머리 표 · 꼬리말 · 단 · 쪽 번호를 그대로 두고 그 위에 조판','A4로 뽑으면 쪽 전체가 약 82%로 줄어 그대로'],''],
      lib:['라이브러리','평가원 · 학평 · 교과서',['낱말로 찾기','원본 위에 형광','잘라서 작업대 · 카드로'],
        ['5E 제공 자료를 평가원 · 학평 · 교과서로 나눔','정답 선지 형광펜 · 별표 폴더','쪽 미리보기와 기출 그림은 그림 서버에서 받음(1.7.1)'],''],
      mine:['내 파일','그림 · 문항 · 시험지',['.5e 하나로 저장','어느 프로그램에서 열든 맞는 프로그램으로'],
        ['그림 · 한글 시험지 · 문항 · 시험지를 모두 .5e로 저장(1.7.1)','설치판은 .5e 두 번 눌러 열기, 출제 자료를 ~/Documents/5E/출제 에 자동 저장 · 10분마다 백업','1.6.3 · 1.7.0 파일도 그대로 열림'],''],
      out:['결과물','한글 시험지 · 인쇄 · 그림',['.hwpx 한글 시험지','인쇄 · PDF','PNG 그림'],
        ['시험지는 HWPX로 저장하거나 5E_hwp로 보내 인쇄 전 조판','문항 목록은 엑셀로 내보내기','그림은 PNG로 저장하거나 이미지 복사'],'']};
    const btn=(k,cls,inner)=>`<button type="button" class="${cls}" data-d="${k}">${inner}</button>`;
    const pbox=k=>btn(k,'ar-p',`<i>${k}</i><b>${P[k][1]}</b><span>${P[k][2]}</span>`);
    const chip=(k,t,s)=>btn(k,'ar-chip',`${t}<small>${s}</small>`);
    sec.innerHTML=head+`<div class="ar1">
      <div class="ar1-src"><h5>자료</h5>${chip('lib','라이브러리','평가원 · 학평 · 교과서')}${chip('mine','내 파일','그림 · 문항 · 시험지')}</div>
      <div class="ar1-core"><div class="ar1-name">5E</div>
        <div class="ar1-row">${pbox('image')}<em>→</em>${pbox('exam')}<em>→</em>${pbox('hwp')}</div>
        ${btn('clip','ar1-clip','<b>clipboard</b> 세 프로그램이 함께 쓰는 서랍 · ⌘C · ⇧⌘V')}
        <div class="ar1-eng">${chip('ai','AI 연결','그림 변환 · 라벨 · 그래프')}${chip('engine','한글 엔진','rhwp · 브라우저에서 한글 파일')}${chip('restore','기출 복원','AI 없이 한글 문항으로')}${chip('typeset','조판','수능 틀 · 학교 양식')}</div>
      </div>
      <div class="ar1-out"><h5>결과물</h5>${chip('out','한글 시험지','.hwpx')}${chip('out','인쇄 · PDF','')}${chip('out','그림','PNG')}</div>
    </div>
    <p class="ar-hint">칸을 누르면 안쪽이 아래에 펼쳐집니다</p>
    <div class="ar-deep" aria-live="polite"></div>
    <p class="ar-run">웹 · Mac · Windows — 어디서 열어도 같은 5E</p>`;
    const deep=sec.querySelector('.ar-deep');
    const show=k=>{const d=D[k];sec.querySelectorAll('[data-d]').forEach(b=>b.classList.toggle('on',b.dataset.d===k));
      deep.innerHTML=`<div class="ard-h"><b>${d[0]}</b><span>${d[1]}</span>${d[4]?`<a href="#${d[4]}" class="ard-go">장면으로 보기 →</a>`:''}</div>
        <ol class="ard-flow">${d[2].map((x,i)=>`<li style="--i:${i}">${x}</li>`).join('')}</ol>
        <ul class="ard-f">${d[3].map(x=>`<li>${x}</li>`).join('')}</ul>`;
      deep.classList.remove('in');void deep.offsetWidth;deep.classList.add('in');
      const g=deep.querySelector('.ard-go');if(g)g.addEventListener('click',e=>{const el=document.getElementById(d[4]);if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'})}})};
    sec.querySelectorAll('[data-d]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.d)));
    show('image');
  }
  if(v==='2'){
    const S=[['찾기','라이브러리','평가원 · 학평 · 교과서에서 낱말로','image'],['그리기','5E_image','교과서·기출 그림을 시험 그림으로, 그래프는 식으로','image'],
      ['쓰기','5E_exam','문항 카드에 발문 · 자료 · 〈보기〉 · 선지','exam'],['조판','5E_exam','수능 틀 B4 2단 · 학교 원안지 양식','exam'],
      ['다듬기','5E_hwp','시험지 쪽에서 그림 · 글 바로 고치기','hwp'],['내보내기','.hwpx · PDF','한글 시험지로 저장 · 인쇄','hwp']];
    sec.innerHTML=head+`<ol class="ar2">${S.map((s,i)=>`<li class="ar2-${s[3]}"><span class="ar2-n">0${i+1}</span><b>${s[0]}</b><i>${s[1]}</i><em>${s[2]}</em></li>`).join('')}</ol>
      <div class="ar2-clip"><b>clipboard</b> 어느 단계에서든 ⌘C로 담고 ⇧⌘V로 꺼내기 — 세 프로그램 공통</div>`;
  }
  if(v==='3'){
    const L=[['화면','세 프로그램',[box('image'),box('exam'),box('hwp')].join('')],
      ['잇기','clipboard','<span class="ar3-w">그림 · 그래프 · 표 · 문항을 세 프로그램이 같은 서랍으로 주고받음</span>'],
      ['엔진','안에서 돌아가는 것','<span>AI 연결<small>그림 변환 · 라벨 복원 · 그래프 복원</small></span><span>한글 엔진<small>rhwp · 한글 파일 읽고 쓰기</small></span><span>기출 복원<small>PDF 기출 → 한글 문항</small></span><span>조판<small>수능 틀 · 학교 양식</small></span>'],
      ['자료','쌓이는 것','<span>라이브러리<small>평가원 · 학평 · 교과서</small></span><span>내 파일<small>그림 · 문항 · 시험지</small></span>'],
      ['실행','어디서','<span>웹<small>www.5e.ai.kr</small></span><span>Mac<small>Apple 칩 · 인텔</small></span><span>Windows<small>64비트</small></span>']];
    sec.innerHTML=head+`<div class="ar3">${L.map(l=>`<div class="ar3-l"><div class="ar3-h"><b>${l[0]}</b><small>${l[1]}</small></div><div class="ar3-c">${l[2]}</div></div>`).join('')}</div>`;
  }
  const t=document.getElementById('hx')||document.getElementById('history');if(t)t.parentNode.insertBefore(sec,t);else document.body.appendChild(sec);
  sec.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',e=>{const el=document.getElementById(a.getAttribute('href').slice(1));if(el){e.preventDefault();el.scrollIntoView({behavior:'smooth'})}}));
})();
