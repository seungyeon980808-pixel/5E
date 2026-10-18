// 정식 1.6.3(v1.6.3 태그)을 실제로 띄워 교사가 쓰던 데이터를 만들고, 브라우저 저장소를 그대로 떠 둔다.
// 만든 것: 그림 두 쪽(사각형·타원·선·글자·좌표/함수 그래프, 2쪽 사각형), 내 오브젝트(라이브러리) 1개,
// 설정(화면 색 화이트·과목 화학·화면 크기·단축키 기준·도구 기본값·아트보드 크기), 프로젝트 저장 파일(.5e),
// 설정 백업 파일. 결과는 이 폴더의 storage.json·project-1.6.3.5e·settings-backup-1.6.3.zip.
//
// 다시 만들기(Chromium만 씀, 검사는 이 결과를 읽기만 한다):
//   node tests/fixtures/data-compat-1.6.3/generate-fixture.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { dumpInPage } = require('./storage-dump.cjs');

const here = __dirname;
const repo = path.resolve(here, '../../..');
const shots = process.env.EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), '5e-v163-shots-'));

function extractRelease() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '5e-v163-'));
  execFileSync('/bin/sh', ['-c', `git -C "${repo}" archive v1.6.3 | tar -x -C "${dir}"`]);
  assert.match(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'), /"version": "1\.6\.3"/);
  return dir;
}

function startServer(cwd) {
  const child = spawn(process.execPath, ['scripts/preview-local-server.cjs'], { cwd, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('1.6.3 서버가 뜨지 않았다')), 10_000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/Local preview: (http:\/\/127\.0\.0\.1:\d+)\/preview\//);
      if (match) { clearTimeout(timer); resolve({ child, origin: match[1] }); }
    });
    child.once('exit', code => reject(new Error(`1.6.3 서버 종료 ${code}`)));
  });
}

// 저장 위치 선택 창(showSaveFilePicker)에 사용자가 위치를 고른 것처럼 응답하고 쓴 바이트를 받아 둔다.
function recordSavePicker() {
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

const readState = page => page.evaluate(async () => {
  const stateUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/state\.js(\?|$)/.test(name));
  const { state } = await import(stateUrl);
  return JSON.parse(JSON.stringify(state.get()));
});

async function drag(page, from, to) {
  await page.mouse.move(...from); await page.mouse.down();
  await page.mouse.move(...to, { steps: 8 }); await page.mouse.up();
}

async function step(page, name, run) {
  try { await run(); await page.screenshot({ path: path.join(shots, `${name}.png`) });
  }
  catch (error) { await page.screenshot({ path: path.join(shots, `${name}-failure.png`) }).catch(() => {}); error.message = `[${name}] ${error.message}`; throw error; }
}

