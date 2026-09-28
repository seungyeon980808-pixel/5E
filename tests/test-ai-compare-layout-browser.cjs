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
    const evidence = path.join(root, '.omo/evidence/ai-followup-0928/layout', process.env.QA_PHASE || 'green', engine);
    fs.mkdirSync(evidence, { recursive: true });
    const { page, errors } = await fixture(t, 2, evidence);
    const panel = '#ai-image-panel';
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
    await geometry('same-ratio');
    assert.equal(await page.locator(`${panel} [data-ai-capture]`).count(), 0);
    assert.equal(await page.locator(`${panel} .ai-conversation [data-ai-comment-visibility]`).count(), 1);
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
    await page.click(`${panel} [data-ai-comment-tool="point"]`);
    const imageBox = await page.locator(`${panel} .is-ai-active-candidate .ai-preview-stage > img`).boundingBox();
    await page.mouse.click(imageBox.x + imageBox.width * .6, imageBox.y + imageBox.height * .6);
    const addedComment = await page.evaluate(async () => {
      const snapshot = await window.__task2Manager.sharingSnapshot();
      return snapshot.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0').generated[0].comments.at(-1);
    });
    assert.ok(Math.abs(addedComment.x - 60) < .5 && Math.abs(addedComment.y - 60) < .5, 'comment clicks use actual image coordinates');
    await page.click(`${panel} [data-ai-comment-tool="pan"]`);
    await page.click(`${panel} [data-ai-zoom-action="in"]`);
    await geometry('linked-zoom');
    assert.equal(await page.evaluate(() => window.__task2.sends.length), 0, 'comparison does not send AI requests');
    assert.deepEqual(errors, []);
  });
}
