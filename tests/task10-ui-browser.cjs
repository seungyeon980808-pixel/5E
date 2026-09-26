const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:18810/preview/';
const evidenceDir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/task10');
fs.mkdirSync(evidenceDir, { recursive: true });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pageData(id, name, objects, guides) {
  return {
    id, name, meta: { number: '', points: '' }, objects, guides,
    artboard: { w: 90, h: 60 },
    layers: [1, 2, 3].map(layerId => ({ id: layerId, name: `레이어 ${layerId}`, visible: true })),
  };
}

const imageSource = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLQkwAAAABJRU5ErkJggg==';
const projectA = {
  pages: [
    pageData('A1', '복구할 도면 A', [
      { id: 'line-a', type: 'line', layerId: 1, p1: { x: 1, y: 2 }, p2: { x: 30, y: 20 } },
      { id: 'image-a', type: 'image', layerId: 1, x: 4, y: 6, w: 12, h: 8, src: imageSource, opacity: 1 },
    ], [{ id: 'guide-a', axis: 'x', position: 7 }]),
    pageData('A2', '복구할 도면 A 2쪽', [
      { id: 'line-a2', type: 'line', layerId: 1, p1: { x: 2, y: 3 }, p2: { x: 18, y: 24 } },
    ], [{ id: 'guide-a2', axis: 'y', position: 11 }]),
  ],
  activePageId: 'A1',
};

async function waitFrames(page, count) {
  await page.evaluate(frameCount => new Promise(resolve => {
    let remaining = frameCount;
    const next = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), count);
}

async function resetDatabases(page) {
  await page.evaluate(async () => {
    for (const name of ['5e-preview-autosave', '5e-autosave']) {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
        request.onblocked = resolve;
      });
    }
  });
}

async function setProject(page, project) {
  await page.evaluate(async payload => {
    const { state } = await import('./js/state.js?v=1.6.0-preview-labeler-0917-1111');
    const active = payload.pages.find(candidate => candidate.id === payload.activePageId);
    state.update(current => {
      current.pages = structuredClone(payload.pages);
      current.activePageId = payload.activePageId;
      current.objects = structuredClone(active.objects);
      current.guides = structuredClone(active.guides);
      current.layers = structuredClone(active.layers);
      current.artboard = structuredClone(active.artboard);
      current.activeLayerId = 1;
      current.selectedIds = [];
      current.selectedGuideId = null;
      current.undoStack = [];
      current.redoStack = [];
    });
  }, project);
}

async function projectSnapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('./js/state.js?v=1.6.0-preview-labeler-0917-1111');
    const { serialize } = await import('./js/project-io.js?v=1.6.0-preview-lite-hybrid-0922');
    const data = serialize(state.get());
    return { pages: data.pages, activePageId: data.activePageId };
  });
}

