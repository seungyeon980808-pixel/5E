// 교사 흐름 2: 캔버스에 넣은 교과서 사진 → AI 이미지 변환(녹화 응답, 실제 AI 호출 0) → 결과 확인·PNG 저장 → 캔버스에 배치.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const flow = require('./helpers/teacher-flow.cjs');

// 녹화된 결과 선화를 누런 종이·잡티가 있는 "교과서 사진"으로 바꾼 원본(결정적으로 생성).
function photographedSource() {
  const recorded = flow.recordedAiConversion().responses.find(response => response.match.purpose === 'image').reply.imageDataUrl;
  const png = PNG.sync.read(flow.inkStats(recorded).bytes);
  for (let i = 0, n = 0; i < png.data.length; i += 4, n++) {
    const noise = (n * 2654435761 >>> 24) % 18;
    if (png.data[i] > 128) { png.data[i] = 226 - noise; png.data[i + 1] = 218 - noise; png.data[i + 2] = 196 - noise; }
    else { png.data[i] = png.data[i + 1] = png.data[i + 2] = 40 + noise; }
  }
  return PNG.sync.write(png);
}

const paperRatio = bytes => {
  const png = PNG.sync.read(bytes); let paper = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i + 3] > 128 && png.data[i] > 200 && png.data[i + 2] < 205) paper++;
  return paper / (png.width * png.height);
};

flow.runEngines('ai-image', {
  options: { ai: true },
  async run({ page, evidence, engine, shot }) {
    const sourceFile = path.join(evidence, 'source-photo.png');
    fs.writeFileSync(sourceFile, photographedSource());

    // 파일 → 이미지 불러오기 → 한 페이지에 넣기
    await page.locator('#file-menu-btn').click();
    await page.locator('#image-import').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-mode="single-page"]').click();
    await (await chooser).setFiles(sourceFile);
    await page.waitForFunction(() => document.querySelectorAll('#canvas image').length === 1);
    const before = await flow.drawing(page);
    assert.deepEqual(before.objects.map(object => object.type), ['image']);
    await shot('1-canvas-source');

    // 선택한 그림으로 AI 작업실을 연다.
    await page.locator('#ai-image-install-open').click();
    const panel = page.locator('#ai-image-panel');
    await panel.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('#ai-image-panel .ai-preview-stage > img')?.naturalWidth > 0);
    assert.equal(await panel.getAttribute('data-ai-result-count'), '0');
    await panel.locator('[data-ai-comments-apply]').click();
    await page.waitForFunction(() => {
      const element = document.querySelector('#ai-image-panel');
      return element.dataset.aiResultCount === '1' && element.dataset.aiBusy === 'false';
    }, null, { timeout: 30_000 });
    const sends = await page.evaluate(() => window.__recordedAiSends.map(send => send.replayed));
    assert.deepEqual(sends, ['원본 관찰', '그림 생성', '결과 검수'], '녹화된 세 요청만 오가고 녹화에 없는 요청은 없다');
    assert.match(await panel.locator('[data-ai-status]').textContent(), /처리 완료/);
    // 첫 성공 뒤 설치형 안내가 뜨면 닫는다(웹 편집은 계속).
    const later = page.getByRole('button', { name: '나중에', exact: true });
    await later.waitFor({ timeout: 1500 }).then(() => later.click(), () => {});
    await shot('2-ai-result');

    // 결과 확인: PNG 저장으로 실제 파일을 받는다. 누런 종이 배경이 사라진 흑백 선화여야 한다.
    const saved = await flow.download(page, () => panel.locator('[data-ai-save-selected]').click(), evidence, `${engine}-ai-result.png`);
    assert.match(saved.suggested, /\.png$/);
    const result = flow.inkStats(saved.bytes), source = flow.inkStats(fs.readFileSync(sourceFile));
    assert.deepEqual([result.width, result.height], [source.width, source.height], '결과는 원본과 같은 크기');
    assert.ok(paperRatio(fs.readFileSync(sourceFile)) > .8 && paperRatio(saved.bytes) < .01, '종이 배경이 흰 배경으로 바뀌었다');
    assert.ok(result.inkRatio > .02 && result.inkRatio < .3, `선이 남아 있다(먹 비율 ${result.inkRatio.toFixed(3)})`);

    // 캔버스에 삽입: 작업실이 닫히고 결과가 원본과 별개인 새 그림으로 들어간다.
    await panel.locator('[data-ai-insert-selected]').click();
    await panel.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelectorAll('#canvas image').length === 2);
    const after = await flow.drawing(page);
    assert.deepEqual(after.objects.map(object => object.type), ['image', 'image']);
    const inserted = after.objects.find(object => !before.objects.some(old => old.id === object.id));
    const placed = flow.inkStats(await page.evaluate(async src => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png');
    }, inserted.src));
    assert.deepEqual([placed.width, placed.height], [result.width, result.height], '캔버스에 들어간 그림이 저장한 결과와 같은 크기');
    assert.ok(Math.abs(placed.inkRatio - result.inkRatio) < .01, '캔버스에 들어간 그림이 저장한 결과와 같은 선화');
    assert.ok(inserted.w > 0 && inserted.h > 0);
    await shot('3-canvas-placed');
    return { result: { width: result.width, height: result.height, inkRatio: Number(result.inkRatio.toFixed(4)) }, sends, placed: { w: inserted.w, h: inserted.h } };
  },
}).then(() => console.log('교사 흐름 2(그림 → AI 변환 → 결과 확인 → 캔버스 배치): chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
