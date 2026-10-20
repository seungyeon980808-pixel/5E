// 교사 흐름 5: 라벨까지 붙인 완성 그림을 5E_hwp(한글 시험지 작업실)로 보내 새 시험지에 넣고,
// 문서 안 그림(크기·선·5E 원본 정보)과 한글 저장(.hwpx) 파일 안의 그림까지 확인한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('./helpers/teacher-flow.cjs');
const exam = require('./helpers/rhwp-exam.cjs');

const screen = (page, x, y) => page.evaluate(async ({ x, y }) => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
  const { state } = await import(stateUrl);
  const { worldToScreen } = await import(stateUrl.replace('/state.js', '/viewport.js'));
  return worldToScreen(document.querySelector('#canvas'), state.get().viewBox, x, y);
}, { x, y });

// 시험지 문서 안의 그림들: 위치·크기, 그림 바이트, 함께 저장된 5E 원본 정보.
const documentPictures = page => page.evaluate(async () => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
  const { readEditablePng } = await import(stateUrl.replace('/state.js', '/editable-png.js'));
  const wasm = document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
  return wasm.getPageControlLayout(0).controls.filter(control => control.type === 'image').map(control => {
    const bytes = wasm.getControlImageData(control.secIdx, control.paraIdx, control.controlIdx, JSON.stringify(control.cellPath || []));
    const figure = readEditablePng(bytes);
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return { w: control.w, h: control.h, png: btoa(binary), sourceObjects: figure?.source?.pages?.flatMap(entry => entry.objects || []).map(object => object.text === undefined ? { type: object.type } : { type: object.type, text: object.text }) || null };
  });
});

flow.runEngines('hwp-exam', {
  options: { savePicker: true },
  async run({ page, evidence, engine, shot }) {
    // 완성 그림: 회로 선화 + 지시선 라벨 "전구".
    const figure = path.join(evidence, 'circuit-figure.png');
    const recorded = flow.recordedAiConversion().responses.find(response => response.match.purpose === 'image').reply.imageDataUrl;
    fs.writeFileSync(figure, flow.inkStats(recorded).bytes);
    await page.locator('#file-menu-btn').click();
    await page.locator('#image-import').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-mode="single-page"]').click();
    await (await chooser).setFiles(figure);
    await page.waitForFunction(() => document.querySelectorAll('#canvas image').length === 1);
    const image = (await flow.drawing(page)).objects[0];
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+T');
    for (const [fx, fy] of [[.65, .8], [.4, .55]]) { const point = await screen(page, image.x + image.w * fx, image.y + image.h * fy); await page.mouse.click(point.x, point.y); }
    await page.keyboard.press('Enter');
    const editor = page.locator('.unified-text-editor');
    await editor.waitFor({ state: 'visible' });
    await editor.locator('textarea').fill('전구');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    await page.keyboard.press('Escape');
    await shot('1-finished-figure');

    // 5E_hwp → 한글 문서로 보내기 → 그림 전체를 영역으로 지정 → 확인.
    await page.locator('#exam-send').click();
    await page.locator('.capture-overlay').waitFor();
    if (!await page.locator('#capture-confirm').isVisible()) {
      const from = await screen(page, image.x - 1, image.y - 1), to = await screen(page, image.x + image.w + 1, image.y + image.h + 1);
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
    }
    await page.locator('#capture-confirm').click();
    // 열린 한글 문서가 없으면 새 시험지를 만든다.
    await page.getByRole('button', { name: '새 문서 만들기', exact: true }).click();
    await exam.place(page);
    await page.waitForFunction(() => document.querySelector('#rhwp-exam-workspace')?.getAttribute('aria-busy') === 'false');
    await shot('2-hwp-document');

    const pictures = await documentPictures(page);
    assert.equal(pictures.length, 1, '시험지에 그림 하나가 들어갔다');
    const inserted = flow.inkStats(Buffer.from(pictures[0].png, 'base64'));
    fs.writeFileSync(path.join(evidence, `${engine}-document-picture.png`), inserted.bytes);
    const aspect = inserted.width / inserted.height;
    assert.ok(Math.abs(aspect - image.w / image.h) < .08, `그림 전체가 들어갔다(비율 ${aspect.toFixed(2)})`);
    assert.ok(inserted.inkRatio > .02 && inserted.inkRatio < .3, `문서 속 그림에 선이 있다(먹 비율 ${inserted.inkRatio.toFixed(3)})`);
    assert.ok(pictures[0].w > 0 && pictures[0].h > 0);
    // 문서 속 그림은 5E 원본을 품고 있어(더블클릭으로 다시 고칠 수 있게) 그림과 라벨이 모두 들어 있다.
    assert.deepEqual(pictures[0].sourceObjects, [{ type: 'image' }, { type: 'labeler', text: '전구' }]);
    assert.match(await page.locator('#exam-status').textContent(), /그림을 넣었습니다/);

    // 한글 저장(.hwpx): ZIP 안에 그림 파일(BinData)이 함께 저장된다.
    const saved = await flow.captureSave(page, () => exam.action(page, 'export-hwpx'), evidence, `${engine}-teacher-exam.hwpx`);
    await exam.idle(page);
    assert.match(saved.suggested.normalize('NFC'), /\.hwpx$/);
    assert.deepEqual([...saved.bytes.subarray(0, 2)], [80, 75], '.hwpx는 ZIP 형식');
    const names = saved.bytes.toString('latin1');
    assert.match(names, /BinData\/[^\s"]+\.png/, '.hwpx 안에 그림 파일');
    assert.match(names, /Contents\/section0\.xml/);
    await shot('3-hwpx-saved');
    return { picture: { width: inserted.width, height: inserted.height, inkRatio: Number(inserted.inkRatio.toFixed(4)), hwpUnits: [pictures[0].w, pictures[0].h] },
      sourceObjects: pictures[0].sourceObjects, hwpx: { file: saved.suggested, via: saved.via, bytes: saved.bytes.length } };
  },
}).then(() => console.log('교사 흐름 5(완성 그림 → 한글 시험지): chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