async function dismissTutorial(page) {
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function run() {
  const report = {
    passed: false,
    base,
    browser: null,
    diagnostics: [],
    accessibility: {},
    recovery: {},
    focus: {},
    mobile: {},
    teardown: {},
  };
  const browser = await chromium.launch({ headless: false });
  report.browser = browser.version();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      serviceWorkers: 'block',
      locale: 'ko-KR',
    });
    context.on('page', candidate => {
      candidate.on('pageerror', error => report.diagnostics.push({ kind: 'pageerror', message: error.message }));
      candidate.on('console', message => {
        if (message.type() === 'error') report.diagnostics.push({ kind: 'console', message: message.text() });
      });
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin || url.protocol === 'data:' || url.protocol === 'blob:') {
        return route.continue();
      }
      report.diagnostics.push({ kind: 'blocked-network', origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient');
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      } catch {}
    });
    const page = await context.newPage();
    await page.goto(`${base}?mode=pro&mobile=0`);
    await dismissTutorial(page);
    await resetDatabases(page);
    await page.reload();
    await dismissTutorial(page);
    await setProject(page, projectA);

    await page.locator('#mode-toggle-btn').click();
    const modeDialog = page.locator('.mode-switch-dialog [role="alertdialog"]');
    await modeDialog.waitFor();
    report.accessibility.modeDialog = await modeDialog.ariaSnapshot();
    assert.match(report.accessibility.modeDialog, /^- alertdialog "Lite로 전환":/);
    assert.match(report.accessibility.modeDialog, /현재 작업을 이어서 사용할까요/);
    assert.equal(await modeDialog.getAttribute('aria-labelledby') !== null, true);
    assert.equal(await modeDialog.getAttribute('aria-describedby') !== null, true);
    assert.equal(await modeDialog.locator('button:focus').count(), 0);
    await page.keyboard.press('Enter');
    assert.equal(await modeDialog.isVisible(), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '취소');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
    await page.locator('#mode-toggle-btn').click();
    await modeDialog.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');

    const beforeFailure = await projectSnapshot(page);
    await page.evaluate(() => {
      window.__task10Open = indexedDB.open.bind(indexedDB);
      indexedDB.open = () => { throw new Error('forced checkpoint failure'); };
    });
    await page.locator('#mode-toggle-btn').click();
    await page.getByRole('button', { name: '새 작업으로 전환', exact: true }).click();
    await page.getByText('모드 전환 실패', { exact: true }).waitFor();
    assert.deepEqual(await projectSnapshot(page), beforeFailure);
    assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
    await page.getByRole('button', { name: '확인', exact: true }).click();
    await page.evaluate(() => {
      indexedDB.open = window.__task10Open;
      delete window.__task10Open;
    });
    report.recovery.failureRefusedSwitch = true;

    await page.locator('#mode-toggle-btn').click();
    await page.getByRole('button', { name: '새 작업으로 전환', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.mode === 'lite');
    await page.waitForFunction(() => !document.documentElement.classList.contains('mode-transition'));
    const projectB = {
      pages: [pageData('B1', '새 도면 B', [
        { id: 'line-b', type: 'line', layerId: 1, p1: { x: 1, y: 1 }, p2: { x: 8, y: 8 } },
      ], [])],
      activePageId: 'B1',
    };
    await setProject(page, projectB);
    for (let save = 1; save <= 9; save += 1) {
      await page.evaluate(value => {
        window.dispatchEvent(new Event('keydown'));
        return import('./js/state.js?v=1.6.0-preview-labeler-0917-1111').then(({ state }) => {
          state.update(current => { current.objects[0].p1.x = value; });
          window.dispatchEvent(new Event('pagehide'));
        });
      }, save);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(300);
    await page.reload();

    const recoveryDialog = page.locator('.recovery-checkpoint-dialog [role="dialog"]');
    await recoveryDialog.waitFor();
    report.accessibility.recoveryDialog = await recoveryDialog.ariaSnapshot();
    assert.match(report.accessibility.recoveryDialog, /보관된 작업 복구/);
    assert.match(report.accessibility.recoveryDialog, /복구할 도면 A/);
    assert.match(report.accessibility.recoveryDialog, /2쪽/);
    assert.equal(await recoveryDialog.locator('input:checked').count(), 1);
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(evidenceDir, 'recovery-dialog.png') });
    await page.getByRole('button', { name: '선택한 작업 복구', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.recovery-checkpoint-dialog'));
    await page.waitForTimeout(350);
    assert.equal(await page.getByText('작업 복구', { exact: true }).count(), 0);
    const restored = await projectSnapshot(page);
    assert.equal(restored.pages.length, 2);
    assert.equal(restored.pages[0].name, '복구할 도면 A');
    assert.equal(restored.pages[0].objects.some(object => object.id === 'image-a'), true);
    assert.equal(restored.pages[0].guides.some(guide => guide.id === 'guide-a'), true);
    assert.equal(restored.pages[1].objects.some(object => object.id === 'line-a2'), true);
    report.recovery.restored = clone(restored);

    await page.locator('#mode-toggle-btn').click();
    const keepDialog = page.locator('.mode-switch-dialog [role="alertdialog"]');
    await keepDialog.waitFor();
    const keepSnapshot = await keepDialog.ariaSnapshot();
    assert.match(keepSnapshot, /^- alertdialog "Pro로 전환":/);
    await page.getByRole('button', { name: '유지하고 전환', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.mode === 'pro');
    await page.waitForFunction(() => !document.documentElement.classList.contains('mode-transition'));
    assert.deepEqual(await projectSnapshot(page), restored);
    report.accessibility.keepDialog = keepSnapshot;

    const canvas = page.locator('#canvas');
    const initialOutline = await canvas.evaluate(element => getComputedStyle(element).outlineStyle);
    assert.equal(initialOutline, 'none');
    await page.locator('#mode-toggle-btn').focus();
    let tabCount = 0;
    while (tabCount < 50 && await page.evaluate(() => document.activeElement?.id) !== 'canvas') {
      await page.keyboard.press('Tab');
      tabCount += 1;
    }
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'canvas');
    const keyboardOutline = await canvas.evaluate(element => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
    });
    assert.equal(keyboardOutline.style, 'solid');
    assert.equal(keyboardOutline.width, '3px');
    await page.screenshot({ path: path.join(evidenceDir, 'canvas-keyboard-focus.png') });
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const pointerOutline = await canvas.evaluate(element => ({
      style: getComputedStyle(element).outlineStyle,
      pointerClass: element.classList.contains('pointer-focused'),
    }));
    assert.equal(pointerOutline.pointerClass, true);
    assert.equal(pointerOutline.style, 'none');
    report.focus = { initialOutline, tabCount, keyboardOutline, pointerOutline };
    await context.close();

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
      hasTouch: true,
      isMobile: true,
    });
    await mobileContext.addInitScript(() => {
      try {
        localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
        localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      } catch {}
      const original = window.requestAnimationFrame.bind(window);
      window.__task10RefreshFrames = 0;
      window.requestAnimationFrame = callback => original(time => {
        if (callback?.name === 'refreshZoomReadout') window.__task10RefreshFrames += 1;
        callback(time);
      });
    });
    const mobile = await mobileContext.newPage();
    await mobile.goto(`${base}?mobile=1`);
    await waitFrames(mobile, 120);
    const hidden = await mobile.evaluate(() => ({
      width: document.getElementById('canvas').getBoundingClientRect().width,
      refreshFrames: window.__task10RefreshFrames,
    }));
    assert.equal(hidden.width, 0);
    assert.equal(hidden.refreshFrames, 0);
    await mobile.screenshot({ path: path.join(evidenceDir, 'mobile-hidden-390x844.png') });
    await mobile.evaluate(() => {
      const readout = document.getElementById('zoom-readout');
      window.__task10ZoomMutations = 0;
      new MutationObserver(() => { window.__task10ZoomMutations += 1; })
        .observe(readout, { childList: true, characterData: true, subtree: true });
      document.documentElement.classList.remove('mobile-image-mode');
    });
    await mobile.waitForFunction(() => document.getElementById('canvas').getBoundingClientRect().width > 0);
    await mobile.waitForFunction(() => document.getElementById('zoom-readout').textContent !== 'zoom 0.00×');
    const reveal = await mobile.evaluate(() => ({
      width: document.getElementById('canvas').getBoundingClientRect().width,
      zoom: document.getElementById('zoom-readout').textContent,
      mutations: window.__task10ZoomMutations,
    }));
    await waitFrames(mobile, 20);
    assert.equal(await mobile.evaluate(() => window.__task10ZoomMutations), reveal.mutations);
    await mobile.setViewportSize({ width: 420, height: 844 });
    await mobile.waitForFunction(previous => window.__task10ZoomMutations > previous, reveal.mutations);
    const resized = await mobile.evaluate(() => ({
      width: document.getElementById('canvas').getBoundingClientRect().width,
      zoom: document.getElementById('zoom-readout').textContent,
      mutations: window.__task10ZoomMutations,
    }));
    report.mobile = { hidden, reveal, resized };
    await mobile.screenshot({ path: path.join(evidenceDir, 'mobile-revealed-resized.png') });
    await mobileContext.close();

    assert.deepEqual(report.diagnostics.filter(item => item.kind === 'pageerror'), []);
    report.passed = true;
  } finally {
    await browser.close();
    report.teardown = { browserClosed: true, serverOwnedByHarness: false, profile: 'ephemeral Playwright contexts closed' };
    fs.writeFileSync(path.join(evidenceDir, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