async function main() {
  const release = extractRelease();
  const { child, origin } = await startServer(release);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
    await context.addInitScript(recordSavePicker);
    await context.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.fallback() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/?mode=pro&mobile=0`, { waitUntil: 'load' });
    await page.locator('#canvas').waitFor();
    assert.match(await page.locator('body').innerText(), /v1\.6\.3/, '정식 1.6.3 화면이어야 한다');
    await page.getByRole('button', { name: '건너뛰기', exact: true }).click();

    await step(page, '1-shapes', async () => {
      await page.locator('[data-tool="RECT"]:visible').click(); await drag(page, [400, 260], [600, 400]);
      await page.locator('[data-tool="O"]:visible').click(); await drag(page, [700, 260], [880, 420]);
      // 직선은 시작점·끝점을 차례로 클릭한다.
      await page.locator('[data-tool="L"]:visible').click(); await page.mouse.click(400, 640); await page.mouse.move(620, 700, { steps: 5 }); await page.mouse.click(620, 700);
      await page.locator('[data-tool="V"]:visible').click();
      await page.locator('#canvas').focus(); await page.keyboard.press('t');
      await page.mouse.click(420, 470);
      await page.keyboard.type('1.6.3 글자 F=ma');
      await page.mouse.click(1100, 700);
      await page.keyboard.press('Escape');
      const state = await readState(page);
      assert.deepEqual(state.objects.map(o => o.type), ['rect', 'ellipse', 'line', 'text']);
    });

    await step(page, '2-graph', async () => {
      // 좌표/함수 그래프: x·y 0~4, 1칸 간격, y = x^2/4, 끝 라벨 A
      await page.locator('#graph-tool-open').click();
      const modal = page.locator('#graph-modal-overlay');
      await modal.waitFor({ state: 'visible' });
      for (const [id, value] of [['#gm-xpos', 4], ['#gm-ypos', 4], ['#gm-xstep', 1], ['#gm-ystep', 1]]) {
        await modal.locator(id).fill(String(value)); await modal.locator(id).dispatchEvent('change');
      }
      await modal.locator('#gm-tab-func-btn').click();
      await modal.locator('#gm-add-series').click();
      await modal.locator('#gm-expr').fill('x^2/4');
      await modal.locator('#gm-expr').dispatchEvent('input'); await modal.locator('#gm-expr').dispatchEvent('change');
      await modal.locator('#gm-endlabel').fill('A'); await modal.locator('#gm-endlabel').dispatchEvent('input');
      await modal.locator('#gm-confirm').click();
      await modal.waitFor({ state: 'hidden' });
      const state = await readState(page);
      assert.ok(state.objects.some(o => o.type === 'funcgraph' && o.expr === 'x^2/4'), '함수 그래프가 생긴다');
    });

    await step(page, '3-personal-object', async () => {
      // 내 오브젝트(라이브러리): 과목을 화학으로 바꾼 뒤 사각형을 골라 "1.6.3 상자"로, 새 분류 "호환 검사"에 저장
      await page.locator('#subject-section .tool-section-header, #subject-section > button, #subject-section > :first-child').first().click();
      await page.locator('#subject-switch [data-subject="c"]').click();
      await page.keyboard.press('Escape');
      await page.locator('[data-tool="V"]:visible').click();
      await page.mouse.click(1100, 720);
      await page.mouse.click(400, 330); // 사각형 왼쪽 변(그래프와 겹치지 않는 곳)
      const state = await readState(page);
      assert.deepEqual(state.selectedIds.map(id => state.objects.find(o => o.id === id)?.type), ['rect'], '사각형 하나가 선택돼야 한다');
      await page.locator('#personal-object-save').click();
      await page.locator('#po-name').fill('1.6.3 상자');
      await page.locator('#po-cat-select').selectOption({ label: '＋ 새 분류 만들기…' });
      await page.locator('#po-cat-new').fill('호환 검사');
      await page.locator('#po-ok').click();
      await page.locator('#personal-parts').getByText('호환 검사').waitFor({ state: 'attached' });
    });

    await step(page, '4-second-page', async () => {
      // 아트보드 95×50, 2쪽 추가 후 사각형 하나
      await page.mouse.click(1100, 720);
      await page.getByRole('button', { name: '95×50', exact: true }).click();
      await page.locator('#page-add').click();
      await page.locator('[data-tool="RECT"]:visible').click(); await drag(page, [500, 300], [800, 500]);
      await page.locator('[data-tool="V"]:visible').click();
      const state = await readState(page);
      assert.equal(state.pages.length, 2);
      assert.deepEqual(state.objects.map(o => o.type), ['rect']);
    });

    await step(page, '5-settings', async () => {
      // 설정: 화면 크기·단축키 기준, 도구 기본값(선 굵기 0.35mm·글자 4mm·격자 5mm), 화면 색 화이트
      await page.locator('#settings-menu-btn').click(); await page.locator('#open-screen').click();
      const prefs = page.locator('.modal-overlay').filter({ has: page.locator('#pref-title') });
      await prefs.locator('[data-screen-size]').last().click();
      await prefs.locator('#pref-shortcut-platform').selectOption('windows');
      await prefs.locator('#pref-close').click();
      await page.locator('#settings-menu-btn').click(); await page.locator('#open-defaults').click();
      await page.locator('#defaults-stroke-width').fill('0.35');
      await page.locator('#defaults-text-size').fill('4');
      await page.locator('#defaults-grid-interval').fill('5');
      await page.locator('#defaults-save').click();
      await page.locator('#theme-toggle').click();
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    });

    let project;
    await step(page, '6-project-save', async () => {
      await page.locator('.page-tab').first().click();
      await page.locator('#file-menu-btn').click();
      await page.locator('#project-save').click();
      await page.waitForFunction(() => window.__savedFiles.length > 0, null, { timeout: 15_000 });
      project = await page.evaluate(() => window.__savedFiles.at(-1));
      fs.writeFileSync(path.join(here, 'project-1.6.3.5e'), Buffer.from(project.base64, 'base64'));
    });

    let backup;
    await step(page, '7-settings-backup', async () => {
      await page.locator('#settings-menu-btn').click(); await page.locator('#settings-export').click();
      await page.locator('#sx-ok').click();
      await page.waitForFunction(() => window.__savedFiles.length > 1, null, { timeout: 15_000 });
      backup = await page.evaluate(() => window.__savedFiles.at(-1));
      fs.writeFileSync(path.join(here, 'settings-backup-1.6.3.zip'), Buffer.from(backup.base64, 'base64'));
    });

    await step(page, '8-dump', async () => {
      // 자동 저장이 최신 그림(두 쪽 모두)을 담을 때까지 기다린 뒤 저장소를 뜬다.
      const state = await readState(page);
      const total = state.pages.reduce((n, p) => n + (p.id === state.activePageId ? state.objects.length : p.objects.length), 0);
      const latestCount = () => page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open('5e-preview-autosave'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const rows = await new Promise(resolve => { const r = db.transaction('snapshots').objectStore('snapshots').getAll(); r.onsuccess = () => resolve(r.result); });
        db.close();
        const latest = rows.at(-1)?.data;
        return latest ? `${latest.pages.length}:${latest.pages.reduce((n, p) => n + p.objects.length, 0)}` : '';
      });
      for (let started = Date.now(); await latestCount() !== `2:${total}`; await page.waitForTimeout(500)) {
        if (Date.now() - started > 20_000) throw new Error(`자동 저장이 최신 그림을 담지 않았다: ${await latestCount()}`);
      }
      const dump = await page.evaluate(dumpInPage);
      assert.deepEqual(errors, [], '1.6.3 페이지 오류가 없어야 한다');
      fs.writeFileSync(path.join(here, 'storage.json'), JSON.stringify(dump, null, 1) + '\n');
      console.log(`1.6.3 고정 자료: localStorage ${Object.keys(dump.localStorage).length}개, IndexedDB ${dump.indexedDB.map(d => `${d.name}@${d.version}`).join(', ')}`);
      console.log(`프로젝트 ${project.name}, 설정 백업 ${backup.name}, 그림 ${total}개`);
    });
  } finally {
    await browser.close();
    child.kill('SIGTERM');
    fs.rmSync(release, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
