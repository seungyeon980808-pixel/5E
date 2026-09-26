const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/';
const removedControls = [
  'open-defaults',
  'settings-export',
  'settings-import',
  'open-shortcuts',
  'exam-library-open',
  'image-objectify-open',
  'ai-image-install-open',
];

(async () => {
  for (const [engineName, engine] of [['Chromium', chromium], ['WebKit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const platform of ['mac', 'windows']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(value => {
          localStorage.setItem('5e.preview:5e.shortcutPlatform', value);
        }, platform);
        await page.goto(`${base}?mode=pro&mobile=0`);
        await page.locator('#object-search-title').waitFor({ state: 'attached' });

        const modifier = platform === 'mac' ? 'Meta' : 'Control';
        await page.keyboard.press(`${modifier}+f`);
        await page.locator('#object-search-title').waitFor({ state: 'visible' });
        assert.ok(await page.locator('#object-search-title').locator('..').locator('input').getAttribute('aria-activedescendant'));
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#object-search-title').isVisible(), false);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'canvas');
        await page.keyboard.press(`${modifier}+Alt+f`);
        assert.equal(await page.locator('#object-search-title').isVisible(), false);

        await page.keyboard.press(`${modifier}+k`);
        await page.locator('#command-palette-title').waitFor({ state: 'visible' });
        assert.ok(await page.locator('#command-palette-title').locator('..').locator('input').getAttribute('aria-activedescendant'));
        const input = page.locator('#command-palette-title').locator('..').locator('input');
        for (const command of ['라이브러리', '이미지 객체화', 'AI 이미지 변환', '기본값', '설정 저장하기', '설정 불러오기', '단축키 도움말']) {
          await input.fill(command);
          assert.equal(await page.getByRole('option', { name: new RegExp(command) }).first().isVisible(), true, command);
        }
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'canvas');

        const hits = await page.evaluate(({ platform, ids }) => {
          const counts = Object.fromEntries(ids.map(id => [id, 0]));
          for (const id of ids) {
            document.getElementById(id).addEventListener('click', () => { counts[id]++; });
          }
          for (const key of ['d', 'b', 'r', 'k', 'l', 't', 'a']) {
            document.dispatchEvent(new KeyboardEvent('keydown', {
              key,
              code: `Key${key.toUpperCase()}`,
              ctrlKey: platform === 'windows',
              metaKey: platform === 'mac',
              altKey: true,
              shiftKey: true,
              bubbles: true,
              cancelable: true,
            }));
          }
          return counts;
        }, { platform, ids: removedControls });
        assert.ok(Object.values(hits).every(count => count === 0), `${engineName}/${platform}: ${JSON.stringify(hits)}`);
        await page.evaluate(() => { document.getElementById('open-screen').click(); document.getElementById('canvas').focus(); });
        await page.keyboard.press(`${modifier}+f`);
        assert.equal(await page.locator('#object-search-title').isVisible(), false, 'search must not stack over settings');
        assert.deepEqual(errors, [], `${engineName}/${platform} page errors`);
        console.log(`${engineName}/${platform}: search, commands, removed chords PASS`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
