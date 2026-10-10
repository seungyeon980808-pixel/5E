/** Builds visual report from retained candidates. No provider calls or plan edits. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
if(!process.env.OUTPUT_DIR||!process.env.GRAPH_AUTOMATIC_BATCH_EVIDENCE)throw Error('OUTPUT_DIR and GRAPH_AUTOMATIC_BATCH_EVIDENCE required');
const out=path.resolve(process.env.OUTPUT_DIR),input=path.resolve(process.env.GRAPH_AUTOMATIC_BATCH_EVIDENCE);
const delivery=JSON.parse(fs.readFileSync(path.join(out,'delivery-verification.json'))),batch=JSON.parse(fs.readFileSync(path.join(input,'results.json')));
const findingsFile=path.join(out,'visual-review.json');
const findings=fs.existsSync(findingsFile)?JSON.parse(fs.readFileSync(findingsFile)):[];
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const verdicts={usable:'사용 가능한 수준','needs-review':'추가 조정 필요',failed:'재현 실패'};
const stage=name=>name?Number(name.replace('attempt-',''))+'차':'결과 없음';
const cards=delivery.cases.map(c=>{
 const finding=findings.find(f=>f.id===c.id),candidate=batch.results.find(r=>r.id===c.id);
 return `<article id="${html(c.id)}"><h2>${c.index}. ${html(c.title)}</h2><p>AI 요청 ${candidate.attempts.length}회 · 수동 보정 0회 · 편집 검증 ${c.editingPass?'통과':'확인 필요'} · 시각 검수 ${html(verdicts[finding?.verdict]||'대기')}</p><div class="pictures">${[['original','원본 그래프'],['first','첫 생성'],['final','마지막 유효 결과']].map(([file,title])=>`<section><h3>${title}${file==='first'?' · '+html(stage(c.first)):file==='final'?' · '+html(stage(c.final)):''}</h3><a href="${html(c.id)}/${file}.png"><img loading="eager" src="${html(c.id)}/${file}.png" alt="${html(c.title+' '+title)}"></a></section>`).join('')}</div><p>${html(finding?.finding||c.error||'세부 모양의 일치 여부는 아직 확정하지 않았습니다.')}</p><p><a href="${html(c.id)}/source.png">첨부한 원본</a> · <a href="${html(c.id)}/first-plan.json">첫 응답 데이터</a> · <a href="${html(c.id)}/final-plan.json">마지막 응답 데이터</a> · <a href="${html(c.id)}/final.svg">SVG</a>${c.editingPass?` · <a href="${html(c.id)}/editable-graph.5e">편집 가능한 5E</a>`:''}</p></article>`;
}).join('');
const head=`<header><h1>그래프 자동 복원 · 8종 · 최대 3회</h1><p><b>실제 AI 요청 ${batch.requestCount}회 · 사람의 그래프 데이터 보정 0회 · 이미지 생성 0회</b></p><p>원본을 관찰해 편집 가능한 그래프 객체를 만들고, 원본과 직전 렌더를 함께 보여주어 최대 두 번 보정했습니다. 원본·첫 생성·마지막 유효 결과를 동일한 화면 범위에 나란히 배치했습니다. 각 결과는 실제 AI 응답 그대로이며, 보정 횟수만으로 원본과 일치했다고 판정하지 않습니다.</p><p>편집·실행 취소·저장/재열기 ${delivery.cases.filter(c=>c.editingPass).length}/${delivery.cases.length} 통과. 모델 호출은 인증된 CLI에서, 편집 검증은 실제 웹앱에서 실행했습니다.</p><p><a href="editable-graphs.5e">모든 그래프가 들어 있는 5E</a> · <a href="overview.png">전체 비교 이미지</a> · <a href="delivery-verification.json">편집 검증 기록</a> · <a href="visual-review.json">시각 검수 기록</a></p></header>`;
const style=`body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;margin:28px auto;padding:0 20px;max-width:2100px;color:#222;background:#f4f5f7}header,article{background:white;padding:24px;border:1px solid #ddd;border-radius:12px;margin-bottom:24px}h1{font-size:28px}h2{font-size:22px}h3{font-size:17px}.pictures{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.pictures section{border:1px solid #e4e4e4;padding:10px;border-radius:8px}.pictures img{width:100%;display:block}p{line-height:1.65}a{color:#125caa}@media(max-width:950px){.pictures{grid-template-columns:1fr}}`;
const initialPass=batch.results.filter(c=>c.attempts[0]?.rendered).length;
const summary=`<p>첫 응답에서 그래프 생성 ${initialPass}/${batch.results.length} → 최종 생성 ${batch.results.filter(c=>c.attempts.at(-1)?.rendered).length}/${batch.results.length}. 시각 평가: 사용 가능 ${findings.filter(f=>f.verdict==='usable').length}종 · 추가 조정 ${findings.filter(f=>f.verdict==='needs-review').length}종.</p><p>최초 6종의 비활성 크기 필드 오류는 자동 보정에서 복구했습니다. 실행 후 이 오류를 예방하는 지시와 범례 중복 방지를 추가했습니다. 비교 결과는 실제 v8 응답이며, 후속 v9 지시로 새 모델 요청을 더 보내지는 않았습니다.</p>`;
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>그래프 자동 복원 8종 비교</title><style>${style}</style>${head.replace('</header>',summary+'</header>')}${cards}</html>`);
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:2200,height:1600}});
 const base=process.env.PREVIEW_URL||'http://127.0.0.1:64826/preview/';
 const reportURL=new URL('/'+path.relative(root,out).split(path.sep).join('/')+'/index.html',base).href;
 await page.goto(reportURL,{waitUntil:'networkidle'});
 await page.locator('article img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));});
 for(const c of delivery.cases)await page.locator('#'+c.id).screenshot({path:path.join(out,c.id+'-comparison.png')});
 await page.addStyleTag({content:'header{padding:20px}article{padding:12px;margin-bottom:12px}article h2{font-size:20px;margin:6px 0}article p{font-size:14px;margin:6px 0}.pictures img{height:280px;object-fit:contain}.pictures h3{margin:3px 0}'});
 await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});
 console.log(JSON.stringify({reportURL,actualModelCalls:batch.requestCount,editingPasses:delivery.cases.filter(c=>c.editingPass).length}));
}finally{await browser.close();}
