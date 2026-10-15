'use strict';
const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) => !process.env.MOTION_ENGINE || process.env.MOTION_ENGINE === name)) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
      await page.route('**/motion-batch-fixture', route => route.fulfill({
        contentType: 'text/html', body: '<!doctype html><body></body>',
      }));
      await page.goto(origin + '/motion-batch-fixture');
      const result = await page.evaluate(async () => {
        const { trackLoadingMotion } = await import('/js/loading/activity-visibility.js');
        const host = document.createElement('div');
        host.style.cssText = 'position:fixed;top:0;left:0;width:200px';
        document.body.append(host);
        const nodes = Array.from({ length: 24 }, () => {
          const node = document.createElement('div'); node.style.height = '10px'; host.append(node); return node;
        });
        const animations = nodes.map(node => node.animate([{ opacity: .5 }, { opacity: 1 }], { duration: 100000 }));
        const releases = nodes.map(trackLoadingMotion);
        const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const until = async test => {
          const start = performance.now();
          while (!test()) { if (performance.now() - start > 4000) throw Error('Visibility tracking did not settle'); await paint(); }
        };
        const original = Element.prototype.getAnimations;
        let scans = 0;
        try {
          await until(() => nodes.every(node => node.dataset.loadingMotion === 'running'));
          await paint();
          Element.prototype.getAnimations = function (...args) {
            if (nodes.includes(this)) scans++;
            return original.apply(this, args);
          };
          // A single rendered batch changes all cards together. Animation
          // discovery must scale with the batch, not scan every card per card.
          nodes.forEach(node => node.append(document.createElement('span')));
          await paint();
          const batchScans = scans;
          host.style.top = '-10000px';
          await until(() => animations.every(animation => animation.playState === 'paused'));
          host.style.top = '0';
          await until(() => animations.every(animation => animation.playState === 'running'));
          // Deliver a hidden-page signal inside this task: no animation frame
          // can run before the mutation microtasks below have completed.
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
          const late = nodes[0].animate([{ opacity: .5 }, { opacity: 1 }], { duration: 100000 });
          animations.push(late); nodes[0].append(document.createElement('span'));
          await Promise.resolve(); await Promise.resolve();
          const hiddenArrivalPaused = late.playState === 'paused';
          delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
          return { cards: nodes.length, batchScans, pausedAndResumed: true, hiddenArrivalPaused };
        } finally {
          delete document.hidden;
          Element.prototype.getAnimations = original;
          releases.forEach(release => release()); animations.forEach(animation => animation.cancel()); host.remove();
        }
      });
      assert.ok(result.batchScans <= result.cards * 3, JSON.stringify(result));
      assert.equal(result.pausedAndResumed, true);
      assert.equal(result.hiddenArrivalPaused, true, 'hidden-page arrivals pause without waiting for a suspended frame');
      console.log(name + ': ' + JSON.stringify(result));
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });
