/* 11-20 시안: 경계 A·B·C(?edge=a|b|c), 역사 1·2·3(?hist=1|2|3). 날짜·이름은 GitHub 저장소·릴리스 기록 그대로. */
(function(){
  'use strict';
  const q=new URLSearchParams(location.search),R=document.documentElement;
  const edge=q.get('edge'),hist=q.get('hist')||'1'; // 11-20: 역사는 세 갈래 선(1안)이 기본
  R.dataset.edge=edge||'a'; // 11-20: 장면 뒤 조명 없앤 A를 기본으로(?edge=0이면 예전 그대로)
  if(!hist)return;
  const old=document.getElementById('history');if(!old)return;
  const sec=document.createElement('section');sec.className='wrap hx hx'+hist;sec.id='hx';
  const head='<div class="group"><b>history</b><span>따로 시작해, 하나가 되기까지.</span></div>';
  // 기록: [갈래, 날짜, 이름, 설명]
  const LANES={image:'5E_image',exam:'5E_exam',hwp:'5E_hwp'};
  if(hist==='1'){
    // 날짜(1년 중 날)→x. 일이 몰린 7월은 넓게, 조용한 9·10월은 좁게(달 눈금이 그대로 보이게).
    const A=[[152,70],[182,180],[213,470],[244,640],[274,760],[305,900],[324,1000]];
    const X=d=>{for(let i=1;i<A.length;i++)if(d<=A[i][0]){const[a,b]=[A[i-1],A[i]];return Math.round(b[1]-(b[0]-d)/(b[0]-a[0])*(b[1]-a[1]))}return 1000};
    const Y={image:84,exam:222,hwp:360};
    // [갈래, 날, 날짜, 이름, 설명, 큰 점이면 'u'(위)/'d'(아래), 작은 점이면 짧은 이름표, 출처]
    const N=[
      ['image',167,'06.16','5E 시작','시험 문제용 그림 편집기','u','','5E 저장소'],
      ['image',194,'07.13','1.0','기출 그림을 끝까지','d','','5E v1.0.0'],
      ['image',196,'07.15','1.0.1','곡선이 점을 지나갑니다','','1.0.1','5E 릴리스'],
      ['image',199,'07.18','1.1','원본을 띄워 놓고 작업하기','','1.1','5E 릴리스'],
      ['image',204,'07.23','1.2','그래프 위에 원하는 걸 얹기','','1.2','5E 릴리스'],
      ['image',207,'07.26','1.3','입체로 그리고, 줄 세워 정리하기','','1.3','5E 릴리스'],
      ['image',212,'07.31','1.4','MCP 연결 · 이미지 라이브러리','u','','5E 릴리스'],
      ['image',221,'08.09','1.5','그림을 가져오고, 고치고, 다시 쓰기','d','','5E 릴리스'],
      ['image',225,'08.13','1.5.8','교과서 PDF 검색·자르기 · AI 그래프','','1.5.8','5E 릴리스'],
      ['image',272,'09.29','1.6','어떤 그림이든 시험용 그림으로','u','','5E 릴리스'],
      ['image',280,'10.07','1.6.3','웹 정비 · 라이브러리 즉시 표시','','1.6.3','5E 릴리스'],
      ['exam',203,'07.22','ExamPool','근거 있는 출제 — 명제 은행','u','','ExamPool v0.1.0'],
      ['exam',220,'08.07~09','문서 색인 · 조판','PDF 외 14종 문서 색인, 시험지 조판 내장','','색인','ExamPool 커밋'],
      ['exam',227,'08.15','PDF → 한글','PDF 시험지를 한글 시험지로 다시 짜기','','PDF→한글','ExamPool 커밋'],
      ['exam',236,'08.24','HWP 변환기','PDF 시험지를 고칠 수 있는 한글로','d','','ExamPool HWP 변환기 v0.1.0'],
      ['exam',268,'09.25','기출 탐색기','수능·모평·학평 기출 검색','u','','exam-search 저장소'],
      ['exam',293,'10.19~22','기출 복원 엔진 · 학교 양식','5E 안에서 기출을 한글 문항으로, 원안지 한글 파일로 조판 기준','','복원·양식','5E 커밋'],
      ['hwp',186,'07.05','HwpPalette','한글 반복 작업을 블럭 하나로','u','','HwpPalette 저장소'],
      ['hwp',207,'07.26','0.1','첫 공개','','0.1','HwpPalette 0.1.0'],
      ['hwp',212,'07.31','0.3','한글 창 도킹 · 문항 엑셀','d','','HwpPalette v0.3.0'],
      ['hwp',225,'08.13','rhwp','브라우저에서 한글 파일을 읽고 쓰는 엔진','u','','rhwp 저장소'],
      ['hwp',281,'10.08','5E 안으로','5E 안에 한글 작업 공간(rhwp)','','5E 안으로','5E 커밋'],
      ['hwp',289,'10.16','5E_hwp','이름이 5E_hwp로','','5E_hwp','5E 커밋','b']];
    const MX=X(319),M0=X(300);
    // 11-24: 다음 계획(docs/dev/roadmap.md · 11-24 그림 엔진 방향 결정). 지금 판(1.7.2)부터 2.0까지 판마다 한 줄 목표 + 하는 일.
    const RM=[['now','1.7.2','11.24 출시','말로 그리는 새 그림 엔진',['그리고 싶은 그림을 말로 — 평가원식 흑백 그림, 「여기 고쳐 줘」로 그 부분만','2027학년도 수능 과학탐구 8과목 기출','설치판 앱 안 업데이트']],
      ['next','1.7.3','다음','정확한 그림, 편집 가능한 라벨 생성',['도식과 분위기 그림을 나눠 그리기 — 도식은 값과 개수를 그린 뒤 검사','그림 속 글자·지시선을 처음부터 고칠 수 있는 라벨로','기출 그림 변환에서 원래 구조 그대로']],
      ['','1.8.0','','출제 하네스 도입',['AI가 선생님께 물어 계획표를 세우고 → 문항 카드 → 시험지 초안','초안에 칸마다 코멘트를 달면 반영하고, 판끼리 비교','정확해야 하는 도식·그래프는 AI 설계도대로 5E가 선 하나하나 그림 — 값이 맞고 모두 고칠 수 있음','문항에 정답 입력 칸']],
      ['','1.9.0','','검토와 근거',['AI가 문항을 따로 풀어 정답·복수 정답·선지 오류 점검','문항마다 교육과정·성취기준·교과서 위치를 5E 안의 자료에서 인용 — 판정 대신 확인할 곳을 보여 주고, 결정은 교사','ChatGPT 로그인 말고 API 키로도 연결']],
      ['goal','2.0','2027.03 전','출제의 처음부터 끝까지 5E 안에서',['구상 · 그림 · 조판 · 검토 · 이의 제기 대응','휴대폰: 문항 · 시험지 · 사진']]];
    const ROADMAP=`<div class="hx-road"><h4>next <span>지금 판과 다음 계획</span></h4><ol>${RM.map(([k,v,d,t,li])=>`<li class="${k}"><div class="v"><b>${v}</b>${d?`<span>${d}</span>`:''}</div><div class="c"><strong>${t}</strong><ul>${li.map(x=>`<li>${x}</li>`).join('')}</ul></div></li>`).join('')}</ol></div>`;
    const lane=k=>{const s=Math.min(...N.filter(n=>n[0]===k).map(n=>n[1]));const y=Y[k],x0=X(s);
      return y===Y.exam?`M${x0} ${y} H${MX}`:`M${x0} ${y} H${M0} C${M0+45} ${y} ${MX-45} ${Y.exam} ${MX} ${Y.exam}`};
    const esc=s=>s.replace(/"/g,'&quot;');
    let svg=`<svg class="hx-map" viewBox="0 0 1200 445" role="img" aria-label="5E_image, 5E_exam, 5E_hwp 세 갈래가 2026년 11월 1.7에서 하나로 합쳐지는 그림">`;
    [['6월',152],['7월',182],['8월',213],['9월',244],['10월',274],['11월',305]].forEach(([t,d])=>svg+=`<line class="hx-tick" x1="${X(d)}" y1="22" x2="${X(d)}" y2="415"/><text class="hx-mo" x="${X(d)+4}" y="436">${t}</text>`);
    svg+=`<text class="hx-mo" x="1025" y="436">다음</text>`;
    Object.keys(Y).forEach(k=>{svg+=`<path class="hx-line hx-${k}" d="${lane(k)}" pathLength="1"/><text class="hx-lane" x="4" y="${Y[k]+4}">${k}</text>`});
    svg+=`<path class="hx-line hx-one" d="M${MX} ${Y.exam} H1030" pathLength="1"/><path class="hx-future" d="M1030 ${Y.exam} H1165"/>`;
    N.forEach(([k,d,dt,t,s,pos,tag,src,side],i)=>{const x=X(d),y=Y[k],det=esc(`${dt} · ${t} — ${s} (${src})`);
      if(pos){const ty=pos==='u'?y-30:y+30;
        svg+=`<g class="hx-node" style="--i:${i}" data-d="${det}" tabindex="0"><circle cx="${x}" cy="${y}" r="5.5"/><text x="${x}" y="${ty-(pos==='u'?12:0)}" class="hx-t"><tspan class="hx-dt">${dt}</tspan> ${t}</text><text x="${x}" y="${ty+(pos==='u'?2:14)}" class="hx-s">${s}</text></g>`}
      else svg+=`<g class="hx-node hx-min" style="--i:${i}" data-d="${det}" tabindex="0"><circle cx="${x}" cy="${y}" r="3.6"/><text x="${x}" y="${side==='b'?y+19:y-11}" class="hx-tag">${tag}</text></g>`});
    svg+=`<g class="hx-node hx-big" style="--i:26" data-d="11.15 · 1.7 — 출제를 한 곳에서: 5E_image · 5E_exam · 5E_hwp + 클립보드 (5E 릴리스)" tabindex="0"><circle cx="${MX}" cy="${Y.exam}" r="10"/><line class="hx-lead" x1="${MX}" y1="${Y.exam-12}" x2="1090" y2="${Y.image-4}"/><text x="1090" y="${Y.image-30}" class="hx-t"><tspan class="hx-dt">11.15</tspan> 1.7 — 셋이 한 창으로</text><text x="1090" y="${Y.image-14}" class="hx-s">5E_image · 5E_exam · 5E_hwp + 클립보드</text></g>`;
    svg+=`<g class="hx-node hx-min" style="--i:27" data-d="11.19 · 1.7.1 — 덜어내고 고친 판 (5E 릴리스)" tabindex="0"><circle cx="${X(323)}" cy="${Y.exam}" r="3.6"/><text x="${X(323)}" y="${Y.exam+22}" class="hx-tag">1.7.1</text></g>`;
    // 11-24: 1.7.2(11.24) — 지금 판: 진한 점과 「1.7.2 / 말로 그리기」 이름표(선 위), 굵은 선이 여기까지. 1.7.1은 작은 중간 점(이름표 아래)
    svg+=`<g class="hx-node hx-now" style="--i:28" data-d="11.24 · 1.7.2 — 말로 그리는 새 그림 엔진 · 2027 수능 기출 (5E 릴리스)" tabindex="0"><circle cx="1030" cy="${Y.exam}" r="6.5"/><text x="1030" y="${Y.exam-30}" class="hx-t">1.7.2</text><text x="1030" y="${Y.exam-16}" class="hx-s">말로 그리기</text></g>`;
    [['1.8',1075,'출제 하네스'],['1.9',1120,'검토와 근거'],['2.0',1165,'2027.03 전']].forEach(([v,x,s],i)=>svg+=`<g class="hx-node hx-fut" style="--i:${29+i}" data-d="다음 · ${v} — ${s}" tabindex="0"><circle cx="${x}" cy="${Y.exam}" r="4.5"/><text x="${x}" y="${Y.exam+(i%2?-30:32)}" class="hx-t">${v}</text><text x="${x}" y="${Y.exam+(i%2?-16:46)}" class="hx-s">${s}</text></g>`);
    svg+='</svg>';
    sec.innerHTML=head+`<div class="hx-wrap">${svg}</div><p class="hx-tip" aria-live="polite">점에 마우스를 올리면 자세히 · 작은 점은 중간 판과 작업</p><p class="hx-note">그림 편집기, 출제 도구, 한글 팔레트 — 처음엔 셋이 각자 따로였습니다. 브라우저에서 한글 파일을 다루는 엔진과 AI 변환이 나오면서, 1.7에서 한 창에 들어왔습니다.</p>${ROADMAP}`;
    const tip=sec.querySelector('.hx-tip'),t0=tip.textContent;
    sec.querySelectorAll('.hx-node').forEach(g=>{const on=()=>{tip.textContent=g.dataset.d;sec.querySelectorAll('.hx-node.cur').forEach(x=>x.classList.remove('cur'));g.classList.add('cur')};
      g.addEventListener('pointerenter',on);g.addEventListener('focus',on);g.addEventListener('click',on)});
    sec.querySelector('.hx-map').addEventListener('pointerleave',()=>{tip.textContent=t0;sec.querySelectorAll('.hx-node.cur').forEach(x=>x.classList.remove('cur'))});
  }
  if(hist==='2'){
    const C=[['image','img/hist/5e-v100.jpg','5E 1.0 · 2026.07','그림 편집기 하나','img/mont/s1v3-chrome-on.jpg','5E_image · 1.7'],
      ['exam','img/hist/exampool-poster-s.jpg','ExamPool · 2026.07','근거 있는 출제 도구(따로 만든 프로그램)','img/mont/s4v3-09.jpg','5E_exam · 1.7'],
      ['hwp','img/hist/hwppalette-main.jpg','HwpPalette v0.3.0 · 2026.07','한글 옆에 띄우는 Windows 팔레트','img/mont/s7v4-a02.jpg','5E_hwp · 1.7']];
    sec.innerHTML=head+`<div class="hx-cols">${C.map(c=>`<figure class="hx-cmp" style="--cut:50%"><div class="hx-cmp-box"><img class="hx-now" src="${c[4]}" alt="${c[5]} 실제 화면" loading="lazy"><div class="hx-then"><img src="${c[1]}" alt="${c[2]} 실제 화면" loading="lazy"></div><span class="hx-h"><i></i></span><em class="hx-ta">그때</em><em class="hx-tb">지금</em></div><figcaption><b>${c[0]}</b><span>${c[2]} — ${c[3]}</span><span>→ ${c[5]}</span></figcaption></figure>`).join('')}</div><p class="hx-merge"><b>11.15 · 1.7</b> 따로 있던 셋이 한 창으로 — 손잡이를 끌어 그때와 지금을 비교해 보세요</p>`;
    sec.querySelectorAll('.hx-cmp-box').forEach(b=>{const f=b.parentNode;const mv=e=>{const r=b.getBoundingClientRect();f.style.setProperty('--cut',Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100))+'%')};
      b.addEventListener('pointerdown',e=>{b.setPointerCapture(e.pointerId);mv(e);b.onpointermove=mv;b.onpointerup=()=>{b.onpointermove=null}})});
  }
  if(hist==='3'){
    const C={image:[['06.16','5E 시작','시험 문제용 그림 편집기'],['07','1.0','기출 그림 한 장을 끝까지'],['07.31','1.4','가져온 그림을 흑백 선화로'],['08','1.5','라이브러리 · AI 작업대 · 교과서 PDF'],['09.29','1.6','AI 변환 + 고칠 수 있는 라벨']],
      exam:[['07.22','ExamPool','근거 있는 출제 — 명제를 근거와 함께 모아 문항으로'],['09.25','기출 탐색기','수능·모평·학평 기출 검색']],
      hwp:[['07.05','HwpPalette','한글 반복 작업을 블럭 하나로 · Windows'],['08.13','rhwp','브라우저에서 한글 파일을 읽고 쓰는 엔진']]};
    sec.innerHTML=head+`<div class="hx-three">${Object.keys(C).map(k=>`<div class="hx-col"><h4>${k}</h4><ol>${C[k].map(r=>`<li><span>${r[0]}</span><b>${r[1]}</b><em>${r[2]}</em></li>`).join('')}</ol></div>`).join('')}</div><div class="hx-join"><svg viewBox="0 0 900 70" preserveAspectRatio="none" aria-hidden="true"><path d="M150 0 C150 40 450 30 450 70 M450 0 V70 M750 0 C750 40 450 30 450 70"/></svg><div class="hx-one-box"><span>11.15</span><b>1.7 — 셋이 한 창으로</b><em>5E_image · 5E_exam · 5E_hwp + 클립보드</em></div><p class="hx-next">지금 · 1.7.2 말로 그리기 → 다음 · 1.7.3 정확한 그림 · 편집 가능한 라벨 → 1.8 출제 하네스 → 1.9 검토와 근거 → 2.0 (2027.03 전)</p></div>`;
  }
  old.parentNode.insertBefore(sec,old);old.style.display='none';
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){sec.classList.add('hx-in');io.disconnect()}}),{threshold:.3});io.observe(sec);
})();
