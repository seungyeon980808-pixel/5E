/** Assemble frozen first-response evidence. No provider requests or plan edits. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { summarizeAnalyticGraph } from '../js/graph/analytic-summary.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.SCIENCE_GRAPH_OUTPUT || path.join(root, 'outputs/science-graphs-20261007'));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read(path.join(output, 'manifest.json'));
assert.equal(manifest.expectedCount, 35);
assert.equal(new Set(manifest.cases.map(c => c.id)).size, 35);
const names = { textbook: '교과서', physics: '물리 기출', chemistry: '화학 기출', biology: '생명과학 기출', earth: '지구과학 기출' };
const records = new Map();
for (const batchName of manifest.batches || ['probe', 'physics-run', 'cbe-run', 'textbook-run']) {
  const dir = path.join(output, batchName);
  if (!fs.existsSync(path.join(dir, 'results.json'))) continue;
  const batch = read(path.join(dir, 'results.json'));
  assert.equal(batch.selection.model, manifest.model);
  assert.equal(batch.selection.effort, manifest.effort);
  assert.equal(batch.promptVersion, manifest.frozenPromptVersion);
  assert.equal(batch.manualPlanCorrections, 0);
  assert.equal(batch.automaticRetries, 0);
  for (const c of batch.cases) {
    if (!fs.existsSync(path.join(dir, c.id, 'verification.json'))) continue;
    assert(!records.has(c.id), 'A repeated observation cannot be counted as a first response');
    assert(c.requestCount <= 1);
    records.set(c.id, { ...c, evidenceDir: path.join(dir, c.id), batchName });
  }
}
const reviewPath = path.join(output, 'visual-review.json');
const reviews = fs.existsSync(reviewPath) ? read(reviewPath) : [];
const formulaEditingPath = path.join(output, 'formula-editing.json');
const formulaEditing = fs.existsSync(formulaEditingPath) ? read(formulaEditingPath) : null;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows = [];
const groups = Object.fromEntries(Object.entries(names).map(([key, title]) => [key, { title, expected: manifest.categoryCounts[key], completed: 0, native: 0, editing: 0, formulaGraphs: 0, formulaCount: 0, retainedCurveGraphs: 0, geometryOnlyGraphs: 0, notProduced: 0 }]));
let articles = '';
for (const c of manifest.cases) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(c.sourcePath)).digest('hex'), c.sourceSHA256);
  const r = records.get(c.id);
  if (r) assert.equal(r.sourceSHA256, c.sourceSHA256);
  const target = path.join(output, 'cases', c.id);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(c.sourcePath, path.join(target, 'source.png'));
  for (const name of ['native.png', 'native.svg', 'editable-graph.5e', 'plan.json', 'response.txt', 'verification.json', 'result-audit.json', 'anchor-review.json', 'failure.png', 'wipe.png', 'workbench.png']) {
    const source = r && path.join(r.evidenceDir, name);
    if (source && fs.existsSync(source)) fs.copyFileSync(source, path.join(target, name));
  }
  const plan = r?.nativeResult && fs.existsSync(path.join(target, 'plan.json')) ? read(path.join(target, 'plan.json')) : null;
  const analytic = plan ? summarizeAnalyticGraph(plan) : null;
  const review = reviews.find(v => v.id === c.id) || null;
  const auxiliarySeriesIds = review?.auxiliarySeriesIds || [];
  const auxiliaryCurveCount = plan?.series?.filter(s => s.kind === 'points' && auxiliarySeriesIds.includes(s.id) && s.curveStyle === 'smooth').length || 0;
  const scatterCount = plan?.series?.filter(s => s.kind === 'points' && s.lineVisible === false).length || 0;
  const retainedCurveCount = analytic ? Math.max(0, analytic.retainedCurveCount - scatterCount - auxiliaryCurveCount) : null;
  const formulas = plan?.series?.filter(s => s.kind === 'expression').map(s => ({ id: s.id, expression: s.expression, domain: s.domain, coefficientSource: s.approximation?.coefficientSource || 'provider expression', anchorDeviation: s.approximation?.anchorDeviation ?? null, observationDeviation: s.approximation?.maxDeviation ?? null })) || [];
  const representation = !r ? '실행 대기' : !plan ? '복원본 미생성' : retainedCurveCount ? '곡선 점 경로가 남음' : formulas.length ? '함수식으로 복원' : analytic.geometryCount || scatterCount ? '기본 도형·산점도로 복원' : '표현 검토 필요';
  const editChecks = formulaEditing?.cases.filter(e => e.id === c.id) || [];
  const formulaEditStatus = !formulas.length ? '대상 없음' : editChecks.length === 2 && editChecks.every(e => e.pass) ? 'Chromium·WebKit 통과' : editChecks.some(e => e.error) ? '수정 적용 실패' : '미검증';
  const result = { id: c.id, title: c.title, category: c.category, referenceFeature: c.referenceFeature, sourceSHA256: c.sourceSHA256, sourceProvenance: c.sourceProvenance, priorSourceHashFound: c.priorSourceHashFound, completed: Boolean(r), nativeResult: Boolean(r?.nativeResult), editingPass: Boolean(r?.editingPass), representation, analytic, scatterCount, retainedCurveCount, auxiliarySeriesIds, auxiliaryCurveCount, formulas, formulaEditStatus, formulaEditChecks: editChecks, visualReview: review, error: r?.error || null, statusText: r?.statusText || null, requestCount: r?.requestCount || 0, tokenUsage: r?.tokenUsage || null, checks: r?.checks || [], batchName: r?.batchName || null };
  rows.push(result);
  const g = groups[c.category];
  g.completed += Number(Boolean(r)); g.native += Number(Boolean(plan)); g.editing += Number(Boolean(r?.editingPass));
  g.formulaGraphs += Number(formulas.length > 0); g.formulaCount += formulas.length;
  g.retainedCurveGraphs += Number(retainedCurveCount > 0);
  g.geometryOnlyGraphs += Number(Boolean(plan) && !formulas.length && retainedCurveCount === 0);
  g.notProduced += Number(Boolean(r) && !plan);
  const pb = plan?.source?.plotBox;
  const roi = pb ? { x: Math.max(0, pb.x - pb.w * .5), y: Math.max(0, pb.y - pb.h * .18), right: Math.min(plan.source.width, pb.x + pb.w * 1.28), bottom: Math.min(plan.source.height, pb.y + pb.h * 1.4) } : null;
  const href = name => `cases/${c.id}/${name}`;
  const picture = (name, label) => roi ? `<svg viewBox="${roi.x} ${roi.y} ${roi.right-roi.x} ${roi.bottom-roi.y}" role="img" aria-label="${esc(label)}"><image href="${href(name)}" width="${plan.source.width}" height="${plan.source.height}"/></svg>` : `<img loading="lazy" src="${href(name)}" alt="${esc(label)}">`;
  const provenance = c.sourceProvenance;
  const sourceLink = provenance?.pageURL ? `<a href="${esc(provenance.pageURL)}">${esc(provenance.book || '교과서')} 원문 · ${provenance.printedPage ? `${esc(provenance.printedPage)}쪽 · ` : ''}그림 ${esc(provenance.figure)}</a>` : `${esc(c.title)} · 로컬 기출 라이브러리 원본`;
  const pointDetails = plan?.series?.filter(s => s.kind === 'points').map(s => `${s.id}: ${s.points?.length || 0}점 · ${s.lineVisible === false ? '산점도' : s.analyticFitFailure || '도형 또는 경로 유지'}`).join('\n') || '';
  articles += `<article id="${c.id}" data-category="${c.category}"><h2>${esc(c.title)}</h2><p class="tag">${esc(representation)} · 편집·저장·재열기 ${r?.editingPass ? '통과' : '미확인'}</p><p>${esc(c.referenceFeature)} · ${sourceLink}</p><div class="comparison"><section><h3>원본 그래프</h3>${picture('source.png','원본')}</section><section><h3>첫 자동 변환본 · 수동 보정 0회</h3>${plan ? picture('native.png','자동 복원') : `<p class="error">${esc(r?.error || r?.statusText || '실행 대기')}</p>`}</section><section class="formula"><h3>함수식·객체 유형</h3><p>식 ${formulas.length}개 · 기본 도형 ${analytic?.geometryCount ?? '미확인'}개 · 산점도 ${scatterCount}개 · 잔여 곡선 ${retainedCurveCount ?? '미확인'}개${auxiliaryCurveCount ? ` · 보조 안내 경로 ${auxiliaryCurveCount}개 (함수화 대상 제외)` : ''}</p><p>② 함수 입력 수정: ${esc(formulaEditStatus)}</p><pre>${esc(formulas.map(f => `${f.id}: ${f.expression}\n  계수 근거: ${f.coefficientSource}\n  정의역: ${JSON.stringify(f.domain || null)}`).join('\n\n') || (plan ? '기본 도형 또는 점 경로입니다.' : '변환본이 없어 함수화 여부를 판단할 수 없습니다.'))}</pre>${review ? `<p class="review">시각 검수: ${esc(review.verdict)} · ${esc(review.finding)}</p>` : '<p>시각 일치 검수 대기</p>'}</section></div><details><summary>근거·제한·원시 응답</summary><pre>${esc(analytic?.lines.join('\n') || r?.error || '실행 대기')}</pre><pre>${esc(pointDetails)}</pre><p>${esc(c.sourceCaveat || '')}</p><p>원시 엔진 분류에는 보조 경로가 포함될 수 있습니다. 원본 시각 검수에서 확인한 안내 화살표·중괄호는 상단의 잔여 데이터 곡선 집계에서 제외했습니다. 관찰 선과 식의 오차는 AI가 추출한 선 기준이며 원본 픽셀 일치 점수가 아닙니다. 식이 존재한다는 사실만으로 물리 법칙이 확정된 것은 아닙니다.</p><p><a href="${href('source.png')}">원본 전체</a>${plan ? ` · <a href="${href('native.svg')}">복원 SVG</a> · <a href="${href('plan.json')}">관찰·함수 데이터</a>` : ''}${r?.editingPass ? ` · <a href="${href('editable-graph.5e')}">편집 가능한 5E</a>` : ''}${r ? ` · <a href="${href('response.txt')}">첫 AI 응답</a> · <a href="${href('verification.json')}">편집 검증</a>` : ''}</p></details></article>`;
}
const total = Object.values(groups).reduce((t, g) => Object.fromEntries(Object.keys(t).map(k => [k, t[k] + (g[k] || 0)])), { expected: 0, completed: 0, native: 0, editing: 0, formulaGraphs: 0, formulaCount: 0, retainedCurveGraphs: 0, geometryOnlyGraphs: 0, notProduced: 0 });
const summary = { schema: '5e.science-graph-report/v1', generatedAt: new Date().toISOString(), model: manifest.model, effort: manifest.effort, promptVersion: manifest.frozenPromptVersion, manualPlanCorrections: 0, automaticRetries: 0, requests: rows.reduce((n,r) => n + r.requestCount, 0), groups, total, formulaEditing, tokenUsage: { input: rows.reduce((n,r) => n + (r.tokenUsage?.total?.inputTokens || 0),0), output: rows.reduce((n,r) => n + (r.tokenUsage?.total?.outputTokens || 0),0) }, evaluationLimits: ['First real Sol responses through authenticated local App Server and product workbench', 'No manual plan corrections or model substitutions', 'Main batch: labels, cancel, undo/redo, no-op, save and reopen; separate isolated first-plan replay checks all generated formulas in both browser engines', 'Function presence is not a proof of physical law', 'Source-pixel fidelity is reviewed separately; no automated perfect-match score', 'Visually identified auxiliary arrows/braces are excluded from data-curve conversion metrics without modifying plans'], cases: rows };
fs.writeFileSync(path.join(output,'summary.json'), JSON.stringify(summary,null,2));
const tableRow = (label,g) => `<tr><th>${esc(label)}</th><td>${g.completed}/${g.expected}</td><td>${g.native}</td><td>${g.editing}</td><td>${g.formulaGraphs}</td><td>${g.geometryOnlyGraphs}</td><td>${g.retainedCurveGraphs}</td><td>${g.notProduced}</td></tr>`;
const table = `<table><thead><tr><th>분류</th><th>실행</th><th>복원 생성</th><th>편집 검증</th><th>식 포함</th><th>도형·산점도만</th><th>잔여 곡선 있음</th><th>미생성</th></tr></thead><tbody>${Object.values(groups).map(g=>tableRow(g.title,g)).join('')}${tableRow('전체',total)}</tbody></table>`;
const css = `*{box-sizing:border-box}body{margin:0;padding:28px;background:#f3f4f6;color:#17212b;font:15px/1.6 -apple-system,BlinkMacSystemFont,sans-serif}header,article{max-width:1640px;margin:0 auto 24px;background:white;border:1px solid #d9dee4;border-radius:10px;padding:24px}h1{font-size:26px;margin:0 0 10px}h2{font-size:20px;margin:0}h3{font-size:15px;margin:0 0 10px}.tag{display:inline-block;background:#eef3fa;padding:4px 10px;border-radius:5px}.comparison{display:grid;grid-template-columns:1fr 1fr .9fr;gap:16px}.comparison section{min-width:0;border:1px solid #e4e7ec;padding:12px}.comparison img,.comparison svg{width:100%;height:330px;display:block;object-fit:contain;background:white}.formula pre{font:13px/1.6 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}.error{min-height:260px;color:#a23828;display:flex;align-items:center}a{color:#215bb6}table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border-bottom:1px solid #dce1e7;text-align:left;padding:8px}select{font:inherit;padding:8px;min-width:180px}.review{background:#fff7e6;padding:10px}details{margin-top:14px}.hidden{display:none}@media(max-width:1000px){.comparison{grid-template-columns:1fr 1fr}.formula{grid-column:1/-1}}@media(max-width:650px){body{padding:10px}header,article{padding:15px}.comparison{grid-template-columns:1fr}.formula{grid-column:auto}table{font-size:11px}th,td{padding:4px}}`;
fs.writeFileSync(path.join(output,'index.html'),`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>35개 과학 그래프 자동 복원 비교</title><style>${css}</style></head><body><header><h1>교과서 10개 · 물리 10개 · 화학·생명·지구 각 5개</h1><p>Sol 6.1 / medium · ${esc(manifest.frozenPromptVersion)} · 결과에 포함된 최초 요청 ${summary.requests}회${manifest.newRequests != null ? ` (이번 실행 ${manifest.newRequests}회 · 기존 기출 ${manifest.reusedExamCount}개 유지)` : ''} · 자동 재시도 0회 · 수동 데이터 보정 0회</p><p>각 원본은 이전 제출 이미지와 SHA256이 겹치지 않습니다. ${esc(manifest.textbookDescription || '교과서는 OpenStax Physics의 실제 그림 10개를 사용했으며, 국문 교과서 검증을 대신하지는 않습니다.')}</p>${table}<p>“식 포함”과 “잔여 곡선 있음”은 중복될 수 있습니다. 직선·꺾은선·막대·산점도는 정상 객체 유형이며 함수 변환 실패로 집계하지 않습니다. 복원 생성·편집 통과와 시각·물리적 정확성은 별개입니다.</p><p>실제 작업대에서는 라벨 수정, 취소, 실행 취소·재실행, 5E 저장·재열기를 검사했습니다. 추가로 생성된 식 전체를 기존 ② 함수 입력칸에서 수정하고 재샘플링·저장·재열기를 Chromium과 WebKit에서 검사했습니다. 각 카드에 통과·실패를 표시하며 원본 변환 결과는 바꾸지 않았습니다. 실측 자료는 근거 없이 물리 함수라고 확정하지 않습니다.</p><p>교과서 그림 출처: ${esc(manifest.textbookAttribution || 'OpenStax, Rice University')}. 각 카드의 원문 링크에서 원 저작자와 이용 조건을 확인할 수 있습니다. 원본은 해상도와 픽셀을 유지해 PNG로 제출했습니다.</p><p><a href="summary.json">전체 집계·토큰·결과 JSON</a> · <a href="manifest.json">35개 원본·출처·해시</a> · <a href="formula-editing.json">식 수정 검증</a></p><label>분류 <select id="filter"><option value="all">전체 35개</option>${Object.entries(names).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label></header>${articles}<script>document.getElementById('filter').addEventListener('change',e=>{for(const a of document.querySelectorAll('article'))a.classList.toggle('hidden',e.target.value!=='all'&&a.dataset.category!==e.target.value)})</script></body></html>`);
console.log(JSON.stringify({ ...total, requests: summary.requests, output },null,2));
