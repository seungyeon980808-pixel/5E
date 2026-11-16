const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const harness = source.slice(source.indexOf('function seedRequestWorkspaces('), source.indexOf('\nfor (const count of [1, 10, 30])'));
const fixture = new Function('require', 'root', 'fs', 'path', 'assert', 'chromium', 'webkit', harness + ';return requestBrowserFixture;')(require, root, fs, path, assert, chromium, webkit);
for (const engine of ['chromium', 'webkit']) {
  test(`${engine}: comparison aligns images and keeps controls beside their context`, { timeout: 90000 }, async t => {
    process.env.TASK2_ENGINE = engine;
    const evidence = path.join(process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-followup-0928/layout', process.env.QA_PHASE || 'green'), engine);
    fs.mkdirSync(evidence, { recursive: true });
    const { page, errors } = await fixture(t, 2, evidence);
    const panel = '#ai-image-panel';
    // 좌우 비교는 '비교 ▾' 메뉴 안에 있다.
    await page.click(`${panel} .ai-compare-menu summary`);
    await page.click(`${panel} [data-ai-layout-mode="side-by-side"]`);
    async function geometry(name) {
      await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card:not([hidden]) .ai-preview-stage > img')].every(img => img.complete));
      const result = await page.evaluate(() => {
        const panel = document.querySelector('#ai-image-panel');
        const rect = selector => { const r = panel.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
        return { source:rect('.is-ai-active-source .ai-preview-stage'), result:rect('.is-ai-active-candidate .ai-preview-stage'),
          title:rect('.ai-result-pane .ai-pane-metadata > strong'), picker:rect('[data-ai-version-button]') };
      });
      fs.writeFileSync(path.join(evidence, `${name}.json`), JSON.stringify(result, null, 2));
      await page.screenshot({ path:path.join(evidence, `${name}.png`) });
      assert.ok(Math.abs(result.source.y - result.result.y) <= 1, JSON.stringify(result));
      assert.ok(Math.abs(result.source.height - result.result.height) <= 1, JSON.stringify(result));
      assert.ok(Math.abs(result.source.width - result.result.width) <= 1, 'Both comparison frames must have the same width: ' + JSON.stringify(result));
      assert.ok(result.picker.x - (result.title.x + result.title.width) < 15, 'revision picker sits immediately beside its heading');
    }
    await page.click(`${panel} [data-ai-comment-tool="pan"]`);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-comment-tool="pan"]').getAttribute('aria-pressed') === 'true');
    // 10-22 위 도구 줄: 묶음 4개(보기·확대·주석 도구·코멘트 표시), 확대 묶음은 가운데 선 왼쪽 8px에서 끝, 주석은 오른쪽 끝.
    const toolbar = await page.evaluate(() => {
      const panel = document.querySelector('#ai-image-panel');
      const r = el => el.getBoundingClientRect();
      const heading = panel.querySelector('.ai-compare-heading'), grid = r(panel.querySelector('.ai-comparison-grid'));
      const frames = [panel.querySelector('.ai-compare-controls'), ...heading.querySelectorAll('.ai-tool-seg')];
      const pressed = heading.querySelector('.ai-compare-controls > .ai-compare-menu > summary');
      const soft = getComputedStyle(document.documentElement).getPropertyValue('--ds-soft-bg').trim();
      const probe = document.createElement('i'); probe.style.background = soft; document.body.append(probe);
      const softColor = getComputedStyle(probe).backgroundColor; probe.remove();
      return { frames: frames.map(el => ({ radius: getComputedStyle(el).borderTopLeftRadius, h: r(el).height })),
        center: grid.x + grid.width / 2, gridRight: grid.right, headingH: r(heading).height,
        zoomRight: r(heading.querySelector('.ai-pane-zoom .ai-tool-seg')).right, help: r(heading.querySelector('.ai-zoom-help')).right,
        annRight: r(heading.querySelector('.ai-annotation-toolbar')).right, annLeft: r(heading.querySelector('.ai-annotation-toolbar .ai-tool-seg')).left,
        pressedBg: getComputedStyle(pressed).backgroundColor, onBg: [...heading.querySelectorAll('.ai-tool-seg button[aria-pressed="true"], .ai-compare-controls > button[aria-pressed="true"]')].map(b => getComputedStyle(b).backgroundColor), softColor };
    });
    fs.writeFileSync(path.join(evidence, 'toolbar.json'), JSON.stringify(toolbar, null, 2));
    assert.equal(toolbar.frames.length, 4, 'four tool groups: view, zoom, annotation, comment visibility');
    assert.ok(toolbar.frames.every(f => f.radius === '8px' && Math.abs(f.h - 30) <= 1), JSON.stringify(toolbar.frames));
    assert.ok(Math.abs(toolbar.help - (toolbar.center - 8)) <= 1.5, 'zoom group ends 8px left of the centre line: ' + JSON.stringify(toolbar));
    assert.ok(Math.abs(toolbar.annRight - (toolbar.gridRight - 8)) <= 1.5 && toolbar.annLeft > toolbar.center, 'annotation groups sit in the right half, right-aligned');
    assert.equal(toolbar.pressedBg, toolbar.softColor, 'active compare mode uses the soft selected surface');
    assert.ok(toolbar.onBg.length >= 1 && toolbar.onBg.every(bg => bg === toolbar.softColor), 'every pressed tool uses the soft selected surface: ' + JSON.stringify(toolbar.onBg));
    assert.ok(toolbar.headingH <= 42, 'heading keeps its 41px height');
    await geometry('same-ratio');
    assert.equal(await page.locator(`${panel} [data-ai-capture]`).count(), 0);
    // 코멘트 표시 단추는 코멘트 도구 줄(.ai-annotation-toolbar)에 한 개 있다.
    assert.equal(await page.locator(`${panel} [data-ai-comment-visibility]`).count(), 1);
    assert.equal(await page.locator(`${panel} .ai-annotation-toolbar [data-ai-comment-visibility]`).count(), 1);
    // 코멘트 표시는 처음에 꺼져 있다. 단추는 켜고 끄기를 바꾼다.
    assert.equal(await page.locator(panel).getAttribute('data-ai-comments-visible'), 'false');
    await page.click(`${panel} [data-ai-comment-visibility]`);
    assert.equal(await page.locator(panel).getAttribute('data-ai-comments-visible'), 'true');
    await page.click(`${panel} [data-ai-comment-visibility]`);
    assert.equal(await page.locator(panel).getAttribute('data-ai-comments-visible'), 'false');
    // Different aspect ratios share one frame, while each image keeps its own proportions.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 500;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,300,500); ctx.fillStyle = '#222'; ctx.fillRect(30,40,240,420);
      document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').src = canvas.toDataURL();
    });
    await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').naturalWidth === 300);
    await page.click(`${panel} [data-ai-zoom-action="fit"]`);
    await geometry('different-ratio');
    const ratio = await page.locator(`${panel} .is-ai-active-candidate .ai-preview-stage > img`).evaluate(node => node.getBoundingClientRect().width / node.getBoundingClientRect().height);
    assert.ok(Math.abs(ratio - 0.6) < 0.01, 'image content retains its aspect ratio inside the common frame');
    await page.evaluate(() => {
      for (const [selector, width, height, transparent] of [
        ['.is-ai-active-source', 2050, 957, false], ['.is-ai-active-candidate', 1448, 1086, true],
      ]) {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!transparent) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
        ctx.strokeStyle = '#222'; ctx.lineWidth = 8; ctx.strokeRect(width * .3, height * .3, width * .4, height * .4);
        document.querySelector(`#ai-image-panel ${selector} .ai-preview-stage > img`).src = canvas.toDataURL();
      }
    });
    await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').naturalWidth === 1448);
    await page.click(`${panel} [data-ai-zoom-action="fit"]`);
    await geometry('2050x957-1448x1086');
    const content = await page.evaluate(() => [...document.querySelectorAll('#ai-image-panel .is-ai-active-source .ai-preview-stage, #ai-image-panel .is-ai-active-candidate .ai-preview-stage')].map(stage => {
      const frame = stage.getBoundingClientRect(), image = stage.querySelector('img').getBoundingClientRect();
      return { frame: {x:frame.x,y:frame.y,width:frame.width,height:frame.height}, image: {x:image.x,y:image.y,width:image.width,height:image.height} };
    }));
    for (const {frame,image} of content) {
      assert.ok(Math.abs(frame.x + frame.width / 2 - image.x - image.width / 2) < 1);
      assert.ok(Math.abs(frame.y + frame.height / 2 - image.y - image.height / 2) < 1);
      assert.ok(image.width <= frame.width + 1 && image.height <= frame.height + 1);
    }
    const comment = await page.locator(`${panel} .is-ai-active-candidate .ai-comment-marker`).first().evaluate(pin => {
      const image = pin.parentElement.querySelector('img');
      return {x:parseFloat(pin.style.left), y:parseFloat(pin.style.top), expectedX:image.offsetLeft+image.offsetWidth*.25, expectedY:image.offsetTop+image.offsetHeight*.25};
    });
    assert.ok(Math.abs(comment.x - comment.expectedX) < 1 && Math.abs(comment.y - comment.expectedY) < 1, JSON.stringify(comment));
    const screenshot = await page.screenshot();
    const colors = await page.evaluate(async ({png, content}) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const sample = rect => {
        const data = ctx.getImageData(Math.floor((rect.x+3)*devicePixelRatio), Math.floor((rect.y+3)*devicePixelRatio), 40, 1).data;
        return [...new Set(Array.from({length: data.length / 4}, (_, i) => [...data.slice(i*4, i*4+3)].join(',')))];
      };
      return content.map(({frame, image}) => ({frame:sample(frame), image:sample(image)}));
    }, {png:screenshot.toString('base64'),content});
    assert.equal(colors[0].frame.length, 1, 'original aspect-ratio padding is a plain background');
    assert.deepEqual(colors[0].image, ['255,255,255'], 'opaque original stays white');
    assert.ok(colors[1].image.includes('184,190,198') && colors[1].image.includes('159,167,178'), 'transparent output uses both medium gray tones');
    assert.ok(colors[1].image.every(value => [[184,190,198],[159,167,178]].some(expected => value.split(',').every((channel,i) => Math.abs(Number(channel)-expected[i])<=1))), 'only checker tones and one-level rendering rounding are present');
    // 2026-10-12(24219c8a)부터 수정본에서도 점 코멘트를 쓸 수 있다(숨김 규칙 삭제).
    assert.equal(await page.locator(`${panel} [data-ai-comment-tool="point"]`).isVisible(), true,
      'Scoped generated revisions expose point and area comments');
    await page.click(`${panel} [data-ai-comment-tool="area"]`);
    const imageBox = await page.locator(`${panel} .is-ai-active-candidate .ai-preview-stage > img`).boundingBox();
    // Same image-relative 60%,60% origin oracle; real area input also proves extent.
    await page.mouse.move(imageBox.x + imageBox.width * .6, imageBox.y + imageBox.height * .6);
    await page.mouse.down();
    await page.mouse.move(imageBox.x + imageBox.width * .68, imageBox.y + imageBox.height * .68);
    await page.mouse.up();
    const addedComment = await page.evaluate(async () => {
      const snapshot = await window.__task2Manager.sharingSnapshot();
      return snapshot.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0').generated[0].comments.at(-1);
    });
    assert.ok(Math.abs(addedComment.x - 60) < .5 && Math.abs(addedComment.y - 60) < .5, 'comment clicks use actual image coordinates');
    assert.equal(addedComment.type, 'area');
    assert.ok(Math.abs(addedComment.w - 8) < .5 && Math.abs(addedComment.h - 8) < .5,
      'Scoped area extent uses the same real image coordinates');
    const pointApi = await page.evaluate(async () => {
      const url = window.__runtime.base + 'ai-image-comments.js' + window.__runtime.query;
      const { normalizeCommentBox } = await import(url);
      return { url, value: normalizeCommentBox({ type: 'point', x: 60, y: 60, w: 0, h: 0 }),
        coverage: 'actual component point input validation; not selected-output point UI creation' };
    });
    assert.deepEqual(pointApi.value, { x: 60, y: 60, w: 0, h: 0 });
    fs.writeFileSync(path.join(evidence, 'comment-input-contract.json'), JSON.stringify({
      actualUiAction: 'scoped area drag', origin: { x: 60, y: 60 }, extent: { w: 8, h: 8 },
      retiredUiAction: 'selected generated point creation', addedComment, pointApi,
    }, null, 2));
    await page.click(`${panel} [data-ai-comment-tool="pan"]`);
    await page.click(`${panel} [data-ai-zoom-action="in"]`);
    await geometry('linked-zoom');
    assert.equal(await page.evaluate(() => window.__task2.sends.length), 0, 'comparison does not send AI requests');
    assert.deepEqual(errors, []);
  });
}
