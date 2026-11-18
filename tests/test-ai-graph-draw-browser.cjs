// 그림으로 만드는 그래프 엔진(js/ai-graph) 브라우저 검사: 실제 5E 화면(렌더러) 안 숨은 판에서 고정 설계를 그린다. AI 호출 0.
// 확인: 글자 겹침 0(원래 겹침이 있던 어려운 설계는 원본보다 늘지 않음)·글자가 화살촉에 닿지 않음, 축·눈금·곡선 이름이 SVG에 있음,
// PNG가 만들어짐, 판이 화면에 남지 않음, KaTeX 글꼴 이름이 MathLive(KaTeX_*)와 섞이지 않음, 가짜 AI로 makeGraph 전 과정.
// EVIDENCE_DIR이 있으면 엔진마다 PNG·SVG·report.json을 남긴다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const V = '?v=1.7.0-four-session-integration';
const FIX = path.join(__dirname, 'fixtures/ai-graph');
const fixtures = fs.readdirSync(FIX).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')) }));
// E1 smoke: 원본 page.html에서 세로축 이름 「속도(m/s)」 끝이 화살촉에 닿았다 → 같은 모양을 넣어 확인
fixtures.push({ name: 'axis-unit-arrow', subject: '물리학Ⅰ', request: '', keyValues: '', originalCollisions: { n: 0, list: [] },
  plan: { xMin: 0, xMax: 4, yMin: 0, yMax: 6, labelX: '시간(s)', labelY: '속도(m/s)', xTicks: [{ value: 2, label: '2' }, { value: 3, label: '3' }], yTicks: [{ value: 6, label: '6' }],
    series: [{ expr: '6-2*x', domain: [0, 3], label: 'A' }], marks: [], guides: [{ x: 2, y: 2 }] } });
const out = process.env.EVIDENCE_DIR;

