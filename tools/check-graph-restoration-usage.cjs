/** Actual editor interactions and frame-aligned before/after images. No AI requests. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [evidence] = process.argv.slice(2);
const isLive = process.argv[3] === '--live', group = isLive ? 'live' : 'replay';
if (!evidence) throw Error('Usage: node tools/check-graph-restoration-usage.cjs evidence-directory');
const root = path.resolve(__dirname, '..'), out = path.resolve(evidence);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8797/preview/';
const manifest = JSON.parse(fs.readFileSync(path.join(out, group + '-manifest.json')));
const report = { browser: 'WebKit', nativeSafari: false, modelCalls: 0, cases: [] };
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const version = '?v=1.7.0-four-session-integration';
// Ignore floating-point serialization noise; retain actual coordinate changes.
function differences(a, b, at = '') {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a-b) <= 1e-9 ? [] : [{ path: at, before: a, after: b }];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(k => differences(a[k], b[k], at ? at+'.'+k : k));
  }
  return a === b ? [] : [{ path: at, before: a, after: b }];
}
async function capture(page, c, objects, plan, name) {
  const sourceData = 'data:image/png;base64,' + fs.readFileSync(c.sourcePath).toString('base64');
  const renderer = name === 'before' ? '/' + path.relative(root, path.join(out, 'baseline/preview/js/render/coordplane.js')).split(path.sep).join('/') : '/preview/js/render/coordplane.js';
  const htmlURL = new URL('/__graph_retest_capture__', base).href;
  await page.route(htmlURL, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;background:white"></body>' }));
  await page.goto(htmlURL);
  await page.evaluate(async ({ objects, source, sourceData, renderer, version, name }) => {
    const { renderCoordplane, renderFuncgraph } = await import(renderer + version);
    const fonts = await (await import('/preview/js/svg-export.js' + version)).ensureEmbeddedFonts();
    const ns = 'http://www.w3.org/2000/svg', pb = source.plotBox;
    const x = Math.max(0, pb.x - pb.w * .36), y = Math.max(0, pb.y - pb.h * .18);
    const right = Math.min(source.width, pb.x + pb.w * 1.25), bottom = Math.min(source.height, pb.y + pb.h * 1.35);
    const svg = document.createElementNS(ns, 'svg'); svg.id = 'capture';
    svg.setAttribute('viewBox', `${x} ${y} ${right-x} ${bottom-y}`);
    svg.setAttribute('width', 1000); svg.setAttribute('height', 1000 * (bottom-y)/(right-x));
    const style = document.createElementNS(ns, 'style'); style.textContent = fonts; svg.append(style);
    if (name === 'original') {
      const image = document.createElementNS(ns, 'image'); image.setAttribute('href', sourceData); image.setAttribute('width', source.width); image.setAttribute('height', source.height); svg.append(image);
    } else {
      const plane = objects.find(o => o.type === 'coordplane'), group = document.createElementNS(ns, 'g');
      group.setAttribute('transform', `translate(${pb.x} ${pb.y}) scale(${pb.w/plane.w} ${pb.h/plane.h}) translate(${-plane.x} ${-plane.y})`);
      for (const object of [...objects.filter(o => o.type !== 'coordplane'), plane]) group.append(object.type === 'coordplane' ? renderCoordplane(object) : renderFuncgraph(object));
      svg.append(group);
    }
    document.body.replaceChildren(svg); await document.fonts.ready;
  }, { objects, source: plan.source, sourceData, renderer, version, name });
  await page.locator('#capture').screenshot({ path: path.join(out, group, c.id, name + '.png') });
}
(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    for (const c of manifest.cases) {
      const dir = path.join(out, group, c.id), item = { id: c.id, noOp: false, expressions: [], annotationDrag: null, arrowEdit: null, errors: [] }; report.cases.push(item);
      const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, serviceWorkers: 'block' });
      await context.addInitScript(() => { localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.tutorial.bannerSeen', 'true'); localStorage.setItem('5e.preview:5e.mode', 'pro'); });
      const page = await context.newPage(); page.on('pageerror', e => item.errors.push(e.message));
      await page.route('**/api/bridge-send', route => { item.errors.push('Unexpected provider call'); return route.abort(); });
      try {
        const candidate = isLive ? JSON.parse(fs.readFileSync(path.join(dir, 'candidate.json'))) : null;
        const plan = isLive ? candidate.graphResult.plan : JSON.parse(fs.readFileSync(path.join(dir, 'after/plan.json')));
        for (const name of isLive ? ['original', 'after'] : ['original', 'before', 'after']) {
          const file = path.join(dir, name === 'original' ? 'after' : name, 'native-objects.json');
          const objects = isLive ? candidate.graphResult.objects : JSON.parse(fs.readFileSync(file)); if (!objects.length && name !== 'original') continue;
          await capture(page, c, objects, plan, name);
        }
        await page.goto(base + '?mode=pro', { waitUntil: 'domcontentloaded' });
        await page.locator('#file-menu-btn').waitFor();
        const install = () => page.evaluate(async ({ plan, version }) => {
          const { state } = await import('/preview/js/state.js' + version);
          state.update(s => { s.objects = []; s.groups = []; s.selectedIds = []; s.undoStack = []; s.redoStack = []; });
          const { buildWorkbenchGraph, insertWorkbenchGraph } = await import('/preview/js/graph/workbench-result.js' + version);
          const result = buildWorkbenchGraph(plan, plan.source); insertWorkbenchGraph(state, result);
          return state.get().objects.find(o => o.type === 'coordplane').id;
        }, { plan, version });
        const snap = () => page.evaluate(async version => JSON.parse(JSON.stringify((await import('/preview/js/state.js' + version)).state.get().objects)), version);
        const open = id => page.evaluate(async ({ id, version }) => (await import('/preview/js/graph/graph-modal.js' + version)).openGraphModal(id), { id, version });
        let planeId = await install(), original = await snap();
        await open(planeId); await page.locator('#gm-confirm').click(); assert.deepEqual(await snap(), original); item.noOp = true;
        const functions = original.filter(o => o.sourceKind === 'expression');
        for (let i = 0; i < functions.length; i++) {
          const curve = functions[i], result = { seriesId: curve.reconstruction.seriesId, edit: false, contactsFollow: false, guideDirectionsPreserved: false }; item.expressions.push(result);
          try {
            planeId = await install(); const before = await snap();
            await open(planeId); await page.locator('#gm-tab-func-btn').click(); await page.locator('#gm-sub-expr').click();
            await page.locator('#gm-chips > button').nth(i).click();
            assert.equal(await page.locator('#gm-expr').inputValue(), curve.expr);
            await page.locator('#gm-expr').fill(`(${curve.expr})+0.005`); await page.locator('#gm-expr').dispatchEvent('input');
            await page.locator('#gm-confirm').click(); const after = await snap();
            const edited = after.find(o => o.reconstruction?.seriesId === curve.reconstruction.seriesId); assert.notDeepEqual(edited.mathPoints, curve.mathPoints); result.edit = true;
            const planeBefore = before.find(o => o.type === 'coordplane'), planeAfter = after.find(o => o.type === 'coordplane');
            const linked = (planeBefore.graphAnnotations || []).filter(a => a.seriesId === curve.reconstruction.seriesId && Number.isFinite(a.anchorX) && ['guide','point','leader','arrow'].includes(a.kind));
            result.contactsChecked = linked.length;
            for (const a of linked) {
              const changed = planeAfter.graphAnnotations.find(q => q.id === a.id), p = ['leader','arrow'].includes(a.kind) ? a.to : a, q = ['leader','arrow'].includes(a.kind) ? changed.to : changed;
              assert(Math.abs(q.y - p.y - .005) < 1e-7, `Contact did not follow: ${a.id}`);
            }
            result.contactsFollow = true;
            result.obliqueGuides = [];
            for (const a of planeAfter.graphAnnotations || []) {
              if (a.kind !== 'guide' || !a.to) continue;
              const previous = planeBefore.graphAnnotations.find(q => q.id === a.id);
              if (a.orientation === 'horizontal' && Math.abs(previous.y - previous.to.y) < 1e-8 && Math.abs(a.y - a.to.y) > 1e-8 || a.orientation === 'vertical' && Math.abs(previous.x - previous.to.x) < 1e-8 && Math.abs(a.x - a.to.x) > 1e-8) result.obliqueGuides.push(a.id);
            }
            result.guideDirectionsPreserved = result.obliqueGuides.length === 0;
            if (result.obliqueGuides.length) {
              const capturePage = await context.newPage();
              try { await capture(capturePage, c, after, plan, 'edit-'+i); result.editImage = 'edit-'+i+'.png'; }
              finally { await capturePage.close(); }
            }
            await page.evaluate(async version => { const { state } = await import('/preview/js/state.js' + version); (await import('/preview/js/transform.js' + version)).undo(state); }, version);
            assert.deepEqual(await snap(), before); result.undo = true;
          } catch (error) { result.error = error.message; await page.screenshot({ path: path.join(dir, `expression-${i}-failure.png`) }); }
        }
        planeId = await install(); original = await snap(); const plane = original.find(o => o.type === 'coordplane');
        const annotation = (plane.graphAnnotations || []).find(a => a.kind === 'text' && a.text);
        if (annotation) {
          try {
            await open(planeId); await page.locator('#gm-tab-annot-btn').click();
            const locator = page.locator(`#gm-preview [data-graph-annotation="${annotation.id}"]`).first(); const bounds = await locator.boundingBox(); assert(bounds);
            await page.mouse.move(bounds.x + bounds.width/2, bounds.y + bounds.height/2); await page.mouse.down(); await page.mouse.move(bounds.x+bounds.width/2+22,bounds.y+bounds.height/2+12,{steps:4}); await page.mouse.up();
            await page.locator('#gm-confirm').click(); const after = await snap(), changed = after.find(o => o.type === 'coordplane');
            assert.notDeepEqual(changed.graphAnnotations.find(a => a.id === annotation.id), annotation);
            const unrelatedChanges = plane.graphAnnotations.filter(a => a.id !== annotation.id).flatMap(a => differences(a, changed.graphAnnotations.find(q => q.id === a.id), a.id));
            item.annotationDrag = { pass: unrelatedChanges.length === 0, id: annotation.id, unrelatedChanges };
          } catch (error) { item.annotationDrag = { pass: false, error: error.message }; }
        }
        planeId = await install(); original = await snap(); const arrowIndex = (original.find(o => o.type === 'coordplane').graphAnnotations || []).findIndex(a => a.kind === 'arrow' && a.to);
        if (arrowIndex >= 0) {
          try {
            await open(planeId); await page.locator('#gm-tab-annot-btn').click(); const n = arrowIndex+1;
            await page.locator(`[aria-label="표시 ${n} 선택"]`).click(); await page.locator('.gm-annotation-editor:visible summary').click();
            const field = page.locator(`[aria-label="표시 ${n} 끝 y"]`), value = Number(await field.inputValue()); await field.fill(String(value+.005)); await field.dispatchEvent('change');
            await page.locator('#gm-confirm').click(); const changed = (await snap()).find(o => o.type === 'coordplane').graphAnnotations[arrowIndex]; assert(Math.abs(changed.to.y-value-.005)<1e-8);
            item.arrowEdit = { pass: true, id: changed.id };
          } catch (error) { item.arrowEdit = { pass: false, error: error.message }; }
        }
        if (await page.locator('#gm-cancel').isVisible()) await page.locator('#gm-cancel').click();
        item.pass = item.noOp && item.expressions.every(r => r.edit && r.contactsFollow && r.guideDirectionsPreserved && r.undo) && item.annotationDrag?.pass !== false && item.arrowEdit?.pass !== false && !item.errors.length;
      } catch (error) { item.error = error.message; item.pass = false; }
      finally { json(path.join(dir, 'usage.json'), item); json(path.join(out, 'usage' + (isLive ? '-live' : '') + '.json'), report); await context.close(); }
      console.log(JSON.stringify(item));
    }
  } finally { await browser.close(); }
  report.pass = report.cases.every(c => c.pass); json(path.join(out, 'usage' + (isLive ? '-live' : '') + '.json'), report);
})().catch(error => { console.error(error); process.exitCode = 1; });
