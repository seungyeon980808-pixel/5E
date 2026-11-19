'use strict';

// CI 전용 멈춤 진단(11-18 CI2): GitHub 맥 실행기의 WebKit에서만 school-form·typeset-gaps가 evaluate는 돌아오는데
// 바로 다음의 rAF 기반 기다림(locator·waitForFunction·screenshot)이 180초 동안 안 끝났다. 로컬(크롬·WebKit, CPU 부하·네트워크 지연·
// 같은 실행기)에서는 재현되지 않는다. 다음 CI에서 원인을 가를 수 있게, 실패하면 프레임마다
//   · 그리기(rAF)가 마지막으로 돈 뒤 얼마나 지났는지 · 그동안 타이머(setTimeout)는 돌았는지 · 화면 보임 상태 · 프레임 주소
// 를 증거 폴더(<엔진>-stall.json)와 오류 메시지에 남긴다. 검사 동작은 바꾸지 않는다.
const fs = require('node:fs');
const path = require('node:path');

const PROBE = () => {
  if (window.__stallProbe) return;
  const probe = window.__stallProbe = { lastRaf: performance.now(), maxGap: 0, maxGapAt: 0, timerTicks: 0, timerTicksSinceRaf: 0 };
  const raf = () => { const now = performance.now(), gap = now - probe.lastRaf; if (gap > probe.maxGap) { probe.maxGap = Math.round(gap); probe.maxGapAt = Math.round(now); } probe.lastRaf = now; probe.timerTicksSinceRaf = 0; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  setInterval(() => { probe.timerTicks++; probe.timerTicksSinceRaf++; }, 100);
};

async function installStallProbe(context) { await context.addInitScript(PROBE); }

const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ timeout: ms }), ms))]);

async function describeStall(page, name, evidence) {
  const report = { engine: name, at: new Date().toISOString(), frames: [] };
  for (const frame of page.frames()) {
    const row = { url: frame.url().replace(/^https?:\/\/[^/]+/, ''), detached: frame.isDetached() };
    if (!row.detached) row.state = await withTimeout(frame.evaluate(() => { const p = window.__stallProbe; return {
      visibility: document.visibilityState, hasFocus: document.hasFocus(), readyState: document.readyState,
      sinceRafMs: p ? Math.round(performance.now() - p.lastRaf) : null, maxRafGapMs: p?.maxGap ?? null, maxRafGapAtMs: p?.maxGapAt ?? null,
      timerTicksSinceRaf: p?.timerTicksSinceRaf ?? null, busy: [...document.querySelectorAll('[aria-busy="true"]')].map(e => e.id || e.className).slice(0, 8) }; }).catch(error => ({ error: error.message })), 5000);
    report.frames.push(row);
  }
  report.screenshot = await withTimeout(page.screenshot({ path: path.join(evidence, `${name}-stall.png`), timeout: 10000 }).then(() => 'ok', error => error.message.split('\n')[0]), 12000);
  try { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, `${name}-stall.json`), JSON.stringify(report, null, 1)); } catch {}
  return report;
}

// 실패한 오류에 진단을 붙여 다시 던진다(진단이 실패해도 원래 오류는 그대로).
async function rethrowWithStall(error, page, name, evidence) {
  try { const report = await withTimeout(describeStall(page, name, evidence), 40000); console.error(`${name}: stall probe ${JSON.stringify(report)}`); } catch {}
  throw error;
}

module.exports = { installStallProbe, describeStall, rethrowWithStall };
