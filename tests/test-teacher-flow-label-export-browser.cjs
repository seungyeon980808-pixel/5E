// 교사 흐름 3: 그림에 라벨을 붙이고(지시선 라벨) 더블클릭으로 고친 뒤, PNG·SVG로 내보내 실제 파일을 검사한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const flow = require('./helpers/teacher-flow.cjs');

// 캔버스 좌표(mm) → 화면 좌표. 진입 화면이 불러온 viewport.js·state.js를 그대로 쓴다.
const screen = (page, x, y) => page.evaluate(async ({ x, y }) => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
  const { state } = await import(stateUrl);
  const { worldToScreen } = await import(stateUrl.replace('/state.js', '/viewport.js'));
  return worldToScreen(document.querySelector('#canvas'), state.get().viewBox, x, y);
}, { x, y });

// Chromium은 "저장 위치 선택" 창(showSaveFilePicker)으로 저장한다. 사용자가 위치를 고른 것처럼
// 응답하고 앱이 실제로 쓴 바이트를 받아 둔다. WebKit은 그 창이 없어 평소 다운로드로 받는다.
function recordSavePicker() {
  if (!window.showSaveFilePicker) return;
  window.__savedFiles = [];
  window.showSaveFilePicker = async ({ suggestedName }) => ({
    createWritable: async () => {
      const parts = [];
      return {
        write: async part => { parts.push(part); },
        close: async () => {
          const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
          let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
          window.__savedFiles.push({ name: suggestedName, base64: btoa(binary) });
        },
      };
    },
  });
}

async function exportFile(page, format, evidence, engine) {
  await page.keyboard.press('Escape');
  await page.locator('#file-menu-btn').click();
  await page.locator('#image-export').click();
  const dialog = page.locator('#export-overlay');
  await dialog.waitFor({ state: 'visible' });
  await dialog.locator('#export-filename').fill(`teacher-label-${format}`);
  await dialog.locator(`#export-format [data-format="${format}"]`).click();
  const file = `${engine}-teacher-label.${format}`, target = path.join(evidence, file);
  if (await page.evaluate(() => Array.isArray(window.__savedFiles))) {
    const before = await page.evaluate(() => window.__savedFiles.length);
    await dialog.locator('#export-confirm').click();
    await page.waitForFunction(count => window.__savedFiles.length > count, before, { timeout: 20_000 });
    const saved = await page.evaluate(() => window.__savedFiles.at(-1));
    assert.equal(saved.name, `teacher-label-${format}.${format}`);
    fs.writeFileSync(target, Buffer.from(saved.base64, 'base64'));
  } else {
    const result = await flow.download(page, () => dialog.locator('#export-confirm').click(), evidence, file);
    assert.equal(result.suggested, `teacher-label-${format}.${format}`);
  }
  await dialog.waitFor({ state: 'hidden' });
  return fs.readFileSync(target);
}

