/** Retained real observations only. No model calls or edits to provider plans. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { summarizeAnalyticGraph } from '../js/graph/analytic-summary.js';
import { auditPhysicsGraphResult } from './physics-graph-result-audit.mjs';
const root = path.resolve(import.meta.dirname, '..');
if (!process.env.PHYSICS_GRAPH_EVIDENCE || !process.env.OUTPUT_DIR) throw Error('Evidence and output directories required');
const input = path.resolve(process.env.PHYSICS_GRAPH_EVIDENCE), output = path.resolve(process.env.OUTPUT_DIR);
const manifest = JSON.parse(fs.readFileSync(path.join(input, 'manifest.json')));
const batches = fs.readdirSync(input).map(name => path.join(input, name)).filter(dir => fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'results.json')));
const cases = new Map();
for (const dir of batches) {
  const batch = JSON.parse(fs.readFileSync(path.join(dir, 'results.json')));
  if (batch.schema !== '5e.physics-workbench-evaluation/v1') continue;
  assert.equal(batch.evaluationPass || 1, 1, 'Baseline must contain first responses only');
  assert.equal(batch.selection.model, 'gpt-6.1-sol'); assert.equal(batch.selection.effort, 'medium');
  for (const c of batch.cases) {
    if (!fs.existsSync(path.join(dir, c.id, 'verification.json'))) continue;
    assert(!cases.has(c.id), 'Duplicate first observation'); cases.set(c.id, { ...c, dir: path.join(dir, c.id) });
  }
}
const refined = new Map(), retestHistory = new Map();
if (process.env.PHYSICS_GRAPH_REFINED) {
  const refinedRoot = path.resolve(process.env.PHYSICS_GRAPH_REFINED);
  for (const name of fs.readdirSync(refinedRoot)) {
    const dir = path.join(refinedRoot, name), file = path.join(dir, 'results.json');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(file)) continue;
    const batch = JSON.parse(fs.readFileSync(file));
    assert.equal(batch.schema, '5e.physics-workbench-evaluation/v1');
    assert([2, 3].includes(batch.evaluationPass));
    assert.equal(batch.selection.model, manifest.model); assert.equal(batch.selection.effort, manifest.effort);
    for (const c of batch.cases) {
      if (!fs.existsSync(path.join(dir, c.id, 'verification.json'))) continue;
      assert(cases.has(c.id), 'Retest must have retained baseline');
      assert.equal(c.sourceSHA256, cases.get(c.id).sourceSHA256);
      const history = retestHistory.get(c.id) || [];
      assert(!history.some(r => r.evaluationPass === batch.evaluationPass), 'Duplicate retest pass');
      history.push({ ...c, evaluationPass: batch.evaluationPass, dir: path.join(dir, c.id) });
      retestHistory.set(c.id, history);
      const previous = refined.get(c.id);
      assert(!previous || previous.evaluationPass !== batch.evaluationPass, 'Duplicate retest pass');
      if (!previous || previous.evaluationPass < batch.evaluationPass) refined.set(c.id, { ...c, evaluationPass: batch.evaluationPass, dir: path.join(dir, c.id) });
    }
  }
}
fs.mkdirSync(output, { recursive: true });
const findingsPath = path.join(input, 'visual-review.json');
const findings = fs.existsSync(findingsPath) ? JSON.parse(fs.readFileSync(findingsPath)) : [];
const refinedReviewPath = path.join(input, 'refined-review.json');
const refinedFindings = fs.existsSync(refinedReviewPath) ? JSON.parse(fs.readFileSync(refinedReviewPath)) : [];
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const names = { usable: '사용 가능', 'needs-review': '조정 필요', failed: '복원 실패', blocked: '표현 제한으로 차단' };
const summary = { model: 'gpt-6.1-sol', effort: 'medium', expected: manifest.cases.length, completed: cases.size, nativeResults: 0, editingPasses: 0, requests: 0, manualCorrections: 0, automaticRetries: 0, formulaCount: 0, relationCount: 0, pointCount: 0, geometryCount: 0, retainedCurveCount: 0, failedFormulaCount: 0, auditedNativeResults: 0, refinedCases: [], cases: [] };
let html = '';
for (const c of manifest.cases) {
  const r = cases.get(c.id); if (!r) continue;
  const target = path.join(output, c.id); fs.mkdirSync(target, { recursive: true });
  for (const name of ['result-audit.json', 'anchor-review.json', 'source.png', 'native.png', 'native.svg', 'editable-graph.5e', 'plan.json', 'response.txt', 'verification.json', 'wipe.png', 'workbench.png', 'failure.png']) {
    if (fs.existsSync(path.join(r.dir, name))) fs.copyFileSync(path.join(r.dir, name), path.join(target, name));
  }
  const review = findings.find(x => x.id === c.id);
  const retest = refined.get(c.id), refinedReview = refinedFindings.find(x => x.id === c.id && x.evaluationPass === retest?.evaluationPass);
  const history = (retestHistory.get(c.id) || []).sort((a,b) => a.evaluationPass - b.evaluationPass);
  for (const retained of history) {
    const refinedTarget = path.join(target, 'round' + retained.evaluationPass); fs.mkdirSync(refinedTarget, { recursive: true });
    for (const name of ['result-audit.json', 'anchor-review.json', 'native.png', 'native.svg', 'editable-graph.5e', 'plan.json', 'response.txt', 'verification.json', 'workbench.png', 'failure.png']) {
      if (fs.existsSync(path.join(retained.dir, name))) fs.copyFileSync(path.join(retained.dir, name), path.join(refinedTarget, name));
    }
  }
  if (retest) summary.refinedCases.push({ ...retest, dir: undefined, visualReview: refinedReview || null });

  summary.retestHistory ||= []; summary.retestHistory.push(...history.map(r => ({...r,dir:undefined})));
  const result = { ...r, dir: undefined, visualReview: review || null }; summary.cases.push(result);
  summary.requests += r.requestCount; summary.nativeResults += Number(r.nativeResult); summary.editingPasses += Number(r.editingPass);
  const planFile = path.join(target, 'plan.json');
  const plan = fs.existsSync(planFile) ? JSON.parse(fs.readFileSync(planFile)) : null;
  const audit = r.resultAudit && plan ? {...r.resultAudit,...summarizeAnalyticGraph(plan)} : r.resultAudit || (plan && r.nativeResult ? auditPhysicsGraphResult(plan, { expectedAnalyticCurves: c.expectedAnalyticCurves }) : null);
  if (audit) {
    result.resultAudit = audit; summary.auditedNativeResults++;
    summary.formulaCount += audit.formulaCount; summary.relationCount += audit.relationCount;
    summary.pointCount += audit.pointCount; summary.geometryCount += audit.geometryCount || 0; summary.retainedCurveCount += audit.retainedCurveCount ?? audit.pointCount; summary.failedFormulaCount += audit.failedCount;
  }
  const badge = v => v === true ? '통과' : v === false ? '차이 있음' : '미측정';
  const auditHtml = audit ? `<details><summary>편집 가능한 식·잔여 점·스타일 검증</summary><pre>${escape(audit.lines.join('\n'))}</pre><p>함수 개수 기준: ${audit.expectedFormulaCountMet === null ? '기준 미지정' : audit.expectedFormulaCountMet ? '충족' : '미달'} · 이 판정은 함수 종류·물리 법칙의 정확성을 증명하지 않습니다.</p><p>글자 높이 설정 보존 ${badge(audit.style.labelHeightMappingPass)} · 수학 서체 포함 ${badge(audit.style.fontEmbedded)} · 축 화살촉 크기 ${badge(audit.style.axisArrowSizePass)} (허용 차이 ${audit.style.pixelTolerance}px). 글자 높이는 입력과 객체 설정의 대응 검사이며 원본 OCR·출력 잉크 높이의 자동 검사가 아닙니다. 측정할 수 없는 화살촉은 통과로 집계하지 않습니다.</p>${audit.style.axisArrows.map(a => `<p>${escape(a.axis)}축: 원본 ${a.sourceLengthPx}×${a.sourceWidthPx}px / 복원 ${a.renderedLengthPx ?? '미측정'}×${a.renderedWidthPx ?? '미측정'}px</p>`).join('')}</details>` : '<p>식·스타일 상세 검증 결과 없음</p>';
  const pb = plan?.source?.plotBox;
  const roi = pb ? { x: Math.max(0, Math.floor(pb.x - pb.w * .5)), y: Math.max(0, Math.floor(pb.y - pb.h * .15)), w: Math.min(plan.source.width, Math.ceil(pb.x + pb.w * 1.15)) - Math.max(0, Math.floor(pb.x - pb.w * .5)), h: Math.min(plan.source.height, Math.ceil(pb.y + pb.h * 1.26)) - Math.max(0, Math.floor(pb.y - pb.h * .15)) } : null;
  const image = (name, alt) => roi ? `<svg viewBox="${roi.x} ${roi.y} ${roi.w} ${roi.h}" role="img" aria-label="${escape(alt)}"><image href="${c.id}/${name}" width="${plan.source.width}" height="${plan.source.height}"/></svg>` : `<img src="${c.id}/${name}" alt="${escape(alt)}">`;
  const tokens = r.tokenUsage?.total;
  const anchorLink = fs.existsSync(path.join(target,'anchor-review.json')) ? ` · <a href="${c.id}/anchor-review.json">원본 잉크 진단</a> (좌표 수정·일치 인증 아님)` : '';
  html += `<article id="${c.id}"><h2>${escape(c.title)} · ${escape(c.referenceFeature)}</h2>${auditHtml}<p>첫 요청 1회 · ${escape(r.promptVersion || 'graph-observation-v10')} · ${(r.wallMs / 1000).toFixed(1)}초 · 입력 ${tokens?.inputTokens ?? '미집계'} / 출력 ${tokens?.outputTokens ?? '미집계'} 토큰 · 편집 ${r.editingPass ? '통과' : '미확인'} · 시각 ${escape(names[review?.verdict] || '검수 대기')}</p><div class="pictures${retest ? ' with-refined' : ''}"><section><h3>원본 그래프 영역</h3>${image('source.png', '원본')}</section><section><h3>첫 자동 복원 · 수동 보정 0회</h3>${r.nativeResult ? image('native.png', '자동 복원') : `<div class="blocked">${escape(review?.verdict === 'blocked' ? review.finding : r.statusText || r.error)}</div>`}</section>${retest ? `<section><h3>${refinedReview?.adopted === false ? '비채택 실험 결과' : '하네스 수정 후 재복원'} · ${retest.evaluationPass}차</h3>${retest.nativeResult ? image('round' + retest.evaluationPass + '/native.png', '재복원') : `<div class="blocked">${escape(retest.statusText || retest.error)}</div>`}</section>` : ''}</div><p>${escape(review?.finding || '')}</p><p><a href="${c.id}/source.png">원본 전체</a>${r.nativeResult ? ` · <a href="${c.id}/native.svg">SVG</a> · <a href="${c.id}/plan.json">관찰 데이터</a>` : ''}${r.editingPass ? ` · <a href="${c.id}/editable-graph.5e">편집 가능한 5E</a>` : ''} · <a href="${c.id}/verification.json">검증 기록</a>${anchorLink}</p>${retest ? `<p>${retest.evaluationPass}차 · ${escape(retest.promptVersion || '')}: ${(retest.wallMs / 1000).toFixed(1)}초 · 입력 ${retest.tokenUsage?.total?.inputTokens ?? '미집계'} / 출력 ${retest.tokenUsage?.total?.outputTokens ?? '미집계'} 토큰 · ${escape(names[refinedReview?.verdict] || '검수 대기')} · ${escape(refinedReview?.finding || '')}${retest.editingPass ? ` · <a href="${c.id}/round${retest.evaluationPass}/editable-graph.5e">재복원 5E</a>` : ''}</p>` : ''}${history.length ? `<p>보존한 재시험: ${history.map(r=>`<a href="${c.id}/round${r.evaluationPass}/verification.json">${r.evaluationPass}차 검증</a> · <a href="${c.id}/round${r.evaluationPass}/native.png">결과 이미지</a> · <a href="${c.id}/round${r.evaluationPass}/plan.json">관찰 데이터</a>`).join(' / ')}</p>` : ''}</article>`;
}
summary.totalInputTokens = summary.cases.reduce((n, r) => n + (r.tokenUsage?.total?.inputTokens || 0), 0);
summary.totalOutputTokens = summary.cases.reduce((n, r) => n + (r.tokenUsage?.total?.outputTokens || 0), 0);
summary.usable = findings.filter(r => r.verdict === 'usable').length;
summary.needsReview = findings.filter(r => r.verdict === 'needs-review').length;
summary.failed = findings.filter(r => r.verdict === 'failed').length;
summary.blocked = findings.filter(r => r.verdict === 'blocked').length;
summary.refinedUsable = summary.refinedCases.filter(r => r.visualReview?.verdict === 'usable').length;
fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(summary, null, 2));
const css = `body{font:16px -apple-system,BlinkMacSystemFont,sans-serif;max-width:1500px;margin:24px auto;padding:0 20px;background:#f4f5f7;color:#222}header,article{padding:24px;background:white;margin:0 0 20px;border:1px solid #ddd;border-radius:10px}h1{font-size:26px}h2{font-size:20px}h3{font-size:16px}.pictures{display:grid;grid-template-columns:1fr 1fr;gap:20px}.pictures.with-refined{grid-template-columns:repeat(3,1fr)}.pictures section{border:1px solid #eee;padding:12px}.pictures img,.pictures svg{width:100%;height:360px;object-fit:contain;display:block}.blocked{padding:50px 10px;white-space:pre-wrap;min-height:250px}p{line-height:1.65}a{color:#175daf}@media(max-width:800px){.pictures,.pictures.with-refined{grid-template-columns:1fr}}`;
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>물리 기출 그래프 ${summary.expected}개 복원 평가</title><style>${css}</style><header><h1>물리 기출 그래프 · Sol 6.1 / medium</h1><p>보존된 실제 응답의 보고서입니다. 이 페이지 생성 중 새 AI 요청은 실행하지 않습니다.</p><p>${summary.completed}/${summary.expected} 평가 기록 · 기록된 요청 ${summary.requests}회 · 수동 데이터 보정 0회 · 자동 재시도 0회</p><p>네이티브 결과 ${summary.nativeResults}/${summary.completed}, 편집·저장·재열기 ${summary.editingPasses}/${summary.completed}. 구조·편집 검증과 시각 일치 판정은 별도입니다. 두 그림은 같은 원본 좌표에서 그래프 영역을 잘라 비교했습니다. 원본 전체와 최초 응답도 보존했습니다.</p><p>식 ${summary.formulaCount}개 (기준점으로 계수 계산 ${summary.relationCount}개) · 기본 도형 ${summary.geometryCount}개 · 잔여 점 경로 ${summary.retainedCurveCount}개 · 함수 복원 미완료 ${summary.failedFormulaCount}개. 네이티브 결과 중 상세 집계 ${summary.auditedNativeResults}개. 기본 도형은 정상 재현으로 집계하며, 식 복원이 필요한 잔여 곡선과 구별합니다. 가짜 굴곡 수는 미측정입니다.</p><p>첫 응답 시각 검수: 사용 가능 ${summary.usable}, 조정 필요 ${summary.needsReview}, 복원 실패 ${summary.failed}, 표현 제한 ${summary.blocked}. 검수자는 실행 에이전트이며 독립 평가 점수나 픽셀 완전 일치가 아닙니다.</p><p>${summary.refinedCases.length ? `하네스 수정 후 ${summary.refinedCases.length}개를 별도로 재복원했습니다. 사용 가능 ${summary.refinedUsable}/${summary.refinedCases.length}. 이 재시험은 첫 성공률에 합산하지 않습니다.</p><p>` : ''}실제 제품 작업대와 인증된 로컬 App Server를 평가용 연결기로 연결했습니다. 설치 앱 IPC와 배포 웹 인증은 이 평가에서 검증하지 않았습니다.</p><p><a href="results.json">전체 기록·토큰</a> · <a href="overview.png">비교 이미지</a></p></header>${html}</html>`);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8795/preview/';
  const url = new URL('/' + path.relative(root, output).split(path.sep).join('/') + '/index.html', base).href;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('article image').evaluateAll(images => Promise.all(images.map(el => new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = el.getAttribute('href'); }))));
  for (const r of summary.cases) await page.locator('#' + r.id).screenshot({ path: path.join(output, r.id + '-comparison.png') });
  await page.addStyleTag({ content: 'article{padding:14px;margin-bottom:10px}article h2{font-size:18px;margin:4px 0}article p{font-size:13px;margin:5px 0}.pictures img,.pictures svg{height:220px}.pictures.with-refined{grid-template-columns:repeat(3,1fr)}.pictures section{padding:8px}.pictures h3{margin:3px 0}' });
  await page.screenshot({ path: path.join(output, 'overview.png'), fullPage: true });
  console.log(JSON.stringify({ url, completed: summary.completed, native: summary.nativeResults, editable: summary.editingPasses, requests: summary.requests }));
} finally { await browser.close(); }
