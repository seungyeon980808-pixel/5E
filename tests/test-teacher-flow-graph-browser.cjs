// 교사 흐름 4: 그래프 창에서 좌표·함수 그래프를 만들고 → 프로젝트 파일로 저장 → 캔버스를 비운 뒤 그 파일을 열고
// → 그래프를 더블클릭해 다시 열어 함수식을 고친다. 저장 파일과 고친 결과를 함께 확인한다.
const assert = require('node:assert/strict');
const flow = require('./helpers/teacher-flow.cjs');

const appModule = (page, name, run, arg) => page.evaluate(async ({ name, source, arg }) => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(entry => /\/state\.js(\?|$)/.test(entry));
  const module = await import(stateUrl.replace('/state.js', `/${name}`));
  return (0, eval)(`(${source})`)(module, arg);
}, { name, source: run.toString(), arg });

const setNumber = async (locator, value) => { await locator.fill(String(value)); await locator.dispatchEvent('change'); };
const curveOf = objects => objects.find(object => object.type === 'funcgraph');
// 곡선의 수학 좌표 점 목록에서 x에 가장 가까운 점의 y값.
const sampleY = (curve, x) => curve.mathPoints.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best).y;

flow.runEngines('graph', {
  options: { savePicker: true },
  async run({ page, evidence, engine, shot }) {
    // ① 좌표: x 0~4, y 0~4, 1칸 간격
    await page.locator('#graph-tool-open').click();
    const modal = page.locator('#graph-modal-overlay');
    await modal.waitFor({ state: 'visible' });
    for (const [id, value] of [['#gm-xpos', 4], ['#gm-ypos', 4], ['#gm-xstep', 1], ['#gm-ystep', 1]]) await setNumber(modal.locator(id), value);
    // ② 함수: y = x²/4, 끝 라벨 A
    await modal.locator('#gm-tab-func-btn').click();
    await modal.locator('#gm-add-series').click();
    await modal.locator('#gm-expr').fill('x^2/4');
    await modal.locator('#gm-expr').dispatchEvent('input');
    await modal.locator('#gm-expr').dispatchEvent('change');
    await modal.locator('#gm-endlabel').fill('A');
    await modal.locator('#gm-endlabel').dispatchEvent('input');
    await shot('1-graph-editor');
    await modal.locator('#gm-confirm').click();
    await modal.waitFor({ state: 'hidden' });
    let { objects } = await flow.drawing(page);
    const plane = objects.find(object => object.type === 'coordplane');
    let curve = curveOf(objects);
    assert.ok(plane && curve, '좌표평면과 함수 그래프가 캔버스에 들어간다');
    assert.deepEqual([plane.graphCfg.xPos, plane.graphCfg.yPos, plane.gridStepX, plane.gridStepY], [4, 4, 1, 1], '좌표 창에서 정한 범위·간격');
    assert.equal(curve.expr, 'x^2/4');
    assert.ok(Math.abs(sampleY(curve, 2) - 1) < .1, 'x=2에서 y≈1');
    await shot('2-canvas-graph');

    // 프로젝트 저장 → 실제 .5e 파일(ZIP)을 받는다.
    await page.keyboard.press('Escape');
    const saved = await flow.captureSave(page, async () => {
      await page.locator('#file-menu-btn').click();
      await page.locator('#project-save').click();
      if (engine === 'webkit') {
        const dialog = page.locator('.modal-overlay:not([hidden])').last();
        await dialog.locator('.modal-input').fill('교사 흐름 그래프');
        await dialog.getByRole('button', { name: '저장', exact: true }).click();
      }
    }, evidence, `${engine}-teacher-graph.5e`);
    assert.match(saved.suggested.normalize('NFC'), /\.5e$/);
    assert.deepEqual([...saved.bytes.subarray(0, 2)], [80, 75], '.5e는 ZIP 형식');
    const parsed = await appModule(page, 'fivee-project.js', async (module, bytes) => {
      const project = await module.parseFiveEProject(new Uint8Array(bytes));
      return project.drawing.pages.flatMap(entry => entry.objects || []).concat(project.drawing.objects || []).map(object => ({ type: object.type, expr: object.expr }));
    }, [...saved.bytes]);
    assert.ok(parsed.some(object => object.type === 'funcgraph' && object.expr === 'x^2/4'), '저장 파일 안에 함수식이 있다');

    // 캔버스를 비우고(전체 선택 → 삭제) 저장한 파일을 연다.
    await page.locator('#canvas').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
    await page.waitForFunction(async () => {
      const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(entry => /\/state\.js(\?|$)/.test(entry));
      return (await import(stateUrl)).state.get().objects.length === 0;
    });
    await page.locator('#file-menu-btn').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#project-open').click();
    await (await chooser).setFiles(saved.path);
    // 지운 뒤 아직 저장하지 않은 상태면 "현재 작업을 이 프로젝트 파일로 대체할까요?"를 묻는다 → 열기.
    const replace = page.locator('.modal-overlay:not([hidden])').filter({ hasText: '프로젝트 파일로 대체' }).getByRole('button', { name: '열기', exact: true });
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length > 0
      || [...document.querySelectorAll('.modal-overlay:not([hidden])')].some(overlay => overlay.textContent.includes('프로젝트 파일로 대체')), null, { timeout: 15_000 });
    if (await replace.isVisible()) await replace.click();
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length > 0, null, { timeout: 15_000 });
    ({ objects } = await flow.drawing(page));
    curve = curveOf(objects);
    assert.equal(curve?.expr, 'x^2/4', '파일을 열면 그래프가 그대로 돌아온다');
    await shot('3-reopened-file');

    // 그래프를 더블클릭해 다시 연다 → 함수식을 x²/2로 고친다.
    const hit = await appModule(page, 'viewport.js', async (module, point) => {
      const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(entry => /\/state\.js(\?|$)/.test(entry));
      const { state } = await import(stateUrl);
      return module.worldToScreen(document.querySelector('#canvas'), state.get().viewBox, point.x, point.y);
    }, curve.points[Math.floor(curve.points.length * .6)]);
    await page.mouse.dblclick(hit.x, hit.y, { delay: 80 });
    await modal.waitFor({ state: 'visible' });
    await modal.locator('#gm-tab-func-btn').click();
    const expr = modal.locator('#gm-expr');
    await expr.waitFor();
    assert.equal(await expr.inputValue(), 'x^2/4', '다시 열면 원래 함수식이 보인다');
    await expr.fill('x^2/2');
    await expr.dispatchEvent('input');
    await expr.dispatchEvent('change');
    await shot('4-graph-reedit');
    await modal.locator('#gm-confirm').click();
    await modal.waitFor({ state: 'hidden' });
    ({ objects } = await flow.drawing(page));
    const edited = curveOf(objects);
    assert.equal(objects.filter(object => object.type === 'funcgraph').length, 1, '고쳐도 그래프는 하나');
    assert.equal(edited.id, curve.id, '같은 그래프를 고친다');
    assert.equal(edited.expr, 'x^2/2');
    assert.ok(Math.abs(sampleY(edited, 2) - 2) < .15, 'x=2에서 y≈2로 다시 그려졌다');
    assert.equal(edited.endLabel, 'A', '끝 라벨은 유지');
    await shot('5-graph-edited');
    return { saved: { file: saved.suggested, via: saved.via, bytes: saved.bytes.length }, before: 'x^2/4', after: edited.expr };
  },
}).then(() => console.log('교사 흐름 4(그래프 만들기 → 저장 → 다시 열어 고치기): chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
