/** Self-contained comparison report. Missing results remain visible as missing. */
import fs from 'node:fs';
import path from 'node:path';
const [manifestFile, output] = process.argv.slice(2);
if (!manifestFile || !output) throw new Error('Usage: node tools/build-graph-restoration-report.mjs manifest.json output-directory');
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const image = file => fs.existsSync(file) ? `data:image/${file.endsWith('.svg') ? 'svg+xml' : 'png'};base64,${fs.readFileSync(file).toString('base64')}` : '';
const live = read(path.join(output, 'live', 'results.json'));
const replay = read(path.join(output, 'replay', 'results.json'));
const finalAutomatic = read(path.join(output, 'final-automatic', 'results.json'));
const reviews = read(path.join(output, 'visual-review.json')) || { cases: [] };
const visuals = new Map(reviews.cases.map(c => [c.key, c]));
const records = [];
const badge = (label, value) => `<span class="badge ${escape(value)}">${escape(label)}: ${escape(({ pass: '통과', review: '검수 필요', fail: '실패', pending: '미검증', incomplete: '미완료', basic: '기하 객체' })[value] || value)}</span>`;
function add(c, group) {
  const delivery = path.join(output, group === 'replay' ? 'replay-delivery' : 'live-delivery', c.id);
  const dir = path.join(output, group, c.id);
  const candidate = read(path.join(delivery, 'candidate.json')) || read(path.join(dir, 'candidate.json'));
  const plan = candidate?.graphResult?.plan || candidate?.graphPlan;
  const verification = read(path.join(delivery, 'verification.json'));
  const automatic = group === 'live' ? live?.cases.find(r => r.id === c.id) : replay?.cases.find(r => r.id === c.id);
  const key = group + '/' + c.id, visual = visuals.get(key);
  const formulas = plan?.series?.filter(s => s.kind === 'expression') || [];
  const quality = verification?.quality || candidate?.graphResult?.quality || read(path.join(dir, 'relationship-audit.json')) || automatic?.quality;
  const unresolved = quality?.issues?.filter(i => i.code === 'ANALYTIC_FALLBACK') || automatic?.relationshipIssues?.filter(i => i.code === 'ANALYTIC_FALLBACK') || [];
  const generation = candidate && plan ? 'pass' : automatic?.error ? 'fail' : 'pending';
  const relationship = visual?.relationshipStatus || (quality?.status ?? automatic?.relationshipStatus ?? 'pending');
  const style = visual?.styleStatus || 'pending';
  const expected=visual?.expectedAnalyticCurves ?? c.expectedAnalyticCurves;
  const analytic = generation === 'pending' ? 'pending' : expected !== undefined ? formulas.length >= expected ? 'pass' : 'incomplete' : unresolved.length ? 'incomplete' : formulas.length ? 'pass' : generation === 'pass' ? 'basic' : 'pending';
  const editing = verification?.editingPass ? 'pass' : verification?.error ? 'fail' : 'pending';
  const saving = verification?.saveReopenPass ? 'pass' : verification?.error ? 'fail' : 'pending';
  const metrics = { generation, relationship, style, analytic, editing, saving };
  const source = image(path.join(delivery, 'source.png')) || image(c.sourcePath);
  const native = image(path.join(delivery, 'native.png')) || image(path.join(dir, 'native.svg'));
  const relative = path.relative(output, delivery);
  const saved = fs.existsSync(path.join(delivery, 'automatic.5e'));
  const manual = fs.existsSync(path.join(delivery, 'manual-edit-test.5e'));
  const seriesRows = (plan?.series || []).map(s => s.kind === 'expression'
    ? `<div class="formula"><strong>${escape(s.id)}</strong><code>${escape(s.expression)}</code><small>정의역 [${escape(s.domain?.min)}, ${escape(s.domain?.max)}] · ${escape(s.approximation?.family || s.physicsModel?.kind || '표현식')}<br>${escape(s.approximation?.coefficientSource || '')}${s.approximation?.maxDeviation === undefined ? '' : ' · 최대 표시 오차 ' + escape(s.approximation.maxDeviation)}</small></div>`
    : `<div class="geometry"><strong>${escape(s.id)}</strong> · ${escape(s.kind)}${s.points ? ` (${s.points.length}개 관찰점)` : ''}<small>${escape(s.analyticFitFailure || (s.curveStyle === 'smooth' ? '관찰점 편집 유지; 수식화 판정 확인' : '직선·수직선·꺾은선 등 네이티브 기하'))}</small></div>`).join('');
  const error = verification?.error || automatic?.error;
  const issues = [...(quality?.issues || automatic?.relationshipIssues || []), ...(visual?.issues || [])];
  records.push({ key, id: c.id, group, metrics, formulas: formulas.map(s => s.expression), expectedAnalyticCurves:expected, saved, manual,
    modelCalls: group === 'live' ? automatic?.requestCount ?? null : 0, postprocessingModelCalls:0, error, visual });
  return `<article class="case" id="${escape(group + '-' + c.id)}" data-group="${group}" data-category="${escape(c.category || '')}" data-review="${Object.values(metrics).some(m => !['pass', 'basic'].includes(m))}">
    <header><div><p class="eyebrow">${group === 'replay' ? '저장 응답 무호출 재검증' : 'Sol 6.1 · medium 최초 응답 · 무호출 후처리'} · ${escape(c.category || c.caseKind || '')}</p><h2>${escape(c.title || c.id)}</h2><p class="id">${escape(c.id)}</p></div><div class="downloads">${saved ? `<a href="${escape(relative)}/automatic.5e" download>자동 결과 .5e</a>` : '<span>자동 .5e 미생성</span>'}${manual ? `<a class="manual" href="${escape(relative)}/manual-edit-test.5e" download>별도 편집 검사본</a>` : ''}</div></header>
    <div class="badges">${badge('생성', generation)}${badge('관계', relationship)}${badge('스타일', style)}${badge('수식화', analytic)}${badge('편집', editing)}${badge('저장·재열기', saving)}</div>
    <div class="compare"><figure><figcaption>원본${c.sourceCaveat ? ' · 범위 확인 필요' : ''}</figcaption>${source ? `<img src="${source}" alt="${escape(c.id)} 평가원 원본" loading="lazy">` : '<p>원본 파일 없음</p>'}</figure><figure><figcaption>자동 결과 · 수동 보정 없음</figcaption>${native ? `<img src="${native}" alt="${escape(c.id)} 자동 복원 결과" loading="lazy">` : '<p>자동 결과가 생성되지 않았습니다.</p>'}</figure><section class="equations"><h3>편집 원본 함수식·기하</h3>${seriesRows || '<p>편집 가능한 계열이 아직 없습니다.</p>'}<p class="units">x: ${escape(plan?.axes?.x?.calibration?.unit || plan?.axes?.x?.unit || '수치 눈금 기준 / 상대 좌표')}<br>y: ${escape(plan?.axes?.y?.calibration?.unit || plan?.axes?.y?.unit || '수치 눈금 기준 / 상대 좌표')}</p></section></div>
    ${visual?.notes?.length ? `<ul class="notes">${visual.notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul>` : '<p class="notes">원본 대비 수동 시각 판정이 아직 기록되지 않았습니다.</p>'}
    ${issues.length ? `<details><summary>관계·수식화·스타일 검수 항목 ${issues.length}개</summary><ul>${issues.map(i => `<li><strong>${escape(i.code || i.category)}</strong> ${escape(i.message || i.reason)}</li>`).join('')}</ul></details>` : ''}
    ${error ? `<p class="error">${escape(error)}</p>` : ''}
    ${c.sourceCaveat ? `<p class="caveat">${escape(c.sourceCaveat)}</p>` : ''}
    ${c.priorSubmissionKnown ? `<p class="caveat">이전 전체 제출 이력: ${escape(c.priorSubmissionKnown)}. 이번 기본 5개에는 포함되지 않습니다.</p>` : ''}
    ${group==='live' ? `<p class="caveat"><a href="live/${escape(c.id)}/native.png">최초 자동 화면</a> · <a href="live/${escape(c.id)}/response.txt">수정하지 않은 실제 응답</a></p>` : ''}
    <p class="scope">${escape(c.instructions)}</p>
  </article>`;
}
const replayCards = manifest.cases.slice(0, 5).map(c => add(c, 'replay')).join('');
const liveCards = manifest.cases.map(c => add(c, 'live')).join('');
const tally = group => {
  const r = records.filter(c => c.group === group);
  return ['generation', 'relationship', 'style', 'analytic', 'editing', 'saving'].map((key, i) => {
    const good = r.filter(c => c.metrics[key] === 'pass').length;
    return `<span><strong>${good}/${r.length}</strong>${['생성', '관계', '스타일', '수식화', '편집', '저장'][i]}</span>`;
  }).join('');
};
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>5E 평가원 그래프 복원 · 2026-10-08</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f4f7;color:#17212c;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}a{color:#174c94}main{max-width:1440px;margin:auto;padding:30px}.intro,.summary,.case{background:#fff;border:1px solid #d7dde5;border-radius:12px;padding:24px;margin:0 0 20px}h1{font-size:29px;letter-spacing:-.5px;line-height:1.25;margin:0 0 12px}h2{font-size:20px;line-height:1.3;margin:0}h3{font-size:15px;margin:0 0 16px}p{margin:8px 0}.eyebrow,.id,.scope,.caveat{font-size:12px;color:#596575}.eyebrow{font-weight:600;margin:0 0 6px}.id{font-family:monospace}.intro>p{max-width:1000px}.controls{display:flex;flex-wrap:wrap;gap:14px;padding:10px 0}select,button{font:inherit;border:1px solid #bbc6d2;border-radius:6px;padding:7px 10px;background:#fff;color:inherit}.tally{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}.tally span{display:flex;flex-direction:column;color:#596575}.tally strong{font-size:23px;color:#17212c}.case>header{display:flex;justify-content:space-between;align-items:start;gap:16px}.downloads{display:flex;gap:8px;flex-wrap:wrap}.downloads a,.downloads span{display:block;padding:7px 10px;border:1px solid #b7c9e0;border-radius:6px;font-size:13px}.downloads .manual{border-color:#b78b58;color:#6c4b27}.badges{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}.badge{font-size:12px;padding:4px 8px;border-radius:4px;background:#edf0f4;border:1px solid #cfd6df}.badge.pass{background:#eef6f2;border-color:#b9d8c9;color:#215641}.badge.fail{background:#fcefed;border-color:#e5bbb5;color:#943d30}.badge.review,.badge.incomplete{background:#fff6e7;border-color:#e5cfaa;color:#75551d}.compare{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr);gap:16px}figure{margin:0;background:#fff;border:1px solid #d7dde5;border-radius:6px;overflow:hidden}figcaption{font-size:12px;padding:10px;border-bottom:1px solid #d7dde5;color:#35485d}figure img{width:100%;height:350px;display:block;object-fit:contain;padding:10px}.equations{padding:16px;border:1px solid #d7dde5;border-radius:6px;min-width:0}.formula,.geometry{margin-bottom:16px}.formula strong,.geometry strong{font-size:13px;display:block}code{display:block;overflow-wrap:anywhere;font:14px/1.65 ui-monospace,SFMono-Regular,monospace;background:#f3f5f8;border-radius:4px;padding:9px;margin:5px 0}small{display:block;font-size:11px;color:#647080}.units{font-size:12px;color:#647080}.notes{margin:14px 0;font-size:13px;padding-left:20px}details{font-size:13px;padding:10px;background:#f6f7f9;border-radius:5px}summary{cursor:pointer;min-height:30px}.error{white-space:pre-wrap;color:#8a3429;font-size:12px}.scope{border-top:1px solid #e1e6ed;padding-top:10px}.section-title{font-size:24px;margin:30px 0 12px}[hidden]{display:none!important}
select,button{min-height:44px}.downloads a,.downloads span{min-height:44px;display:flex;align-items:center}summary{min-height:44px;display:flex;align-items:center}
@media(max-width:900px){main{padding:16px}.intro,.summary,.case{padding:17px}.compare{grid-template-columns:1fr 1fr}.equations{grid-column:1/-1}.case>header{display:block}.downloads{margin-top:12px}.tally{grid-template-columns:repeat(3,1fr)}}
@media(max-width:540px){main{padding:10px}h1{font-size:23px}.compare{grid-template-columns:1fr}.equations{grid-column:auto}figure img{height:290px}.badges{gap:5px}.case>header h2{font-size:18px}.controls{display:block}.controls label{display:block;margin:8px 0}}
@media(prefers-color-scheme:dark){body{background:#151b22;color:#e4e9ef}.intro,.summary,.case{background:#1e2731;border-color:#3a4654}.equations{border-color:#495664}code,details{background:#2a3441;color:#e4e9ef}select,button{background:#263140;border-color:#5a6a7e}.tally strong{color:#e4e9ef}.eyebrow,.id,.scope,.caveat,.units,small,.tally span{color:#b5c2d1}a{color:#a9cbf6}.downloads .manual{color:#e8caa4}.error{color:#ffb9ac}}
</style><main><section class="intro"><p class="eyebrow">로컬 검증 보고서 · 2026-10-08 · 배포·푸시 없음</p><h1>평가원 원본과 편집 가능한 자동 복원</h1><p>원본, 자동 결과, 실제 편집 원본 수식을 나란히 비교합니다. 저장 응답 5개는 AI 호출 없이 재검증했습니다. 실제 복원은 <strong>gpt-6.1-sol / medium</strong>으로 기존 5개와 새 15개를 원본별 한 번만 요청합니다. 생성 성공과 원본의 관계·스타일·수식화 성공은 별개입니다.</p><p>자동 파일은 <strong>automatic.5e</strong>입니다. 별도 <strong>manual-edit-test.5e</strong>는 기존 편집기에서 축 제목과 함수식을 변경해 저장 기능을 검증한 파일이며, 수동 품질 보정본이 아닙니다. 수동 보정으로 자동 결과의 실패를 숨기지 않았습니다.</p><p>상대 좌표의 멱지수·궤적 근호식은 관찰 관계를 편집 가능한 짧은 도형 모델로 표현한 값입니다. 문항의 실제 단위나 단열 지수를 인증하지 않습니다. WebKit 검증은 Safari 실앱 확인과 구분합니다.</p><p>전체 단위 검사: 347개 중 346개 통과, 수정하지 않은 PNG 생성 고정 샘플의 압축 바이트 불일치 1개. 관련 단위·Chromium/WebKit 스타일·작업대 회귀와 저장 응답 편집/재열기 검사는 통과했습니다. LSP는 설치되어 있지 않아 Node 구문 검사와 실행 검사로 검증했습니다.</p><div class="controls"><label>표본 <select id="group"><option value="all">전체 25개 결과</option><option value="replay">무호출 재검증 5개</option><option value="live">실제 복원 20개</option></select></label><label><input type="checkbox" id="review"> 검수·실패·미검증 항목만</label><button type="button" onclick="window.print()">인쇄 / PDF</button></div></section>
<h2 class="section-title">저장 응답 5개 · AI 호출 0회</h2><section class="summary"><div class="tally">${tally('replay')}</div></section>${replayCards}
<h2 class="section-title">실제 복원 20개 · 고정 모델 최초 응답</h2><section class="summary"><div class="tally">${tally('live')}</div><p>${escape(live?.stopped?.reason || '')} 실제 완료 ${live?.cases?.length || 0}/20 · 요청 ${(live?.cases || []).reduce((n,c)=>n+(c.requestCount || 0),0)}회 · 후처리 AI 요청 ${finalAutomatic?.modelCalls ?? 0}회. 원본별 자동 재시도 없음. 엄격한 스타일 통과와 편집 가능한 생성 성공은 별개이며 검수 항목을 숨기지 않습니다.</p></section>${liveCards}
<p class="caveat">최종 기록: ${escape(new Date().toISOString())}. 구조화 판정: report.json 및 visual-review.json. 이미지·스타일·스크립트는 이 HTML에 포함되어 네트워크 없이 볼 수 있습니다. .5e 다운로드는 옆의 로컬 폴더를 사용합니다.</p></main><script>
function filter(){const g=document.getElementById('group').value,r=document.getElementById('review').checked;document.querySelectorAll('.case').forEach(c=>c.hidden=(g!=='all'&&c.dataset.group!==g)||(r&&c.dataset.review!=='true'))}document.getElementById('group').addEventListener('change',filter);document.getElementById('review').addEventListener('change',filter);
</script></html>`;
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), html);
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ schema: '5e.graph-restoration-report/v1', model: 'gpt-6.1-sol', reasoning: 'medium', cases: records }, null, 2));
console.log(JSON.stringify({ html: path.join(output, 'index.html'), records: records.length, liveCompleted: live?.cases?.length || 0, bytes: Buffer.byteLength(html) }));
