// 교사 흐름 1: 라이브러리의 교과서 PDF에서 그림을 잘라 크롭 모음(라이브러리)에 저장하고, AI 작업대로 가져온다.
// 실제 앱(/)·실제 pdf.js 렌더링·실제 작업대 저장을 그대로 쓰고, Drive 자료집만 고정 자료로 바꾼다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('./helpers/teacher-flow.cjs');

flow.runEngines('pdf-library', {
  options: { ai: true },
  async run({ page, evidence, engine, shot }) {
    const ui = await flow.cropTextbookFigure(page);
    await shot('1-crop-confirmed');

    // 자르기 창을 닫으면 자른 그림이 라이브러리 크롭 모음에 남아 있어야 한다.
    await ui.locator('[data-unilib-crop-workbench]').click();
    await ui.locator('[data-unilib-crop]').waitFor({ state: 'hidden' });
    const tray = ui.locator('[data-unilib-crop-tray]');
    await tray.waitFor();
    assert.equal((await ui.locator('[data-unilib-crop-tray-count]').textContent()).trim(), '1개');
    const thumb = ui.locator('[data-unilib-crop-tray-miniatures] img').first();
    await thumb.waitFor();
    await thumb.evaluate(image => image.decode());
    await shot('2-library-tray');

    const panel = await flow.sendTrayToWorkbench(page, ui);
    const task = panel.locator('.ai-task-tab-select');
    await task.first().waitFor();
    assert.equal(await task.count(), 1, '작업대에 작업 하나가 생긴다');
    assert.match(await task.first().textContent(), /circuit-textbook/);
    assert.match(await panel.locator('[data-ai-source-select] option:checked').textContent(), /circuit-textbook\.pdf · 1쪽 · 자른 영역 1/);
    const source = panel.locator('.ai-preview-stage > img').first();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel .ai-preview-stage > img')?.naturalWidth > 0);
    await shot('3-workbench');

    // 작업대에 들어간 원본을 실제 PNG로 꺼내 확인: 회로 선이 있고, 종이 전체가 아니라 그림 부분만이다.
    const dataUrl = await source.evaluate(async image => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/png');
    });
    const stats = flow.inkStats(dataUrl);
    fs.writeFileSync(path.join(evidence, `${engine}-workbench-source.png`), stats.bytes);
    assert.ok(stats.width >= 400 && stats.height >= 250, `원본 해상도로 잘렸다: ${stats.width}x${stats.height}`);
    const aspect = stats.width / stats.height;
    assert.ok(aspect > 1.2 && aspect < 1.9, `회로 그림 비율(가로로 긴 영역): ${aspect.toFixed(2)}`);
    assert.ok(stats.inkRatio > .01 && stats.inkRatio < .3, `회로 선이 보인다(먹 비율 ${stats.inkRatio.toFixed(3)})`);
    assert.equal(await page.evaluate(() => window.__recordedAiSends.length), 0, '가져오기만으로는 AI 요청이 나가지 않는다');
    return { source: { width: stats.width, height: stats.height, inkRatio: Number(stats.inkRatio.toFixed(4)) } };
  },
}).then(() => console.log('교사 흐름 1(PDF → 라이브러리 → 작업대): chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
