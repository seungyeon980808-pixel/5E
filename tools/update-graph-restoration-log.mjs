/** One stable, cumulative, offline HTML report. Evidence and prior runs stay intact. */
import fs from 'node:fs';
import path from 'node:path';
const [evidenceArg, outputArg = 'outputs/graph-restoration'] = process.argv.slice(2);
if (!evidenceArg) throw Error('Usage: node tools/update-graph-restoration-log.mjs evidence-directory [report-directory]');
const root = path.resolve(import.meta.dirname, '..'), output = path.resolve(outputArg), evidence = path.resolve(evidenceArg);
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const relative = file => path.relative(root, file).split(path.sep).join('/');
const href = file => path.relative(output, file).split(path.sep).join('/');
const png = file => file && fs.existsSync(file) ? 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') : '';
fs.mkdirSync(output, { recursive: true });
const logFile = path.join(output, 'runs.json');
const log = read(logFile) || { schema:'5e.graph-restoration-log/v1', history:[], runs:[] };
const historical = path.join(root, 'outputs/graph-restoration-20261008');
if (fs.existsSync(path.join(historical, 'report.json')) && !log.history.includes(relative(historical))) log.history.push(relative(historical));
const context = read(path.join(evidence, 'context.json'));
if (!context?.runId) throw Error('Evidence context.json with runId is required');
const descriptor = { id:context.runId, evidence:relative(evidence) };
const oldIndex = log.runs.findIndex(r => r.id === descriptor.id);
if (oldIndex >= 0) log.runs[oldIndex] = descriptor; else log.runs.push(descriptor);
fs.writeFileSync(logFile, JSON.stringify(log, null, 2));

