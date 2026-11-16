// Fixed graph source: b1846e849656076b1c0c5da2f82abffff3813eb1:tests/test-graph-source-typography-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('./helpers/graph-source-signals.cjs').loadPlaywright();
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json')));
const out = process.env.EVIDENCE_DIR;
assert(out, 'EVIDENCE_DIR required'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const reports = [];
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.addInitScript(() => {
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:62759/', { waitUntil: 'networkidle' });
      const result = await page.evaluate(async plan => {
        const v = '?v=1.7.0-four-session-integration', ns = 'http://www.w3.org/2000/svg';
        const { renderGraphLabel } = await import('/js/render/graph-label.js' + v);
        const { ensureEmbeddedFonts } = await import('/js/svg-export.js' + v);
        const { buildNativeGraph } = await import('/js/graph/native-graph.js' + v);
        const { renderCoordplane, renderFuncgraph } = await import('/js/render/coordplane.js' + v);
        const { buildWorkbenchGraph, workbenchGraphDataUrl } = await import('/js/graph/workbench-result.js' + v);
        const { state } = await import('/js/state.js' + v);
        const io = await import('/js/project-io.js' + v);
        await document.fonts.load('normal 400 128px "Latin Modern Roman"');
        const css = await ensureEmbeddedFonts();
        // Measure exported pixels, rather than just checking a font-size attribute.
        const ink = async (text, size, sourceHeight) => {
          const svg = document.createElementNS(ns, 'svg');
          svg.setAttribute('xmlns', ns); svg.setAttribute('width', '400'); svg.setAttribute('height', '160');
          const style = document.createElementNS(ns, 'style'); style.textContent = css; svg.append(style);
          const label = renderGraphLabel(text, { x: 20, y: 80, size, sourceHeight, upright: true, halo: false }); svg.append(label);
          const image = new Image(); image.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
          await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 160;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 400, 160); ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, 400, 160).data; let min = 160, max = -1;
          for (let y = 0; y < 160; y++) for (let x = 0; x < 400; x++) if (pixels[(y * 400 + x) * 4] < 128) { min = Math.min(min, y); max = Math.max(max, y); }
          return { text, size, sourceHeight, height: max - min + 1, fonts: [...label.querySelectorAll('text')].map(t => ({ family: t.getAttribute('font-family'), style: t.getAttribute('font-style') })) };
        };
        const glyphs = [];
        for (const size of [12, 24, 36]) for (const text of ['H0', '가']) glyphs.push(await ink(text, size, true));
        const legacy = await ink('H0', 24, false);
        const unit = renderGraphLabel('\\left(\\frac{g}{\\text{물 }100 g}\\right)', { x: 40, y: 50, size: 4, halo: false });
        const unitGlyphs = [...unit.querySelectorAll('text')].map(t => ({ text: t.textContent, style: t.getAttribute('font-style') }));
        const mathPair = renderGraphLabel('\\left(\\frac{a}{b}\\right)', { size: 4, halo: false });
        const pairText = [...mathPair.querySelectorAll('text')].map(t => t.textContent).join('');
        plan.style = { fontSizePx: 24, labelWeight: 400 };
        plan.axes.x.title = '시간'; plan.axes.x.ticks = [{ value: 1, label: 'E_0' }];
        plan.annotations = [{ id: 'A', kind: 'text', text: 'A', x: .5, y: .5, coordinateSpace: 'normalized', orientation: 'horizontal', fontSizePx: 18 },
          { id: 'gray-point', kind: 'point', text: '', x: .25, y: .25, coordinateSpace: 'normalized', orientation: 'horizontal', endStyle:'closed', markerSize:1.3, strokeWidth:.55, fillLevel:160 }];
        const native = buildNativeGraph(plan, { box: { x: 0, y: 0, w: 70, h: 50 } });
        const double = buildNativeGraph(plan, { box: { x: 0, y: 0, w: 140, h: 100 } });
        const plain = buildNativeGraph({ ...plan, style: { labelSize: 4 } });
        const result = buildWorkbenchGraph(plan, plan.source);
        const dataUrl = await workbenchGraphDataUrl(result);
        const svg = new DOMParser().parseFromString(atob(dataUrl.split(',')[1]), 'image/svg+xml');
        const sourceFontsEmbedded = svg.querySelector('defs style')?.textContent.includes('data:font/woff2;base64,') === true;
        const graphText = [...svg.querySelectorAll('text')].map(t => ({ text: t.textContent, family: t.getAttribute('font-family'), style: t.getAttribute('font-style') }));
        state.update(s => { s.objects = structuredClone(native.objects); s.groups = []; });
        const render = () => state.get().objects.map(o => new XMLSerializer().serializeToString(o.type === 'coordplane' ? renderCoordplane(o) : renderFuncgraph(o))).join('');
        const before = render(); io.applyLoaded(state, io.serialize(state.get())); const after = render();
        const plane = state.get().objects.find(o => o.type === 'coordplane');
        const titleSize = +renderCoordplane(plane).querySelector('[data-axisname="x"] text').getAttribute('font-size');
        const dot=renderCoordplane(plane).querySelector('[data-graph-annotation-shape="gray-point"]');
        const axisFree=structuredClone(plan);axisFree.frame={variant:'none',arrowX:false,arrowY:false};
        axisFree.axes.x.title='';axisFree.axes.y.title='';axisFree.axes.x.ticks=[];axisFree.axes.y.ticks=[];
        const hiddenPlane=buildNativeGraph(axisFree).objects[0],hiddenSvg=renderCoordplane(hiddenPlane);
        const singleAxis=structuredClone(axisFree);singleAxis.frame.variant='x';
        const singlePlane=buildNativeGraph(singleAxis).objects[0],singleSvg=renderCoordplane(singlePlane);
        const legendPlan=structuredClone(axisFree);
        legendPlan.legends=[{x:.5,y:.8,coordinateSpace:'normalized',size:2,swatch:6,pad:0,rows:[{text:'',lineVisible:true,markerShape:'none'}]}];
        const legendPlane=buildNativeGraph(legendPlan).objects[0],legendSvg=renderCoordplane(legendPlane),legendRect=legendSvg.querySelector('[data-legend="0"]');
        const legend=legendPlane.legends[0],legendY=legendPlane.y+legendPlane.h*(1-(legend.y-legendPlane.yMin)/(legendPlane.yMax-legendPlane.yMin));
        const framedLegend=structuredClone(legendPlan);framedLegend.legends[0].frame=true;
        const framedRect=renderCoordplane(buildNativeGraph(framedLegend).objects[0]).querySelector('[data-legend="0"]');
        const legacyLegend=structuredClone(legendPlane);delete legacyLegend.reconstruction;
        const legacyRect=renderCoordplane(legacyLegend).querySelector('[data-legend="0"]');
        const badLegend=structuredClone(legendPlan);badLegend.legends[0].frame='true';
        plane.axisLabelSize *= 1.5;
        const editedTitleSize = +renderCoordplane(plane).querySelector('[data-axisname="x"] text').getAttribute('font-size');
        return { glyphs, legacy, unitGlyphs, unitFractionRules: unit.querySelectorAll('line').length, pairText, sourceFontsEmbedded, graphText, reloadIdentical: before === after, titleEditRatio: editedTitleSize / titleSize,
          sizeMode: native.objects[0].reconstruction.labelSizeMode, annotationMode: native.objects[0].graphAnnotations[0].labelSizeMode,
          nativeSizeRatio: double.objects[0].axisLabelSize / native.objects[0].axisLabelSize, explicitMmMode: plain.objects[0].reconstruction.labelSizeMode,
          pointStyle:{radius:Number(dot.getAttribute('r')),strokeWidth:Number(dot.getAttribute('stroke-width')),fill:dot.getAttribute('fill')},
          hiddenAxisLines:hiddenSvg.querySelectorAll('line,path').length,singleAxisVariant:singlePlane.axisVariant,singleAxisLines:singleSvg.querySelectorAll('line').length,
          sourceLegend:{stroke:legendRect.getAttribute('stroke'),opacity:legendRect.getAttribute('fill-opacity'),offset:Number(legendSvg.querySelector('line').getAttribute('y1'))-legendY},
          framedLegend:framedRect.getAttribute('fill-opacity'),legacyLegend:legacyRect.getAttribute('fill-opacity'),badLegendRejected:!buildNativeGraph(badLegend).ok };
      }, fixture);
      for (const g of result.glyphs) assert(Math.abs(g.height - g.size) <= 2, `${name}: ${JSON.stringify(g)}`);
      assert(result.legacy.height < 19, 'Ordinary graphs keep their legacy typography');
      const unitText = result.unitGlyphs.map(t => t.text).join('');
      assert(!/left|right|text|frac|\\/.test(unitText), 'Formatting commands must never become unit glyphs');
      for (const text of ['(', ')', 'g', '물', '100']) assert(unitText.includes(text), `Preserve unit content ${text}`);
      assert.equal(result.unitFractionRules, 1); assert(result.unitGlyphs.every(t => t.style === 'normal'));
      assert.equal(result.pairText, '(ab)', 'Delimited ordinary fractions preserve their symbols');
      assert(result.sourceFontsEmbedded, 'The workbench SVG embeds its equation face');
      assert(result.graphText.every(t => t.style === 'normal'));
      assert(result.graphText.some(t => t.family?.includes('Latin Modern Roman')));
      assert(result.graphText.some(t => t.family?.includes('Dotum')));
      assert(result.reloadIdentical); assert(Math.abs(result.titleEditRatio - 1.5) < 1e-9);
      assert.equal(result.nativeSizeRatio, 2); assert.equal(result.sizeMode, 'source-height');
      assert.equal(result.annotationMode, 'source-height'); assert.equal(result.explicitMmMode, 'legacy');
      assert.deepEqual(result.pointStyle,{radius:1.3,strokeWidth:.55,fill:'#a0a0a0'});
      assert.equal(result.hiddenAxisLines,0);assert.equal(result.singleAxisVariant,'single');assert.equal(result.singleAxisLines,1);
      assert.equal(result.sourceLegend.stroke,'none');assert.equal(result.sourceLegend.opacity,'0');assert(Math.abs(result.sourceLegend.offset)<1e-9);
      assert.equal(result.framedLegend,'0.9');assert.equal(result.legacyLegend,'0.9');assert(result.badLegendRejected);
      reports.push({ browser: name, pass: true, aiCalls: 0, ...result });
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(reports, null, 2));
  console.log('PASS Chromium and WebKit: source ink height, font embedding, upright labels, editing, scale and save/reopen');
})().catch(e => { console.error(e); process.exitCode = 1; });
