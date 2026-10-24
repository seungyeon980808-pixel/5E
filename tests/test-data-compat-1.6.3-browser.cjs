// 정식 1.6.3 사용자가 1.7.0으로 업데이트해도 저장해 둔 데이터가 그대로인지 확인한다.
// 고정 자료(tests/fixtures/data-compat-1.6.3)는 실제 1.6.3을 띄워 만든 것이다(generate-fixture.cjs).
//  ① 브라우저 저장소(localStorage·IndexedDB)를 그대로 넣고 1.7.0을 연다 → 자동 저장 복구로 그림 두 쪽,
//     설정(화면 색·과목·화면 크기·도구 기본값·격자), 내 오브젝트, AI 작업대 기록이 그대로인지.
//  ② 1.6.3이 저장한 프로젝트 파일(.5e, JSON)을 1.7.0 [파일 → 열기]로 연다.
//  ③ 1.6.3 설정 백업(ZIP)을 1.7.0 [설정 → 불러오기]로 복원한다(설정 + 내 오브젝트 + 그림).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { withServer } = require('./helpers/rhwp-exam.cjs');
const { dumpInPage, restoreInPage } = require('./fixtures/data-compat-1.6.3/storage-dump.cjs');

const fixtureDir = path.join(__dirname, 'fixtures/data-compat-1.6.3');
const storage = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'storage.json'), 'utf8'));
const projectFile = path.join(fixtureDir, 'project-1.6.3.5e');
const backupFile = path.join(fixtureDir, 'settings-backup-1.6.3.zip');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/data-compat-1.6.3');
fs.mkdirSync(evidence, { recursive: true });

const db = name => storage.indexedDB.find(entry => entry.name === name);
const records = (dbName, storeName) => db(dbName).stores.find(store => store.name === storeName).records;
const autosaved = records('5e-preview-autosave', 'snapshots').at(-1).value.data;
const personalObjects = records('5e.preview:5e-store', 'kv').find(record => record.key === '5e.personalObjects').value;
const aiWorkspace = records('5e.preview:5e-ai-image-tasks', 'tasks').find(record => record.key === 'workspace').value;
const savedProject = JSON.parse(fs.readFileSync(projectFile, 'utf8'));