function functions(plan) {
  return (plan?.series || []).map(s => ({ id:s.id, kind:s.kind, expression:s.expression, domain:s.domain,
    points:s.points?.length, closed:s.closed, curveStyle:s.curveStyle, lineVisible:s.lineVisible,
    failure:s.analyticFitFailure, family:s.approximation?.family || s.physicsModel?.kind,
    origin:s.approximation?.coefficientSource, maxDeviation:s.approximation?.maxDeviation,
    lineStyle:s.lineStyle, strokeWidth:s.strokeWidth }));
}
function features(plan) {
  if (!plan) return [];
  const series = plan.series || [], a = plan.annotations || [];
  const count = kind => a.filter(a => a.kind === kind).length;
  const marks = count('point') + series.reduce((n,s) => n+(s.endpoints?.length || 0),0);
  return [
    ['함수식', series.filter(s => s.kind === 'expression').length],
    ['직선·점·도형 계열', series.filter(s => s.kind !== 'expression').length],
    ['눈금', Object.values(plan.axes || {}).reduce((n,a) => n+(a.ticks?.length || 0),0)],
    ['보조선', count('guide')], ['표시점', marks],
    ['계열·표시 화살표', count('arrow')+series.reduce((n,s) => n+(s.arrowSpecs?.length || 0),0)],
    ['지시선', count('leader')], ['텍스트 표기', count('text')],
    ['점선 계열', series.filter(s => s.lineStyle === 'dashed' || s.dashPattern).length],
    ['강조 영역', (plan.regions || []).length], ['범례', (plan.legends || []).length],
  ].filter(([,n]) => n);
}
const status = (label,value) => `<span class="status ${esc(value)}">${esc(label)} · ${esc({pass:'통과',fail:'실패',review:'검수 필요',pending:'미검증',incomplete:'미완료',basic:'기하 객체'}[value] || value)}</span>`;
const sections = [], summary = [];
for (const descriptor of [...log.runs].reverse()) {
  const e = path.join(root, descriptor.evidence), ctx = read(path.join(e,'context.json'));
  const visual = read(path.join(e,'visual-review.json')) || { cases:[] };
  const records = [];
  for (const group of ['replay','live']) {
    const manifest = read(path.join(e,group+'-manifest.json'));
    if (!manifest) continue;
    for (const c of manifest.cases) {
      const dir = path.join(e,group,c.id), candidate = read(path.join(dir,'candidate.json'));
      const plan = candidate?.graphResult?.plan || candidate?.graphPlan;
      const comparison = group === 'replay' ? read(path.join(dir,'comparison.json')) : null;
      const saved = group === 'replay' ? read(path.join(e,'replay-delivery',c.id,'verification.json')) : read(path.join(dir,'verification.json'));
      const usage = read(path.join(dir,'usage.json'));
      const quality = comparison?.after?.quality || read(path.join(dir,'relationship-audit.json')) || candidate?.graphResult?.quality;
      const review = visual.cases.find(v => v.key === group+'/'+c.id);
      const before = read(path.join(dir,'before/plan.json'));
      records.push({ key:group+'/'+c.id, id:c.id, title:c.title, instructions:c.instructions, group,
        original:path.join(dir,'original.png'), image:path.join(dir,'after.png'), beforeImage:group==='replay'?path.join(dir,'before.png'):null,
        beforeFunctions:functions(before), beforeGenerated:comparison?.before?.generated, beforeError:comparison?.before?.error || comparison?.before?.nativeError,
        generated:group==='replay'?comparison?.after?.generated:!!candidate?.graphResult, quality, functions:functions(plan), features:features(plan),
        usage, saving:!!saved?.saveReopenPass || !!saved?.editingPass && group==='live', savedEditing:saved?.editingPass,
        file:group==='replay'?path.join(e,'replay-delivery',c.id,'automatic.5e'):path.join(dir,'editable-graph.5e'),
        error:saved?.error || comparison?.after?.error, visual:review, calls:group==='live'?saved?.requestCount || 0:0 });
    }
  }
  const actualCalls = read(path.join(e,'live/results.json'))?.actualModelCalls || 0;
  const physicsLog = fs.existsSync(path.join(e,'physics-tests.log')) ? fs.readFileSync(path.join(e,'physics-tests.log'),'utf8') : '';
  const qualityLog = fs.existsSync(path.join(e,'quality-tests.log')) ? fs.readFileSync(path.join(e,'quality-tests.log'),'utf8') : '';
  const workflowLog = fs.existsSync(path.join(e,'workflow-tests.log')) ? fs.readFileSync(path.join(e,'workflow-tests.log'),'utf8') : '';
  const unit = [physicsLog.match(/(\d+) physics family scenarios passed/)?.[1],qualityLog.match(/PASS \((\d+) cases\)/)?.[1],workflowLog.match(/(\d+)\/\d+ passed/)?.[1]].filter(Boolean).map(Number).reduce((a,b)=>a+b,0);
  const replay = records.filter(r=>r.group==='replay'), live = records.filter(r=>r.group==='live');
  const expressions = list => list.reduce((n,r)=>n+r.functions.filter(s=>s.kind==='expression').length,0);
  const remaining = list => list.reduce((n,r)=>n+r.functions.filter(s=>s.kind==='points' && !s.closed && s.lineVisible!==false && s.curveStyle==='smooth').length,0);
  const headline = `${records.filter(r=>r.generated).length}/${records.length} 생성 · ${records.filter(r=>r.saving).length}/${records.length} 저장·재열기 · 상세 편집 ${records.filter(r=>r.usage?.pass).length}/${records.length} 통과`;
  const outcomes = [
    `같은 응답 ${replay.length}건: 함수식 ${replay.reduce((n,r)=>n+r.beforeFunctions.filter(s=>s.kind==='expression').length,0)} → ${expressions(replay)}개.`,
    `새 AI ${live.length}건: 곡선·직선 ${expressions(live)+remaining(live)}개 중 함수식 ${expressions(live)}개, 관찰점 곡선 ${remaining(live)}개. 요청 ${actualCalls}회.`,
    `수식 변경 후 보조선 방향이 깨진 그래프 ${records.filter(r=>r.usage?.expressions?.some(s=>s.obliqueGuides?.length)).length}/${records.length}건. 생성·저장 성공과 분리해 아래에 기록했습니다.`,
    `원본과 나란히 본 스타일 검사: ${records.filter(r=>r.visual?.style==='pass').length}건 통과, ${records.filter(r=>r.visual?.style==='fail').length}건 불일치. 글자 크기·서체와 일부 점 표기를 더 조정해야 합니다.`,
  ];
  sections.push({ id:ctx.runId, title:'직접 재시험 · '+ctx.runId.slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1.$2.$3'), subtitle:headline,
    note:`동일 응답 ${replay.length}개는 수정 전 ${ctx.baseline}과 수정 후 ${ctx.current.slice(0,8)}을 비교했습니다. ${live.length}개는 ${ctx.liveModel || 'gpt-6.1-sol'} / ${ctx.effort || 'medium'}으로 새로 요청했습니다. 관련 단위 검사 ${unit}개 통과. 제품 코드는 수정하지 않았습니다. 관계 판정은 기록된 접점·기준점 검사이며, 원본 전체 보존과 물리 법칙을 인증하지 않습니다.`, outcomes, records, fresh:true });
}
for (const h of log.history) {
  const dir = path.join(root,h), report = read(path.join(dir,'report.json')), manifest = read(path.join(dir,'manifest.json'));
  if (!report || !manifest) continue;
  const records = report.cases.map(r => {
    const delivery = path.join(dir,r.group==='live'?'live-delivery':'replay-delivery',r.id), candidate = read(path.join(delivery,'candidate.json'));
    const c = manifest.cases.find(c => c.id===r.id), plan = candidate?.graphResult?.plan || candidate?.graphPlan;
    return { key:r.key,id:r.id,title:c?.title || r.id,group:'history',original:path.join(delivery,'source.png'),image:path.join(delivery,'native.png'),generated:r.metrics.generation==='pass',
      quality:candidate?.graphResult?.quality,functions:functions(plan),features:features(plan),saving:r.metrics.saving==='pass',savedEditing:r.metrics.editing==='pass',
      file:path.join(delivery,'automatic.5e'),visual:{style:r.visual?.styleStatus || 'pending',notes:r.visual?.notes || []},
      historicalMetrics:r.metrics,calls:r.modelCalls || 0,provenance:'외주 기록을 가져온 항목입니다. 이번 실행에서 재검증하지 않았습니다.' };
  });
  sections.push({id:path.basename(h),title:'외주 결과 · 2026.10.08',subtitle:'저장 응답 5개 + 실제 복원 20개 · 이전 기록',note:'외주 보고서의 이미지·함수식·판정을 보존했습니다. 현재 직접 재시험 결과와 합산하지 않습니다.',records,fresh:false});
}
function figure(label,file,note='') {
  const data = png(file);
  return `<figure><figcaption>${esc(label)}${note?`<small>${esc(note)}</small>`:''}</figcaption>${data?`<button class="image-open" type="button" aria-label="${esc(label)} 크게 보기"><img src="${data}" alt="${esc(label)}" loading="lazy"></button>`:'<div class="missing">이미지 없음 · 생성 결과와 검사 기록을 확인하세요.</div>'}</figure>`;
}
function card(r,run) {
  const expressions = r.functions.filter(s=>s.kind==='expression'), remaining = r.functions.filter(s=>s.kind==='points' && !s.closed && s.lineVisible!==false && s.curveStyle==='smooth');
  const problems = r.usage?.expressions?.flatMap(s=>(s.obliqueGuides || []).map(id=>`${s.seriesId} 식 변경 후 ${id} 보조선이 기울어짐`)) || [];
  const editing = r.usage ? r.usage.pass ? 'pass':'fail' : 'pending';
  const style = r.visual?.style || 'pending';
  const relation = r.historicalMetrics?.relationship || r.quality?.status || 'pending';
  const needsReview = !r.generated || remaining.length || problems.length || editing==='fail' || relation!=='pass' || style!=='pass';
  const rows = r.functions.map(s => `<tr><td>${esc(s.id)}</td><td>${esc(s.kind==='expression'?'함수식':s.closed?'폐곡선 도형':s.lineVisible===false?'산점':s.curveStyle==='smooth'?'관찰점 곡선':'직선·꺾은선')}<small>${esc(s.lineStyle || '')}${s.strokeWidth?' · '+esc(s.strokeWidth)+' mm':''}</small></td><td>${s.expression?`<code>${esc(s.expression)}</code><small>정의역 [${esc(s.domain?.min)}, ${esc(s.domain?.max)}] · ${esc(s.family || '')}${s.origin?' · '+esc(s.origin):''}</small>`:`${s.points || 0}개 점${s.failure?`<small>${esc(s.failure)}</small>`:''}`}</td></tr>`).join('');
  const formulaChecks = (r.usage?.expressions || []).map(s=>`<li>${esc(s.seriesId)}: 식 수정 ${s.edit?'통과':'실패'}, 연결 접점 ${s.contactsChecked ? s.contactsFollow?'통과 ('+s.contactsChecked+'개)':'실패' : '검사 대상 0개'}, 보조선 방향 ${s.guideDirectionsPreserved?'통과':'실패'}${s.error?' · '+esc(s.error):''}</li>`).join('');
  const editImage = r.usage?.expressions?.find(s=>s.editImage)?.editImage;
  summary.push({runId:run.id,key:r.key,generated:r.generated,expressionCount:expressions.length,remainingSmoothCurves:remaining.length,relationship:relation,style,editing,saving:r.saving,provenance:r.provenance || '이번 직접 실행'});
  return `<article class="graph-case" data-run="${esc(run.id)}" data-group="${esc(r.group)}" data-formula="${remaining.length?'incomplete':expressions.length?'expression':'geometry'}" data-review="${needsReview}" data-search="${esc(r.title+' '+r.id)}" id="${esc(run.id+'-'+r.key.replaceAll('/','-'))}">
    <header class="case-head"><div><p class="eyebrow">${esc(r.group==='replay'?'같은 AI 응답 · 코드 수정 전후 비교':r.group==='live'?'새 AI 복원 · Sol 6.1 / medium':'외주 기록 · 이번 미재검증')}</p><h3>${esc(r.title)}</h3><p class="case-id">${esc(r.id)}</p></div>${fs.existsSync(r.file)?`<a class="download" href="${esc(href(r.file))}" download>5E 파일 다운로드</a>`:''}</header>
    <div class="statuses">${status('생성',r.generated?'pass':'fail')}${status('관계',relation)}<span class="status ${remaining.length?'review':'pass'}">함수 ${expressions.length}개${remaining.length?' · 남은 곡선 '+remaining.length+'개':''}</span>${status('상세 편집',editing)}${status('저장·재열기',r.saving?'pass':'pending')}${status('스타일',style)}</div>
    <div class="comparison ${r.beforeImage?'three':'two'}">${figure('원본',r.original)}${r.beforeImage?figure('수정 전',r.beforeImage,r.beforeGenerated===false?'당시 삽입 차단 · 미리보기':'같은 관찰 응답'):''}${figure(r.beforeImage?'수정 후':'자동 재현본',r.image)}</div>
    <p class="image-hint">이미지를 클릭하면 크게 볼 수 있습니다.${r.group==='history'?'':' 비교 이미지의 축 영역과 배율을 맞췄으며 자동 결과를 수동으로 보정하지 않았습니다.'}</p>
    ${r.group==='replay'?`<p class="change">함수식 계열 ${r.beforeFunctions.filter(s=>s.kind==='expression').length} → ${expressions.length}개${r.beforeGenerated===false?' · 생성 차단 해소':''}</p>`:''}
    <div class="features">${r.features.map(([name,n])=>`<span>${esc(name)} <b>${n}</b></span>`).join('')}</div>
    ${problems.length?`<div class="finding"><strong>편집 문제 재현</strong><p>함수식 변경 시 접점은 이동하지만, 보조선 반대쪽 끝이 따라오지 않아 수평·수직 관계가 깨집니다.</p><ul>${problems.map(p=>'<li>'+esc(p)+'</li>').join('')}</ul></div>`:''}
    ${(r.visual?.notes || []).length?`<ul class="visual-notes">${r.visual.notes.map(n=>'<li>'+esc(n)+'</li>').join('')}</ul>`:''}
    ${r.error || r.usage?.error?`<p class="finding">${esc(r.error || r.usage.error)}</p>`:''}
    <details class="technical"><summary>함수식 · 사용 기능 · 검사 내역</summary><div class="table-wrap"><table><thead><tr><th>계열</th><th>편집 방식</th><th>식 또는 데이터</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${r.usage?`<h4>실제 편집 검사</h4><ul><li>내용 변경 없이 적용: ${r.usage.noOp?'통과':'실패'}</li>${formulaChecks}<li>글자 드래그: ${r.usage.annotationDrag===null?'검사 대상 없음':r.usage.annotationDrag?.pass?'통과':'실패'}</li><li>화살표 끝점 수정: ${r.usage.arrowEdit===null?'검사 대상 없음':r.usage.arrowEdit?.pass?'통과':'실패'}</li></ul>${r.usage.annotationDrag?.unrelatedChanges?.length?`<p>글자만 이동했는데 다른 표시의 좌표도 변경됐습니다.</p><ul>${r.usage.annotationDrag.unrelatedChanges.map(d=>'<li>'+esc(d.path)+': '+esc(d.before)+' → '+esc(d.after)+'</li>').join('')}</ul>`:''}${editImage?figure('식에 0.005를 더한 뒤 · 보조선 방향 문제',path.join(path.dirname(r.image),editImage)):''}`:`<p>${esc(r.provenance || '상세 조작 검사는 아직 기록되지 않았습니다.')}</p>`}
    <h4>자동 관계 검사</h4><ul>${(r.quality?.issues || []).map(i=>'<li>'+esc(i.code)+' · '+esc(i.message)+'</li>').join('') || '<li>기록된 명시적 관계 오류 없음. 원본 전체 일치나 물리 법칙을 인증하는 판정은 아닙니다.</li>'}</ul><p class="scope">복원 범위: ${esc(r.instructions || '이전 보고서의 범위를 따릅니다.')}</p></details>
  </article>`;
}
const sectionHTML = sections.map((s,i)=>`<section class="run" id="run-${esc(s.id)}" data-run="${esc(s.id)}"><div class="run-head"><h2>${esc(s.title)}</h2><p>${esc(s.subtitle)}</p><p class="scope">${esc(s.note)}</p>${s.outcomes?`<ul class="outcomes">${s.outcomes.map(t=>'<li>'+esc(t)+'</li>').join('')}</ul>`:''}</div><details class="run-content" ${i===0?'open':''}><summary>${s.records.length}개 그래프 비교${s.fresh?'':' · 이전 기록 펼치기'}</summary>${s.records.map(r=>card(r,s)).join('')}</details></section>`).join('');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>5E 그래프 복원 검증 기록</title><style>
:root{--paper:#f4f7fb;--ink:#17334e;--muted:#5b6c7c;--line:#d4dee8;--blue:#1b65bd;--amber:#936a16;--red:#b1453e;--white:#fff;font-family:"Apple SD Gothic Neo",system-ui,sans-serif;color:var(--ink);background:var(--paper)}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}button,a,input,select,summary{touch-action:manipulation}a{color:var(--blue)}main{max-width:1500px;margin:auto;padding:32px}.masthead{border-left:5px solid var(--blue);padding:4px 0 4px 22px;margin-bottom:28px}h1{font-family:"Avenir Next","Apple SD Gothic Neo",sans-serif;font-size:30px;line-height:1.3;margin:0 0 10px;letter-spacing:-.6px}h2{font-size:21px;margin:0 0 8px}h3{font-size:19px;margin:0}h4{font-size:14px;margin:20px 0 8px}p{line-height:1.6;margin:8px 0}.eyebrow,.case-id,.scope,.image-hint{font-size:12px;color:var(--muted)}.eyebrow{font-weight:600;margin:0 0 6px}.case-id,code{font-family:"SFMono-Regular",Menlo,monospace}.toolbar{position:sticky;top:0;z-index:5;display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:14px 16px;background:#e7eef7;border:1px solid var(--line);border-radius:8px;margin-bottom:26px}.toolbar label{display:flex;align-items:center;gap:7px;font-size:13px}.toolbar input[type=search]{width:240px}.toolbar input,.toolbar select,.toolbar button{min-height:40px;border:1px solid #b8c8d9;background:var(--white);color:var(--ink);border-radius:5px;padding:7px 9px}.toolbar input[type=checkbox]{min-height:auto;accent-color:var(--blue)}#visible-count{margin-left:auto;font-size:12px;color:var(--muted)}.run{margin:0 0 38px}.run-head{padding:20px 0 8px}.run-head>p{margin:4px 0}.run-content>summary{padding:12px 16px;border:1px solid var(--line);border-radius:7px;background:#e7eef7;font-size:14px}.graph-case{margin:18px 0;background:var(--white);border:1px solid var(--line);border-radius:9px;padding:22px}.case-head{display:flex;gap:16px;align-items:start;justify-content:space-between}.download{display:inline-flex;align-items:center;min-height:40px;padding:8px 13px;border:1px solid #b5cce4;border-radius:5px;white-space:nowrap;font-size:13px;text-decoration:none}.statuses{display:flex;flex-wrap:wrap;gap:7px;margin:14px 0}.status{font-size:12px;padding:5px 8px;border:1px solid var(--line);border-radius:4px;background:#f4f7fb}.status.pass{color:#235d48;background:#edf7f1;border-color:#bdd9c9}.status.fail{color:var(--red);background:#fcf0ee;border-color:#e4bfb9}.status.review,.status.incomplete{color:var(--amber);background:#fff7e8;border-color:#e4d0aa}.comparison{display:grid;gap:14px}.comparison.three{grid-template-columns:repeat(3,minmax(0,1fr))}.comparison.two{grid-template-columns:repeat(2,minmax(0,1fr))}figure{margin:0;border:1px solid var(--line);border-radius:6px;overflow:hidden;min-width:0;background:white}figcaption{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;padding:10px 12px;border-bottom:1px solid var(--line);font-size:13px;font-weight:600}small{display:block;color:var(--muted);font-size:11px;font-weight:400;line-height:1.6}figcaption small{font-size:10px}.image-open{display:block;border:0;background:white;padding:0;width:100%;cursor:zoom-in}.image-open img{display:block;width:100%;height:330px;object-fit:contain;padding:8px}.missing{padding:50px 20px;color:var(--muted);font-size:13px;height:330px}.image-hint{margin:7px 0 14px}.change{font-size:13px;font-weight:600;color:var(--blue)}.features{display:flex;gap:8px 16px;flex-wrap:wrap;padding:10px 0;font-size:12px;color:var(--muted)}.features b{color:var(--ink);font-variant-numeric:tabular-nums;margin-left:4px}.finding{margin:14px 0;padding:13px 16px;border-left:3px solid var(--red);background:#fff6f3;font-size:13px}.finding p{margin:4px 0}.finding ul{margin:4px 0;padding-left:20px}.visual-notes{font-size:13px;line-height:1.7;padding-left:20px}.technical{margin-top:14px;border-top:1px solid var(--line)}summary{cursor:pointer;min-height:44px;align-content:center}.technical summary{font-size:13px;font-weight:600}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px;table-layout:fixed}th,td{padding:10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{width:21%}th:nth-child(2),td:nth-child(2){width:19%}code{font-size:12px;line-height:1.7;white-space:normal;overflow-wrap:anywhere}.technical ul{font-size:12px;line-height:1.8;padding-left:20px}.technical .scope{padding:12px;background:var(--paper)}footer{font-size:12px;color:var(--muted);padding:20px 0;border-top:1px solid var(--line)}dialog{border:1px solid var(--line);border-radius:8px;max-width:95vw;width:1300px;max-height:95vh;padding:12px;background:white}dialog::backdrop{background:#15283acc}dialog button{display:block;margin-left:auto;padding:8px 15px;background:var(--paper);border:1px solid var(--line);border-radius:4px;min-height:40px}dialog img{display:block;width:100%;max-height:80vh;object-fit:contain;background:white}:focus-visible{outline:3px solid var(--blue);outline-offset:3px}[hidden]{display:none!important}
@media(max-width:1050px){main{padding:18px}.comparison.three{grid-template-columns:1fr 1fr}.comparison.three figure:last-child{grid-column:1/-1}.comparison.three figure:last-child img{height:370px}}@media(max-width:600px){main{padding:12px}h1{font-size:24px}.graph-case{padding:14px}.case-head{display:block}.download{margin-top:8px}.comparison.three,.comparison.two{grid-template-columns:1fr}.comparison.three figure:last-child{grid-column:auto}.image-open img,.comparison.three figure:last-child img{height:300px}.toolbar{position:static;gap:8px}.toolbar input[type=search]{width:190px}#visible-count{margin-left:0}}@media print{.toolbar,.download,.image-hint,dialog{display:none}.run-content{display:block}.graph-case{break-inside:avoid}.image-open img{height:240px}main{padding:0}.technical{display:none}}
</style><main><header class="masthead"><p class="eyebrow">5E · 그래프 복원 검증 기록</p><h1>원본의 관계가 편집 가능한 그래프로 남았는가</h1><p>원본과 자동 재현본, 실제 함수식과 사용 기능을 같은 곳에서 확인합니다.<br>검사할 때마다 이 페이지에 기록을 추가합니다. 생성·관계·스타일·편집·저장은 별도로 판정합니다.</p></header>
<div class="toolbar"><label>실행 <select id="run"><option value="all">전체 기록</option>${sections.map(s=>`<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label><label>방식 <select id="group"><option value="all">전체</option><option value="replay">같은 응답 재시험</option><option value="live">새 AI 복원</option><option value="history">외주 기록</option></select></label><label>검색 <input id="search" type="search" placeholder="문항명 또는 코드"></label><label><input id="review" type="checkbox">검수 항목만</label><span id="visible-count"></span></div>
${sectionHTML}<footer>최근 갱신 ${esc(new Date().toISOString())} · 최신 직접 실행 ${esc(sections[0]?.id)}. 이전 기록을 덮어쓰지 않고 누적합니다. 이번 자동 결과의 수동 품질 보정 0회. 브라우저 자동 검사는 WebKit이며 Safari 실앱 화면 검사와 구분합니다.</footer></main><dialog id="zoom"><button type="button" id="close-zoom">닫기</button><img alt="확대한 그래프"></dialog><script>
const selectors=['run','group','search','review'].map(id=>document.getElementById(id));
function filter(){const [run,group,search,review]=selectors;let count=0;document.querySelectorAll('.graph-case').forEach(card=>{const visible=(run.value==='all'||card.dataset.run===run.value)&&(group.value==='all'||card.dataset.group===group.value)&&(!search.value||card.dataset.search.toLowerCase().includes(search.value.toLowerCase()))&&(!review.checked||card.dataset.review==='true');card.hidden=!visible;if(visible)count++});document.querySelectorAll('.run').forEach(section=>{section.hidden=!section.querySelector('.graph-case:not([hidden])');if(run.value!=='all'||search.value||group.value!=='all')section.querySelector('.run-content').open=true});document.getElementById('visible-count').textContent=count+'개 결과'}selectors.forEach(el=>el.addEventListener('input',filter));filter();
const zoom=document.getElementById('zoom');document.querySelectorAll('.image-open').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');zoom.querySelector('img').src=image.src;zoom.querySelector('img').alt=image.alt;zoom.showModal()}));document.getElementById('close-zoom').addEventListener('click',()=>zoom.close());zoom.addEventListener('click',e=>{if(e.target===zoom)zoom.close()});
</script></html>`;
fs.writeFileSync(path.join(output,'index.html'),html);
fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({schema:'5e.graph-restoration-log-summary/v1',updatedAt:new Date().toISOString(),runs:sections.map(s=>({id:s.id,title:s.title,caseCount:s.records.length,fresh:s.fresh})),cases:summary},null,2));
console.log(JSON.stringify({html:path.join(output,'index.html'),runs:sections.length,cases:summary.length,bytes:Buffer.byteLength(html)}));