flow.runEngines('label-export', {
  async run({ page, context, evidence, engine, shot }) {
    await context.addInitScript(recordSavePicker);
    await page.reload({ waitUntil: 'load' });
    await page.locator('#canvas').waitFor({ state: 'visible' });
    await flow.assertNavy(page);

    // 그림 넣기(파일 → 이미지 불러오기): 직접 그린 회로 선화.
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

    // 라벨러(Shift+T): 저항을 가리키고, 회로 안쪽 빈 곳에 글자를 둔다 → 글자 입력 → 확인.
    await page.keyboard.press('Shift+T');
    const target = await screen(page, image.x + image.w * .45, image.y + image.h * .17);
    const spot = await screen(page, image.x + image.w * .45, image.y + image.h * .5);
    await page.mouse.click(target.x, target.y);
    await page.mouse.click(spot.x, spot.y);
    await page.keyboard.press('Enter');
    const editor = page.locator('.unified-text-editor');
    await editor.waitFor({ state: 'visible' });
    await editor.locator('textarea').fill('저항');
    await editor.getByRole('button', { name: '확인', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    let label = (await flow.drawing(page)).objects.find(object => object.type === 'labeler');
    assert.equal(label?.text, '저항');
    await shot('1-label-added');

    // 고치기: 라벨을 눌러 선택하고, 선택된 라벨 글자를 한 번 더 누르면 그 자리에서 직접 편집 → Enter.
    // (선택된 라벨을 빠르게 두 번 누르면 자세한 입력 창이 열리는 것이 설계라, 두 번 누름은 나눠서 한다.)
    await page.keyboard.press('Escape');
    const glyph = await screen(page, label.p2.x, label.p2.y);
    await page.mouse.click(glyph.x, glyph.y);
    await page.waitForFunction(async id => {
      const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
      const { state } = await import(stateUrl); return state.get().selectedIds.includes(id);
    }, label.id);
    await page.waitForTimeout(600);
    await page.mouse.click(glyph.x, glyph.y);
    const inline = page.locator('.ai-inline-label-editor');
    await inline.waitFor({ state: 'visible' });
    assert.equal(await inline.inputValue(), '저항');
    await inline.fill('저항 R');
    await inline.press('Enter');
    await inline.waitFor({ state: 'detached' });
    const objects = (await flow.drawing(page)).objects;
    label = objects.find(object => object.type === 'labeler');
    assert.equal(label.text, '저항 R');
    assert.equal(objects.filter(object => object.type === 'labeler').length, 1, '고쳐도 라벨은 하나');
    await shot('2-label-edited');

    // SVG: 고친 글자와 지시선, 원본 그림이 벡터 파일 안에 들어 있다.
    const svg = (await exportFile(page, 'svg', evidence, engine)).toString('utf8');
    assert.match(svg, /^<\?xml/);
    assert.match(svg, /저항 R/, 'SVG에 고친 라벨 글자');
    assert.doesNotMatch(svg, />저항</, '고치기 전 글자는 남지 않는다');
    assert.match(svg, /<(line|path|polyline)\b/, 'SVG에 지시선');
    assert.match(svg, /<image\b[^>]*href="data:image\/png/, 'SVG에 원본 그림');

    // PNG: 300dpi 아트보드 크기, 흰 배경 위 선과 글자. 라벨 자리(회로 안쪽 빈 곳)에 먹이 있다.
    const png = await exportFile(page, 'png', evidence, engine);
    const stats = flow.inkStats(png);
    const artboard = await page.evaluate(async () => {
      const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
      const { state } = await import(stateUrl); return state.get().artboard;
    });
    assert.equal(stats.width, Math.round(artboard.w / 25.4 * 300));
    assert.equal(stats.height, Math.round(artboard.h / 25.4 * 300));
    assert.ok(stats.inkRatio > .01 && stats.inkRatio < .3, `선·글자가 보인다(먹 비율 ${stats.inkRatio.toFixed(3)})`);
    const { PNG } = require('pngjs'), decoded = PNG.sync.read(png);
    const labelInk = (() => {
      // 라벨 글자 둘레(아트보드 기준 mm → px)에 어두운 픽셀이 있어야 한다.
      const scale = decoded.width / artboard.w, cx = (label.p2.x - (artboard.x ?? -artboard.w / 2)) * scale;
      const cy = (label.p2.y - (artboard.y ?? -artboard.h / 2)) * scale, r = 6 * scale; let ink = 0;
      for (let y = Math.max(0, cy - r | 0); y < Math.min(decoded.height, cy + r); y++)
        for (let x = Math.max(0, cx - r | 0); x < Math.min(decoded.width, cx + r); x++) {
          const i = (y * decoded.width + x) * 4; if (decoded.data[i] + decoded.data[i + 1] + decoded.data[i + 2] < 288) ink++;
        }
      return ink;
    })();
    assert.ok(labelInk > 50, `PNG 라벨 자리에 글자가 그려졌다(${labelInk}px)`);
    await shot('3-exported');
    return { label: { text: label.text }, svgBytes: svg.length, png: { width: stats.width, height: stats.height, inkRatio: Number(stats.inkRatio.toFixed(4)), labelInk } };
  },
}).then(() => console.log('교사 흐름 3(라벨 붙이기·고치기 → PNG/SVG 내보내기): chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
