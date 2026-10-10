/** Local, evidence-backed report. Reference inventories are never model input. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
import { summarizeAnalyticGraph } from '../js/graph/analytic-summary.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.EVIDENCE_DIR || path.join(root, 'outputs/graph-stability-20261007'));
const read = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const manifest = read(path.join(output, 'manifest.json'));
assert(manifest?.cases?.length === 20);
const references = read(path.join(output, 'sources/reference-inventory.json'));
const initialDirs = ['first-textbook', 'first-physics', ...(process.env.GRAPH_INITIAL_DIRS || '').split(',').filter(Boolean)];
const retryDirs = (process.env.GRAPH_RETRY_DIRS || '').split(',').filter(Boolean);
const renderDirs = (process.env.GRAPH_RENDER_DIRS || '').split(',').filter(Boolean);
const reports = [...initialDirs, ...retryDirs, ...renderDirs].map(dir => ({ dir, data: read(path.join(output, dir, 'results.json')) })).filter(r => r.data);
const manual = ['review-textbook.json', 'review-physics.json', 'review-final.json'].map(f => read(path.join(output, f))).filter(Boolean).flatMap(r => Array.isArray(r) ? r : r.cases || []);
const escape = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const href = file => path.relative(output, file).split(path.sep).map(encodeURIComponent).join('/');
const existingLink = (file, label) => fs.existsSync(file) ? `<a href="${href(file)}">${escape(label)}</a>` : '';
const img = (dir, id, label) => {
  const file = path.join(output, dir, id, 'native.png');
  return fs.existsSync(file) ? `<img src="${href(file)}" alt="${escape(label)}" loading="lazy">` : '<div class="absent">편집 그래프 결과 없음</div>';
};
const referenceFor = c => {
  const source = references.cases.find(r => r.caseId === c.id);
  const i = source?.inventory || {}, requiredElements = [];
  const add = (role, minCount = 1, extra = {}) => requiredElements.push({ role, minCount, ...extra });
  if (i.axes) add('axis', i.axes);
  if (i.series) add('series', i.series);
  if (i.boxBorder) add('frame');
  if (i.grid) add('grid');
  if (i.axisArrows === true) { add('arrow', 1, { axis: 'x' }); add('arrow', 1, { axis: 'y' }); }
  if (i.filledRegions) add('region', i.filledRegions);
  if (typeof i.dashedGuides === 'number') add('guide', i.dashedGuides);
  return { source, requiredElements };
};
const cases = manifest.cases.map(c => {
  const initialAttempts = reports.filter(r => initialDirs.includes(r.dir)).flatMap(r => r.data.cases.map(record => ({ dir: r.dir, record }))).filter(r => r.record.id === c.id);
  const initial = initialAttempts.find(r => r.record.requestCount > 0) || initialAttempts[0];
  const latest = reports.flatMap(r => r.data.cases.map(record => ({ dir: r.dir, record }))).filter(r => r.record.id === c.id).at(-1) || initial;
  const plan = latest && read(path.join(output, latest.dir, c.id, 'plan.json'));
  const reference = referenceFor(c);
  const audit = plan ? auditGraphReconstructionQuality(plan, { reference: { requiredElements: reference.requiredElements } }) : null;
  const reviews = manual.filter(r => (r.id || r.caseId) === c.id);
  const review = reviews.at(-1) || null;
  // A reviewer can bind an assessment to a specific result directory.
  const validReview = review && (!review.resultDir || review.resultDir === latest?.dir) ? review : null;
  return { id: c.id, title: c.title, category: c.category, sourceSHA256: c.sourceSHA256, initial, initialAttempts, latest,
    formulaSummary: plan ? summarizeAnalyticGraph(plan) : null, sourceInventory: reference.source,
    relationshipAudit: audit, manualReview: validReview,
    visualStatus: latest?.record.editingPass ? validReview?.status || validReview?.verdict || 'pending' : initial ? 'fail' : 'not-run' };
});
const calls = reports.reduce((n, r) => n + r.data.actualModelCalls, 0);
assert(calls <= 25, 'Actual evaluation request limit exceeded');
const counts = predicate => cases.filter(predicate).length;
const representations = cases.reduce((sum,c) => {
  const s = c.formulaSummary;
  if(s) { sum.expressions += s.formulaCount; sum.basicGeometry += s.geometryCount; sum.retainedCurves += s.retainedCurveCount; sum.formulaIncomplete += s.failedCount; }
  return sum;
}, { expressions:0, basicGeometry:0, retainedCurves:0, formulaIncomplete:0 });
const report = { schema: '5e.graph-stability-report/v1', updatedAt: new Date().toISOString(), selection: { model: manifest.model, effort: manifest.effort },
  actualModelCalls: calls, initialModelCalls: reports.filter(r => initialDirs.includes(r.dir)).reduce((n,r) => n + r.data.actualModelCalls, 0),
  retryModelCalls: reports.filter(r => retryDirs.includes(r.dir)).reduce((n,r) => n + r.data.actualModelCalls, 0), automaticRetries: 0, manualPlanCorrections: 0,
  initial: { attempted: counts(c => c.initial?.record.requestCount > 0), nativeResults: counts(c => c.initial?.record.nativeResult), editingPass: counts(c => c.initial?.record.editingPass) },
  final: { nativeResults: counts(c => c.latest?.record.nativeResult), editingPass: counts(c => c.latest?.record.editingPass), visualPass: counts(c => c.visualStatus === 'pass'), visualReview: counts(c => c.visualStatus === 'review'), visualFail: counts(c => c.visualStatus === 'fail'), pending: counts(c => c.visualStatus === 'pending'), notRun: counts(c => c.visualStatus === 'not-run') },
  representations, target: { visualPassRequired: 18, total: 20, achieved:counts(c => c.visualStatus === 'pass') >= 18 }, sources: { textbook: '천재교과서 중학교 과학 2 (임성숙), 2022 개정', physics: '2023년 6월·2024년 9월 고2 전국연합학력평가 물리학Ⅰ', wavePanelConcentration: '파동 5개는 같은 교과서 페이지의 서로 다른 패널' },
  limitations: ['관계 자동 검사는 명시된 계획의 관계와 일부 필수 요소만 검사한다.', '전체 재현 판정은 원본과 결과 이미지를 비교한 검수에 따른다.', '로컬 App Server 연결을 사용했으며 웹 인증과 데스크톱 IPC의 완전한 종단 검증을 대체하지 않는다.'], cases };
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2));
const labels = { pass: '핵심 요소·관계 유지', review: '수정·검토 필요', fail: '재현 미완료', pending: '이미지 검수 대기', 'not-run': '미실행' };
const articles = cases.map((c, index) => {
  const source = manifest.cases[index], latest = c.latest, initial = c.initial;
  const notes = [c.manualReview?.issues, c.manualReview?.observations, c.manualReview?.notes, c.manualReview?.visualEvidence, c.manualReview?.editingIssues].filter(Boolean).flatMap(n => Array.isArray(n) ? n : [n]);
  const noteList = Array.isArray(notes) ? notes : [notes];
  const firstDir = initial?.dir || initialDirs[source.category === 'textbook' ? 0 : 1];
  const lastDir = latest?.dir || firstDir;
  const same = firstDir === lastDir;
  const formulas = c.formulaSummary?.lines || ['생성된 편집 그래프 없음'];
  const badges = `<span class="badge ${c.visualStatus}">${labels[c.visualStatus] || escape(c.visualStatus)}</span>`;
  const dirs = [...new Set([firstDir, lastDir])];
  const links = dirs.map(dir => [existingLink(path.join(output, dir, c.id, 'editable-graph.5e'), `${dir === firstDir ? '첫 결과' : '추가 결과'} .5e`), existingLink(path.join(output, dir, c.id, 'plan.json'), '계획·식'), existingLink(path.join(output, dir, c.id, 'verification.json'), '실행 검증'), existingLink(path.join(output, dir, c.id, 'native.svg'), 'SVG')].filter(Boolean).join(' · ')).join(' | ');
  const currentLabel = same ? '현재 결과 · 최초와 동일' : renderDirs.includes(lastDir) ? '렌더 수정 · AI 재호출 없음' : '추가 실행 결과';
  return `<article id="${c.id}" data-category="${c.category}" data-status="${c.visualStatus}"><h2>${index + 1}. ${escape(c.title)} ${badges}</h2><div class="images"><figure><figcaption>원본</figcaption><a href="${href(source.sourcePath)}"><img src="${href(source.sourcePath)}" alt="${escape(c.title)} 원본" loading="lazy"></a></figure><figure><figcaption>최초 자동 복원</figcaption>${img(firstDir,c.id,c.title+' 최초 결과')}</figure><figure><figcaption>${currentLabel}</figcaption>${img(lastDir,c.id,c.title+' 현재 결과')}</figure></div><p class="notes">${noteList.map(v => escape(typeof v === 'string' ? v : JSON.stringify(v))).join('<br>') || '원본·결과 이미지 검수 기록이 아직 없습니다.'}</p>${latest?.record.error ? `<p class="error">${escape(latest.record.error)}</p>` : ''}<details><summary>식과 기존 그래프 도구의 편집 표현</summary><pre>${escape(formulas.join('\n'))}</pre></details><details><summary>원본 필수 관계와 자동 검사</summary><ul>${(c.sourceInventory?.relativeRelationships || []).map(t => `<li>${escape(t)}</li>`).join('')}</ul><pre>${escape(JSON.stringify({ status:c.relationshipAudit?.status, issues:c.relationshipAudit?.issues, inventory:c.sourceInventory?.inventory }, null, 2))}</pre></details><p>${links}</p><p class="small">${escape(source.id)} · <a href="${escape(source.sourceProvenance.pageURL || source.sourceProvenance.primarySourceURL)}">공식 출처</a> · ${existingLink(source.sourceProvenance.originalPDFPath,'원본 PDF')} · SHA256 ${source.sourceSHA256.slice(0,16)}…</p></article>`;
}).join('\n');
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>그래프 복원 안정화 · 새 원본 20개</title><style>body{margin:0;background:#f5f6f8;color:#172033;font-family:system-ui,-apple-system,sans-serif}main{max-width:1700px;margin:auto;padding:24px}h1{font-size:27px}h2{font-size:19px;line-height:1.5}p{line-height:1.6}a{color:#2255ad}article{background:white;border:1px solid #d9dee7;border-radius:12px;padding:20px;margin:22px 0}.images{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:10px}.images img,.absent{width:100%;height:300px;object-fit:contain;border:1px solid #dce1e8;box-sizing:border-box;background:#fff}.absent{display:grid;place-items:center;color:#b43f38}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6fa;padding:14px;border-radius:8px;font-size:13px;line-height:1.7}summary{cursor:pointer;padding:9px 0}.badge{display:inline-block;border-radius:30px;padding:3px 9px;font-size:12px;background:#e6eaf0}.pass{background:#e1f3e7;color:#1d6032}.review,.pending{background:#fff0cc;color:#795916}.fail{background:#ffe3e0;color:#903429}.small{font-size:12px;color:#667084}.notes{font-size:14px}.error{color:#a02f25}nav{position:sticky;top:0;background:#f5f6f8ed;padding:12px 0;z-index:1}button{padding:9px 14px;border:1px solid #bbc5d3;border-radius:7px;background:white;margin-right:6px;cursor:pointer}button[aria-pressed=true]{background:#253c61;color:white}article[hidden]{display:none}.stats{background:#fff;padding:18px;border-radius:10px;border:1px solid #d9dee7}@media(max-width:850px){.images{grid-template-columns:1fr}.images img{height:320px}main{padding:14px}}</style><main><h1>그래프 복원 안정화 · 새 원본 20개</h1><p>중2 과학 교과서 10개 + 고2 전국연합학력평가 물리학Ⅰ 10개<br>Sol 6.1 / medium · 최초 응답 기준 · 추가 실행 ${report.retryModelCalls}회 · 자동 재전송 0회</p><div class="stats">실제 요청 ${calls}/25 · 최초 편집·저장·재개방 ${report.initial.editingPass}/20 · 현재 ${report.final.editingPass}/20<br>핵심 요소·관계 유지 ${report.final.visualPass} · 검토 필요 ${report.final.visualReview} · 미완료 ${report.final.visualFail} · 검수 대기 ${report.final.pending} · 미실행 ${report.final.notRun}<br>계열 표현: 식 ${representations.expressions} · 기본 도형 ${representations.basicGeometry} · 곡선 점 경로 ${representations.retainedCurves}<br>재현 목표 18/20: ${report.target.achieved ? '달성' : '미달성'}<br><a href="summary.json">전체 검수 JSON</a> · <a href="manifest.json">원본 목록·출처</a></div><p class="small">직선·꺾은선·막대는 정상적인 편집 표현입니다. 함수 근사는 확정 물리 법칙과 구분합니다. 파동 5개는 같은 교과서 페이지의 서로 다른 패널입니다. 원본 필수 관계 목록은 검수에만 사용했습니다.</p><nav><button data-filter="all" aria-pressed="true">전체 20개</button><button data-filter="textbook" aria-pressed="false">중2 교과서</button><button data-filter="physics" aria-pressed="false">물리 기출</button><button data-filter="problems" aria-pressed="false">검토·미완료</button></nav>${articles}<p class="small">${escape(report.updatedAt)}</p></main><script>document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('article').forEach(a=>a.hidden=b.dataset.filter==='problems'?a.dataset.status==='pass':b.dataset.filter!=='all'&&a.dataset.category!==b.dataset.filter)});</script></html>`;
fs.writeFileSync(path.join(output, 'images.html'), html);
console.log(JSON.stringify({ output, actualModelCalls:calls, initial:report.initial, final:report.final }));
