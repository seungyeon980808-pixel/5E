// Fixed label source: 6e2c55012461859cdc8afb4d9596d3f08d5409b4; assertions and fixtures retained.
const { installLabelSourcePage, armSelection, selectionArrived } = require('./helpers/label-source-browser.cjs');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

let preview = process.env.PREVIEW_URL;
let previewServer = null;
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const evidence = process.env.EVIDENCE_DIR || path.resolve(__dirname, '../.omo/evidence/labeler-native-regressions-20261009/inline/runs', runId);

assert.ok(preview, 'A retained PREVIEW_URL is required');

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  test(`inline label bounds follow native text layout in ${name}`, { timeout: 90000 }, async () => {
    const dir = path.join(evidence, name);
    fs.mkdirSync(dir, { recursive: true });
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });await installLabelSourcePage(page);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true'));
      await page.goto(preview + '?mode=pro', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#canvas');
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.evaluate(async () => {
        const v = '?v=1.7.0-four-session-integration';
        const { state, DEFAULT_TEXT_FONT, OBJECT_LABEL_TEXT_FONT_FAMILY } = await import('/js/state.js' + v);
        const { openLabelerTextEditor, startEditingTextObject } = await import('/js/text-editor.js' + v);
        await document.fonts.ready;
        window.__inlineBounds = { state, DEFAULT_TEXT_FONT, OBJECT_LABEL_TEXT_FONT_FAMILY, openLabelerTextEditor, startEditingTextObject };
      });
      const input = page.locator('.ai-inline-label-editor');
      const results = [];
      const object = () => page.evaluate(() => structuredClone(window.__inlineBounds.state.get().objects.find(o => o.id === 'bounds')));
      const load = async (extra = {}, zoom = 1) => {
        await page.evaluate(({ extra, zoom }) => {
          const q = window.__inlineBounds;
          q.state.update(s => {
            s.objects = [
              { id: 'bounds', type: 'labeler', text: '니크롬선 저항판', contentMode: 'plain', labelSize: 3.7,
                fontFamily: q.DEFAULT_TEXT_FONT, p1: { x: 50, y: 40 }, p2: { x: 50, y: 40 },
                layerId: 1, locked: false, strokeWidth: 0.2, ...extra },
              { id: 'untouched', type: 'rect', x: 5, y: 5, w: 5, h: 5, layerId: 1, strokeWidth: 0.2 },
            ];
            s.artboard = { w: 100, h: 80 };
            s.layers = [{ id: 1, visible: true, name: '검수' }];
            s.activeLayerId = 1;
            s.activeTool = 'V';
            s.selectedIds = [];
            s.targetedId = null;
            s.viewBox = { x: 50 - 50 / zoom, y: 40 - 40 / zoom, w: 100 / zoom, h: 80 / zoom };
          });
        }, { extra, zoom });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      const open = async () => {
        await page.evaluate(() => {
          const q = window.__inlineBounds;
          const o = q.state.get().objects.find(o => o.id === 'bounds');
          if (o.type === 'labeler') q.openLabelerTextEditor(o.id);
          else q.startEditingTextObject(o.id);
        });
        await input.waitFor({ state: 'visible' });
      };
      const measure = () => input.evaluate(el => {
        const css = getComputedStyle(el);
        const mirror = document.createElement('span');
        mirror.style.cssText = 'position:absolute;left:-10000px;top:0;display:inline-block;white-space:pre;width:max-content;min-width:0;max-width:none;';
        for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'fontKerning']) mirror.style[property] = css[property];
        document.body.appendChild(mirror);
        const widths = el.value.split('\n').map(line => { mirror.textContent = line; return mirror.getBoundingClientRect().width; });
        mirror.remove();
        const rect = el.getBoundingClientRect();
        return { text: el.value, width: rect.width, nativeTextWidth: Math.max(0, ...widths), rows: el.rows,
          fontSize: parseFloat(css.fontSize), fontFamily: css.fontFamily, letterSpacing: css.letterSpacing,
          paddingRight: parseFloat(css.paddingRight), minWidth: parseFloat(css.minWidth), scrollLeft: el.scrollLeft,
          left: rect.left, right: rect.right, top: rect.top, height: rect.height };
      });
      const assertFits = async scenario => {
        const bounds = await measure();
        results.push({ scenario, ...bounds });
        fs.writeFileSync(path.join(dir, 'bounds.json'), JSON.stringify({ results, errors }, null, 2));
        const excess = bounds.width - bounds.nativeTextWidth;
        assert.ok(excess >= 1 && excess <= 3.25, `${scenario}: ${JSON.stringify(bounds)}`);
        assert.equal(bounds.paddingRight, 0, 'the native box must not add a second em-based insertion zone');
        assert.equal(bounds.minWidth, 0, 'short labels must not inherit the shared overlay minimum');
        assert.equal(bounds.scrollLeft, 0, 'end-caret focus must not scroll or clip a fitted label');
        return bounds;
      };

      // Exercise the real single-click wiring once; bounds cases then use the
      // same exported module to isolate sizing from selection/hit-test changes.
      await load({ fontFamily: '"IBM Plex Sans KR", sans-serif' });
      const glyph = await page.locator('#scene [data-id="bounds"] text').first().evaluate(el => {
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      await page.mouse.click(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2);
      assert.equal(await input.count(), 0, 'first click selects without starting text input');
      await page.mouse.click(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2);
      await input.waitFor({ state: 'visible' });
      const clicked = await assertFits('single-click Korean label');
      await page.screenshot({ path: path.join(dir, 'single-click.png') });
      assert.equal(clicked.text, '니크롬선 저항판');

      // A click on the end caret inserts adjacent text, never padding spaces.
      await page.mouse.click(clicked.right - 1, clicked.top + clicked.height / 2);
      assert.equal(await input.inputValue(), '니크롬선 저항판');
      assert.equal(await input.evaluate(el => el.selectionStart), '니크롬선 저항판'.length);
      await page.keyboard.type('X');
      assert.equal(await input.inputValue(), '니크롬선 저항판X');
      await assertFits('typing at end caret');
      await input.press('Escape');
      assert.equal((await object()).text, '니크롬선 저항판');

      for (const [scenario, extra, zoom] of [
        ['default Korean font', {}, 1],
        ['zoomed Korean label', {}, 1.5],
        ['small short label', { text: 'A', labelSize: 1.5 }, 0.6],
        ['serif Korean label', { fontFamily: 'serif', labelSize: 4.2 }, 1],
        ['tracked Korean label', { letterSpacing: 0.08 }, 1],
        ['multiline label', { text: '니크롬선\n저항판' }, 1],
        ['formula source', { text: 'm_B', source: 'm_B', rawSource: 'm_B', contentMode: 'formula' }, 1.3],
        ['legacy AI text', { type: 'text', x: 35, y: 30, fontSize: 3.7, aiAutoLabel: true, aiParentImageId: 'image' }, 1],
        ['legacy AI formula', { type: 'formula', x: 35, y: 30, fontSize: 3.7, source: 'V_0', rawSource: 'V_0',
          contentMode: 'formula', aiAutoLabel: true, aiParentImageId: 'image' }, 1],
      ]) {
        await load(extra, zoom);
        await open();
        await assertFits(scenario);
        if (scenario === 'default Korean font') await page.screenshot({ path: path.join(dir, 'default-font.png') });
        assert.equal(await input.evaluate(el => el.rows), (await input.inputValue()).split('\n').length);
        await input.press('Escape');
      }

      await load();
      await open();
      const before = await object();
      await page.evaluate(() => {
        window.__inlineBounds.projection = document.querySelector('#scene [data-id="untouched"]');
        window.__inlineBounds.inspector = document.querySelector('.insp-layer-row');
      });
      assert.equal(await page.evaluate(() => !!window.__inlineBounds.projection && !!window.__inlineBounds.inspector), true,
        'the performance check must observe real scene and inspector elements');
      await input.fill('더 길어진 니크롬선 저항판');
      const longer = await assertFits('content grows');
      await input.fill('저항');
      const shorter = await assertFits('content shrinks');
      assert.ok(shorter.width < longer.width / 2, 'deletion must shrink the editor to the new native text');
      assert.equal(await page.evaluate(() => window.__inlineBounds.projection === document.querySelector('#scene [data-id="untouched"]')), true,
        'native text input must preserve unchanged scene elements');
      assert.equal(await page.evaluate(() => window.__inlineBounds.inspector === document.querySelector('.insp-layer-row')), true,
        'native text input must preserve the inspector projection');
      await input.fill('');
      await assertFits('empty input retains only caret room');
      await input.press('Escape');
      assert.deepEqual(await object(), before, 'cancel leaves the committed label intact');

      // Former em-sized empty hit space is canvas space: typing there cannot
      // append characters to the label or silently manufacture whitespace.
      await open();
      const bounds = await assertFits('outside-click boundary');
      assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.matches('.ai-inline-label-editor') || false,
        { x: bounds.right + 10, y: bounds.top + bounds.height / 2 }), false, 'former trailing em space must be outside the native editor');
      await page.mouse.click(bounds.right + Math.max(50, bounds.fontSize * 2), bounds.top + bounds.height / 2);
      await input.waitFor({ state: 'detached' });
      await page.keyboard.type('X');
      assert.equal((await object()).text, before.text);
      assert.equal(await input.count(), 0);

      // Model a busy event loop: the first-click task must not revive its
      // inline editor after the second press opened detailed editing and Esc
      // closed it. A stale editor can otherwise intercept the next label.
      await load({ fontFamily: '"IBM Plex Sans KR", sans-serif' });
      await page.evaluate(() => {
        const nativeTimeout = window.setTimeout;
        window.__inlineBounds.nativeTimeout = nativeTimeout;
        window.__inlineBounds.delayedCallbacks = new Map();
        window.__inlineBounds.nativeClearTimeout = window.clearTimeout;
        let serial = -1;
        window.setTimeout = (callback, delay, ...args) => {
          if (delay !== 0) return nativeTimeout(callback, delay, ...args);
          const id = serial--;
          window.__inlineBounds.delayedCallbacks.set(id, () => callback(...args));
          return id;
        };
        window.clearTimeout = id => {
          window.__inlineBounds.delayedCallbacks.delete(id);
          window.__inlineBounds.nativeClearTimeout.call(window, id);
        };
      });
      try {
        const target = await page.locator('#scene [data-id="bounds"] text').first().evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
        await page.mouse.dblclick(target.x, target.y);
        await page.evaluate(() => window.__inlineBounds.openLabelerTextEditor('bounds', null, { detailed: true }));
        await page.locator('.unified-text-editor').waitFor({ state: 'visible' });
        await page.locator('.unified-text-editor textarea').press('Escape');
        await page.evaluate(() => {
          const callbacks = [...window.__inlineBounds.delayedCallbacks.values()];
          window.__inlineBounds.delayedCallbacks.clear();
          callbacks.forEach(callback => callback());
        });
        assert.equal(await input.count(), 0, 'a cancelled first click must not reopen inline editing');
        assert.equal(await page.locator('.unified-text-editor').count(), 0);
      } finally {
        await page.evaluate(() => { window.setTimeout = window.__inlineBounds.nativeTimeout; window.clearTimeout = window.__inlineBounds.nativeClearTimeout; });
      }

      // Hold the opening caret frame while native select-all occurs, as can
      // happen between WebKit fill's selection and insertion protocol steps.
      await load({ text: 'm_B', source: 'm_B', rawSource: 'm_B', contentMode: 'formula' });
      await page.evaluate(() => {
        const nativeFrame = window.requestAnimationFrame;
        window.__inlineBounds.nativeFrame = nativeFrame;
        window.__inlineBounds.caretFrames = [];
        window.requestAnimationFrame = callback => {
          window.__inlineBounds.caretFrames.push(callback);
          return nativeFrame(() => {});
        };
      });
      try {
        const target = await page.locator('#scene [data-id="bounds"] text').first().evaluate(el => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width * 0.15, y: rect.y + rect.height / 2 };
        });
        await page.mouse.click(target.x, target.y);
        await page.mouse.click(target.x, target.y);
        await input.waitFor({ state: 'visible' });
        await input.evaluate(el => el.setSelectionRange(0, el.value.length));
        await page.evaluate(() => {
          window.requestAnimationFrame = window.__inlineBounds.nativeFrame;
          window.__inlineBounds.caretFrames.splice(0).forEach(callback => callback(performance.now()));
        });
        assert.deepEqual(await input.evaluate(el => [el.selectionStart, el.selectionEnd]), [0, 3], 'initial caret placement must preserve native select-all');
        await page.keyboard.insertText('m_C');
        assert.equal(await input.inputValue(), 'm_C', 'native replacement must not prepend to the old formula source');
        await input.press('Escape');
      } finally {
        await page.evaluate(() => { window.requestAnimationFrame = window.__inlineBounds.nativeFrame; });
      }

      await load({ text: 'm_B', source: 'm_B', rawSource: 'm_B', contentMode: 'formula' });
      await open();
      await input.fill('m_C');
      await assertFits('formula source update');
      await input.press('Enter');
      const committed = await object();
      assert.equal(committed.contentMode, 'formula');
      assert.equal(committed.source, 'm_C');
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(dir, 'bounds.json'), JSON.stringify({ results, errors }, null, 2));
    } finally {
      await browser.close();
    }
  });
}