// 1.6.3이 저장한 필드는 1.7.0에서도 같은 값이어야 한다(1.7.0이 새 필드를 더하는 것은 괜찮다).
function assertContains(actual, expected, where) {
  if (expected === null || typeof expected !== 'object') return assert.deepEqual(actual, expected, where);
  assert.ok(actual && typeof actual === 'object', `${where}: 값이 사라졌다`);
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where}: 배열이 아니다`);
    assert.equal(actual.length, expected.length, `${where}: 개수가 다르다`);
  }
  for (const key of Object.keys(expected)) assertContains(actual[key], expected[key], `${where}.${key}`);
}

// AI 작업대 기록은 1.7.0이 부팅 중 언제든 화면 상태로 탭을 다시 저장한다(js/ai-panel.js captureActiveTaskTab).
// 느린 컴퓨터에서는 검사 도중에 다시 저장되므로, 원래 그대로이거나 1.7.0이 의도해 바꾼 모양이어야 한다.
//  - 빈 선택은 ''·null·없음을 같은 "선택 없음"으로 본다(1.7.0은 selectedCandidateId ''→null로 저장, 복원 때 둘 다 falsy).
//  - 보기 상태(workbenchViewState·commentViewState: 확대·스크롤·배치·주석 도구)는 화면에서 다시 읽으므로 선택값만 본다.
//  - 표시선 선택(markPolicy)은 1.7.0이 복원 때 화살표 remove가 아니면 keep, 직접 고른 표시(markPolicyChosen)가 없으면
//    지시선 keep으로 바꾼다(js/ai-panel.js restoreMarkPolicy). 사용자 선택이 바뀌는 점은 docs에 보고했다.
//  - 1.7.0이 새로 더한 필드는 괜찮다.
const VIEW_STATE_KEYS = new Set(['workbenchViewState', 'commentViewState']);
const isEmpty = value => value === '' || value === null || value === undefined;
function assertSameOrEmpty(actual, expected, where) {
  if (isEmpty(expected) && isEmpty(actual)) return;
  if (expected === null || typeof expected !== 'object') return assert.deepEqual(actual, expected, where);
  assert.ok(actual && typeof actual === 'object', `${where}: 값이 사라졌다`);
  if (Array.isArray(expected)) assert.equal(actual.length, expected.length, `${where}: 개수가 다르다`);
  for (const key of Object.keys(expected)) assertSameOrEmpty(actual[key], expected[key], `${where}.${key}`);
}
function migratedMarkPolicy(tab) {
  const policy = tab.markPolicy || {};
  return { ...policy, arrows: policy.arrows === 'remove' ? 'remove' : 'keep', leaders: tab.markPolicyChosen ? policy.leaders : 'keep' };
}
function assertAiWorkspace(actual, expected, where) {
  const { tabs, ...rest } = expected;
  assertSameOrEmpty(actual, rest, where);
  assert.equal(actual.tabs?.length, tabs.length, `${where}: 작업 탭 개수`);
  tabs.forEach((tab, index) => {
    const now = actual.tabs[index], at = `${where}.tabs.${index}`;
    for (const [key, value] of Object.entries(tab)) {
      if (VIEW_STATE_KEYS.has(key) || key === 'markPolicy') continue;
      assertSameOrEmpty(now[key], value, `${at}.${key}`);
    }
    for (const key of ['selectedCandidateId', 'selectedSourceId']) {
      assertSameOrEmpty(now.workbenchViewState?.[key], tab.workbenchViewState?.[key], `${at}.workbenchViewState.${key}`);
    }
    if (tab.markPolicy !== undefined) {
      const options = [tab.markPolicy, migratedMarkPolicy(tab)];
      assert.ok(options.some(policy => { try { assertSameOrEmpty(now.markPolicy, policy, ''); return true; } catch { return false; } }),
        `${at}.markPolicy: ${JSON.stringify(now.markPolicy)}는 원래 값이나 1.7.0 변환 값(${JSON.stringify(options[1])})이어야 한다`);
    }
  });
}

// 1.6.3 그림(pages)을 1.7.0이 지금 들고 있는 그림과 비교한다. 1.7.0의 직렬화로 모든 쪽을 꺼낸다.
async function assertDrawing(page, expected, where) {
  const actual = await page.evaluate(async () => {
    const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
    const [{ state }, { serialize }] = await Promise.all([import(stateUrl), import(stateUrl.replace('/state.js', '/project-io.js'))]);
    return JSON.parse(JSON.stringify(serialize(state.get())));
  });
  assert.deepEqual(actual.pages.map(p => p.objects.length), expected.pages.map(p => p.objects.length), `${where}: 쪽별 그림 개수`);
  assertContains(actual.pages, expected.pages, `${where}.pages`);
  assert.equal(actual.activePageId, expected.activePageId, `${where}: 열려 있던 쪽`);
  return actual;
}

const appState = page => page.evaluate(async () => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
  return JSON.parse(JSON.stringify((await import(stateUrl)).state.get()));
});

function entryUrl(origin) {
  return process.env.PREVIEW_URL || new URL(process.env.APP_ENTRY || '/', origin).href;
}

async function newContext(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
  // 앱 스크립트가 없는 같은 출처의 빈 페이지 — 여기서 1.6.3 저장소를 되살린다.
  await context.route(`${origin}/__data-compat-seed`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  const blocked = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['http:', 'https:'].includes(url.protocol) || ['127.0.0.1', 'localhost'].includes(url.hostname)) return route.fallback();
    blocked.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
  return { context, page, errors, dialogs, blocked };
}

async function openApp(page, origin) {
  await page.goto(`${entryUrl(origin)}?mode=pro&mobile=0`, { waitUntil: 'load' });
  await page.locator('#canvas').waitFor({ state: 'visible' });
}

const modal = (page, text) => page.locator('.modal-overlay:not([hidden])').filter({ hasText: text }).last();

// ① 1.6.3 브라우저 저장소 그대로 → 1.7.0
async function storageUpdate(browser, origin, engine) {
  const { context, page, errors } = await newContext(browser, origin);
  try {
    await page.goto(`${origin}/__data-compat-seed`);
    await page.evaluate(restoreInPage, storage);
    await openApp(page, origin);

    // 자동 저장 복구: 1.6.3이 남긴 스냅샷을 알아보고 묻는다.
    const recovery = modal(page, '이전에 작업하던 도해가 남아 있습니다');
    await recovery.waitFor({ timeout: 20_000 });
    await page.screenshot({ path: path.join(evidence, `${engine}-1-recovery-prompt.png`) });
    await recovery.getByRole('button', { name: '복구', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length >= 6, null, { timeout: 15_000 });
    const restored = await assertDrawing(page, autosaved, '자동 저장 복구');
    await page.screenshot({ path: path.join(evidence, `${engine}-2-recovered.png`) });

    // 1.7.0이 부팅·복구하면서 1.6.3 저장소를 지우거나 바꾸지 않았다.
    const after = await page.evaluate(dumpInPage);
    for (const [key, value] of Object.entries(storage.localStorage)) assert.equal(after.localStorage[key], value, `localStorage ${key}가 그대로여야 한다`);
    for (const database of storage.indexedDB) {
      const now = after.indexedDB.find(entry => entry.name === database.name);
      assert.ok(now, `IndexedDB ${database.name}가 남아 있어야 한다`);
      assert.equal(now.version, database.version, `IndexedDB ${database.name} 버전`);
      for (const store of database.stores) {
        const current = now.stores.find(entry => entry.name === store.name);
        assert.ok(current, `${database.name}/${store.name} 저장소가 남아 있어야 한다`);
        for (const record of store.records) {
          const match = current.records.find(entry => JSON.stringify(entry.key) === JSON.stringify(record.key));
          assert.ok(match, `${database.name}/${store.name}/${JSON.stringify(record.key)} 기록이 남아 있어야 한다`);
          const where = `${database.name}/${store.name}/${JSON.stringify(record.key)}`;
          if (database.name === '5e.preview:5e-ai-image-tasks' && record.key === 'workspace') assertAiWorkspace(match.value, record.value, where);
          else assertContains(match.value, record.value, where);
        }
      }
    }

    // 설정: 화면 색 화이트, 과목 화학, 화면 크기 110%, 격자 간격 5mm(도구 기본값에 저장된 값)
    const settings = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      colorMode: document.getElementById('theme-toggle')?.dataset.colorMode,
      subject: document.documentElement.dataset.subject,
      subjectTab: document.querySelector('#subject-switch [aria-selected="true"]')?.dataset.subject,
      screen: document.documentElement.dataset.screen,
    }));
    assert.deepEqual(settings, { theme: 'light', colorMode: 'white', subject: 'c', subjectTab: 'c', screen: 'wide' }, '1.6.3 설정이 1.7.0 화면에 반영된다');
    assert.equal((await appState(page)).grid.interval, 5, '1.6.3 도구 기본값의 격자 간격');

    // 내 오브젝트(라이브러리): 1.6.3에서 저장한 "1.6.3 상자"를 눌러 캔버스에 넣는다.
    const before = await appState(page);
    // 10-24 시안 20: 내 오브젝트는 아래 「오브젝트」 탭 → 오브젝트 창 「내 오브젝트」 탭에서 카드를 눌러 넣는다.
    await page.locator('#object-window-open').click();await page.locator('.ow [data-ow-tab="mine"]').click();
    const category = page.locator('.ow-grp').filter({ has: page.locator('h3', { hasText: personalObjects[0].category }) });
    await category.waitFor();
    await category.locator('.ow-card', { hasText: personalObjects[0].name }).locator('[data-ow-mine-pick]').click();
    await page.locator('.ow-back').waitFor({ state: 'hidden' });
    let state = await appState(page);
    const inserted = state.objects.filter(object => !before.objects.some(existing => existing.id === object.id));
    const { id, order, x, y, ...shape } = personalObjects[0].objects[0];
    assert.equal(inserted.length, 1, '내 오브젝트 하나가 들어간다');
    assertContains(inserted[0], shape, '내 오브젝트 삽입');

    // 도구 기본값(선 굵기 0.35mm)이 새 사각형에 적용된다.
    await page.locator('#canvas').click({ position: { x: 20, y: 20 } });
    await page.keyboard.press('Escape');
    await page.locator('[data-tool="RECT"]:visible').click();
    await page.mouse.move(330, 650); await page.mouse.down(); await page.mouse.move(430, 720, { steps: 6 }); await page.mouse.up();
    state = await appState(page);
    const drawn = state.objects.at(-1);
    assert.equal(drawn.type, 'rect');
    assert.equal(drawn.strokeWidth, 0.35, '1.6.3 도구 기본값의 선 굵기');
    await page.screenshot({ path: path.join(evidence, `${engine}-3-library-defaults.png`) });

    // AI 작업대 기록(작업 1)이 1.7.0 저장소에서도 읽힌다.
    const workspace = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => { const r = indexedDB.open('5e.preview:5e-ai-image-tasks'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const value = await new Promise((resolve, reject) => { const r = database.transaction('tasks').objectStore('tasks').get('workspace'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      database.close();
      return value;
    });
    assertAiWorkspace(workspace, aiWorkspace, 'AI 작업대 기록');
    assert.deepEqual(errors, [], '페이지 오류가 없어야 한다');
    return { pages: restored.pages.map(p => p.objects.length), settings, personalObject: personalObjects[0].name, aiTabs: workspace.tabs.length };
  } finally { await context.close(); }
}

// ② 1.6.3 프로젝트 파일(.5e, JSON) → 1.7.0 [파일 → 열기]
// ③ 1.6.3 설정 백업(ZIP) → 1.7.0 [설정 → 불러오기]
async function filesUpdate(browser, origin, engine) {
  const { context, page, errors, dialogs } = await newContext(browser, origin);
  try {
    await context.addInitScript(() => { for (const prefix of ['', '5e.preview:']) localStorage.setItem(`${prefix}5e.tutorial.bannerSeen`, 'true'); });
    await openApp(page, origin);
    assert.equal((await appState(page)).objects.length, 0, '빈 캔버스에서 시작');

    await page.locator('#file-menu-btn').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('#project-open').click();
    await (await chooser).setFiles(projectFile);
    // 새로 연 화면도 "현재 작업을 이 프로젝트 파일로 대체할까요?"를 물을 수 있다 → 열기.
    const replaceCurrent = modal(page, '프로젝트 파일로 대체');
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length > 0
      || [...document.querySelectorAll('.modal-overlay:not([hidden])')].some(overlay => overlay.textContent.includes('프로젝트 파일로 대체')), null, { timeout: 15_000 });
    if (await replaceCurrent.isVisible()) await replaceCurrent.getByRole('button', { name: '열기', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length >= 6, null, { timeout: 15_000 });
    await assertDrawing(page, savedProject, '1.6.3 프로젝트 파일');
    await page.screenshot({ path: path.join(evidence, `${engine}-4-project-file.png`) });

    // 설정 백업: 그림까지 들어 있는 전체 백업 → "프로젝트도 복원"
    await page.locator('#settings-menu-btn').click();
    const settingsChooser = page.waitForEvent('filechooser');
    await page.locator('#settings-import').click();
    await (await settingsChooser).setFiles(backupFile);
    const replace = modal(page, '프로젝트(그림)도 들어 있습니다');
    await replace.waitFor({ timeout: 15_000 });
    await replace.getByRole('button', { name: '프로젝트도 복원', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#scene [data-id]').length >= 6, null, { timeout: 15_000 });
    await assertDrawing(page, savedProject, '1.6.3 설정 백업의 그림');
    for (let started = Date.now(); !dialogs.some(text => text.includes('전체 백업을 불러왔습니다')); await page.waitForTimeout(200)) {
      if (Date.now() - started > 10_000) throw new Error(`백업 복원 안내가 없다: ${JSON.stringify(dialogs)}`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', '백업의 화면 색이 바로 반영된다');

    // 다시 열면 과목·화면 크기·내 오브젝트가 백업 값으로 시작한다.
    await page.reload({ waitUntil: 'load' });
    await page.locator('#canvas').waitFor({ state: 'visible' });
    const recovery = modal(page, '이전에 작업하던 도해가 남아 있습니다');
    if (await recovery.isVisible().catch(() => false)) await recovery.getByRole('button', { name: '새로 시작', exact: true }).click();
    // 내 오브젝트는 IndexedDB를 읽은 뒤 그려진다.
    await page.locator('#personal-parts .personal-item-btn').first().waitFor({ state: 'attached', timeout: 15_000 });
    const settings = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme, subject: document.documentElement.dataset.subject, screen: document.documentElement.dataset.screen,
      defaults: JSON.parse(localStorage.getItem('5e.preview:phyDraw.defaults') || 'null'),
      shortcut: localStorage.getItem('5e.preview:5e.shortcutPlatform'),
      library: [...document.querySelectorAll('#personal-parts .personal-item-btn')].map(button => button.textContent),
    }));
    assert.deepEqual({ ...settings, defaults: undefined }, { theme: 'light', subject: 'c', screen: 'wide', defaults: undefined, shortcut: 'windows', library: [personalObjects[0].name] }, '백업의 설정·내 오브젝트');
    assert.equal(settings.defaults?.strokeWidth, 0.35, '백업의 도구 기본값');
    await page.screenshot({ path: path.join(evidence, `${engine}-5-settings-backup.png`) });
    assert.deepEqual(errors, [], '페이지 오류가 없어야 한다');
    return { projectPages: savedProject.pages.length, backup: settings };
  } finally { await context.close(); }
}

withServer(async origin => {
  const receipts = [];
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const storageReceipt = await storageUpdate(browser, origin, engine.name());
      const filesReceipt = await filesUpdate(browser, origin, engine.name());
      receipts.push({ engine: engine.name(), storage: storageReceipt, files: filesReceipt });
      console.log(`PASS ${engine.name()} 1.6.3 → 1.7.0 데이터 호환`);
    } finally {
      fs.writeFileSync(path.join(evidence, 'receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
      await browser.close();
    }
  }
}).then(() => console.log('1.6.3 저장 데이터(저장소·프로젝트 파일·설정 백업) → 1.7.0: chromium·webkit 통과'))
  .catch(error => { console.error(error); process.exitCode = 1; });
