'use strict';
// B13(1.7.1): 경과 시간 「00:00」이 주 스레드가 막히면 멈췄다가 한꺼번에 뛰던 결함.
// 시계 숫자는 글 바꾸기(setInterval)가 아니라 자리마다 transform 움직임(진행 막대와 같은 방식)으로 넘어가야 한다.
// 헤드리스 브라우저는 주 스레드가 막힌 동안 화면을 찍지 못해(찍기가 주 스레드를 기다림) 막힌 동안의 화면은 직접 못 본다 —
// 대신 ① 네 자리가 transform 움직임으로 돈다 ② 2.2초 막힌 뒤 바로 다음 그림(두 프레임 안)에 「00:02」 ③ 읽기 글이 따라온다를 본다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const src = fs.readFileSync(path.join(__dirname, '../js/loading/elapsed-clock.js'), 'utf8');

(async () => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([k]) => !process.env.BROWSER_ENGINE || k === process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<!doctype html><meta charset="utf-8"><body style="font:16px sans-serif"><time id="t">00:00</time></body>');
      await page.addScriptTag({ type: 'module', content: src + '\nwindow.__clock = { mountElapsedClock, elapsedText };' });
      await page.waitForFunction(() => !!window.__clock);
      assert.deepEqual(await page.evaluate(() => [0, 999, 1000, 61000, 600000, 6000000 + 5000].map(window.__clock.elapsedText)), ['00:00', '00:00', '00:01', '01:01', '10:00', '00:05']);
      const shown = await page.evaluate(() => {
        // 화면에 보이는 숫자 = 각 띠의 transform이 가리키는 칸
        const read = () => [...document.querySelectorAll('#t [aria-hidden] > span')].map(s => {
          if (s.textContent === ':') return ':';
          const strip = s.firstElementChild, y = new DOMMatrixReadOnly(getComputedStyle(strip).transform).f, h = s.getBoundingClientRect().height;
          return String(Math.round(-y / h));
        }).join('');
        const t = document.querySelector('#t'); window.__clock.mountElapsedClock(t, performance.now());
        const first = read(); const end = performance.now() + 2200; while (performance.now() < end) {} // 주 스레드 붙잡기
        const anims = t.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect.getKeyframes().some(k => /translateY/.test(k.transform || '')));
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ first, after: read(), anims: anims.length }))));
      });
      assert.equal(shown.anims, 4, `${name}: 네 자리가 transform 움직임으로 돈다`);
      assert.equal(shown.first, '00:00', `${name}: 처음은 00:00`);
      assert.equal(shown.after, '00:02', `${name}: 주 스레드가 2.2초 막힌 바로 뒤에도 00:02 (지금 ${shown.after})`);
      await page.waitForTimeout(1100);
      assert.match(await page.evaluate(() => document.querySelector('#t').getAttribute('aria-label')), /^00:0[34]$/, `${name}: 읽기 글도 따라온다`);
      console.log(`${name}: 경과 시계 통과 (${shown.first} → ${shown.after})`);
    } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exit(1); });