h.withServer(async (origin) => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0');
      await h.ready(page);
      const result = await page.evaluate(async ({ fixtures, V }) => {
        const before = document.body.innerHTML.length;
        const { prepare } = await import('/js/ai-graph/verify.js' + V);
        const { drawGraph } = await import('/js/ai-graph/draw.js' + V);
        const { makeGraph, graphPlanMeta } = await import('/js/ai-graph/index.js' + V);
        const rows = [];
        for (const f of fixtures) {
          const prepared = prepare(f.plan, f.drawKeyValues ?? f.keyValues);
          const r = await drawGraph(prepared);
          const doc = new DOMParser().parseFromString(r.svg, 'image/svg+xml');
          const texts = (sel) => [...doc.querySelectorAll(sel)].map((g) => g.getAttribute('data-label'));
          const img = new Image(); img.src = r.png; await img.decode();
          rows.push({
            name: f.name, original: f.originalCollisions?.n ?? null, collisions: r.collisions, parts: r.parts, size: r.size, katex: r.katex, warnings: r.warnings,
            svgOk: !doc.querySelector('parsererror') && doc.documentElement.getAttribute('data-engine') === 'ai-graph-picture',
            arrows: { x: doc.querySelectorAll('path[data-role="axis-x"]').length, y: doc.querySelectorAll('path[data-role="axis-y"]').length },
            curvesDrawn: doc.querySelectorAll('polyline[data-role="curve"]').length,
            svgTicksX: texts('g[data-label-kind="tick"][data-axis="x"]'), svgTicksY: texts('g[data-label-kind="tick"][data-axis="y"]'),
            svgCurveNames: texts('g[data-label-kind="curve"]'), svgAxisNames: texts('g[data-label-kind="axis"]'),
            emptyLabelGroups: [...doc.querySelectorAll('g[data-label-kind]')].filter((g) => !g.querySelector('text')).map((g) => g.getAttribute('data-label')),
            expected: {
              labelX: prepared.labelX, labelY: prepared.labelY,
              keyTicks: [...prepared.xTicks, ...prepared.yTicks].filter((t) => t.key).map((t) => t.label),
              curveNames: prepared.series.filter((s) => !s.thin && s.label).map((s) => s.label),
              boldSeries: prepared.series.filter((s) => !s.thin).length,
            },
            png: { w: img.naturalWidth, h: img.naturalHeight, data: r.png }, svg: r.svg,
          });
        }
        // 가짜 AI로 전 과정(설계 → 검사 → 정리 → 실제 그리기)과 다시 열기
        const f0 = fixtures.find((f) => f.name === 'enzyme-rate');
        const answers = [JSON.stringify(f0.plan), '{"ok":true}'];
        const ai = { async readText() { return { text: answers.shift() }; } };
        const full = await makeGraph({ request: f0.request, keyValues: f0.keyValues }, { ai, conventions: null });
        const again = await makeGraph({ plan: graphPlanMeta(full).graphPlan }, { ai: { async readText() { throw new Error('부르면 안 됨'); } } });
        const fontNames = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
          .filter((r) => r.type === CSSRule.FONT_FACE_RULE && r.parentStyleSheet.ownerNode?.dataset?.aiGraph === 'stage-css')
          .map((r) => r.style.getPropertyValue('font-family').replace(/["']/g, '').trim());
        return {
          rows,
          full: { verified: full.verified, png: !!full.png, n: full.collisions?.n, phasesOk: !!full.prepared, againSame: again.png === full.png, againN: again.collisions?.n },
          stageLeft: document.querySelectorAll('[data-ai-graph-stage]').length,
          fontNames: [...new Set(fontNames)], bodyGrowth: document.body.innerHTML.length - before,
        };
      }, { fixtures, V });

      if (out) {
        const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
        for (const r of result.rows) {
          fs.writeFileSync(path.join(dir, r.name + '.png'), Buffer.from(r.png.data.split(',')[1], 'base64'));
          fs.writeFileSync(path.join(dir, r.name + '.svg'), r.svg);
        }
        fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ ...result, rows: result.rows.map(({ png, svg, ...r }) => ({ ...r, png: { w: png.w, h: png.h } })) }, null, 2));
      }
      for (const r of result.rows) {
        const tag = `${name} ${r.name}`;
        assert.ok(r.svgOk, `${tag} SVG`);
        assert.equal(r.katex, true, `${tag} KaTeX 불러옴`);
        assert.ok(r.png.w > 600 && r.png.h > 400, `${tag} PNG 크기 ${r.png.w}x${r.png.h}`);
        assert.deepEqual(r.arrows, { x: 1, y: 1 }, `${tag} 축 화살표`);
        assert.equal(r.curvesDrawn, r.expected.boldSeries, `${tag} 곡선 수`);
        assert.deepEqual(r.emptyLabelGroups, [], `${tag} 글자 없는 라벨`);
        if (r.expected.labelX) assert.ok(r.svgAxisNames.includes(r.expected.labelX), `${tag} 가로축 이름`);
        if (r.expected.labelY) assert.ok(r.svgAxisNames.includes(r.expected.labelY), `${tag} 세로축 이름`);
        assert.deepEqual([...r.svgCurveNames].sort(), [...r.expected.curveNames].sort(), `${tag} 곡선 이름`);
        for (const k of r.expected.keyTicks) assert.ok([...r.svgTicksX, ...r.svgTicksY].includes(k), `${tag} 핵심 눈금 ${k}`);
        assert.ok(r.svgTicksX.length + r.svgTicksY.length > 0 || !r.expected.keyTicks.length, `${tag} 눈금 글자`);
        assert.ok(!r.collisions.list.some((x) => /화살촉/.test(x)), `${tag} 글자가 화살촉에 닿음: ${r.collisions.list.join(', ')}`);
        // 실제 그린 글자 상자끼리 겹침은 어떤 설계에서도 0
        assert.ok(!r.collisions.list.some((x) => /^글자 겹침/.test(x)), `${tag} 글자끼리 겹침: ${r.collisions.list.join(', ')}`);
        // 「겹침 남음」(곡선·보조선 곁 자리 비용)은 원래 깨끗하던 설계에서 0, 원래부터 빽빽하던 설계는 원본+2까지(글꼴 계측 차이)
        if (r.original === 0) assert.equal(r.collisions.n, 0, `${tag} 겹침: ${r.collisions.list.join(', ')}`);
        else assert.ok(r.collisions.n <= r.original + 2, `${tag} 겹침 ${r.collisions.n} > 원본 ${r.original}+2: ${r.collisions.list.join(', ')}`);
      }
      assert.equal(result.full.png, true); assert.equal(result.full.verified, false); assert.equal(result.full.n, 0);
      assert.equal(result.full.againSame, true, '저장한 설계로 다시 그리면 같은 PNG');
      assert.equal(result.stageLeft, 0, '숨은 판을 남기지 않음');
      assert.ok(result.fontNames.length && result.fontNames.every((f) => f.startsWith('FEGKaTeX_')), result.fontNames.join(','));
      assert.deepEqual(errors, []);
      console.log(`${name}: ${result.rows.length}개 설계 그림(겹침 ${result.rows.map((r) => r.collisions.n).join('/')}), makeGraph 전 과정·다시 그리기 통과`);
    } finally {
      await browser.close();
    }
  }
}).catch((e) => { console.error(e); process.exitCode = 1; });
