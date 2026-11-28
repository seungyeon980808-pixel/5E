'use strict';

// CI 전용 멈춤 진단(11-18 CI2): GitHub 맥 실행기의 WebKit에서만 school-form·typeset-gaps가 evaluate는 돌아오는데
// 바로 다음의 rAF 기반 기다림(locator·waitForFunction·screenshot)이 180초 동안 안 끝났다. 로컬(크롬·WebKit, CPU 부하·네트워크 지연·
// 같은 실행기)에서는 재현되지 않는다. 다음 CI에서 원인을 가를 수 있게, 실패하면 프레임마다
//   · 그리기(rAF)가 마지막으로 돈 뒤 얼마나 지났는지 · 그동안 타이머(setTimeout)는 돌았는지 · 화면 보임 상태 · 프레임 주소
// 를 증거 폴더(<엔진>-stall.json)와 오류 메시지에 남긴다. 검사 동작은 바꾸지 않는다.
//
// 11-19 E10: CI 두 번(44118686469·44144761470)의 결과 — typeset-gaps WebKit에서 세 프레임(위 문서·5E_exam·rhwp) 모두 evaluate가 5초 안에
// 돌아오지 않고 화면 찍기도 10초 안에 끝나지 않았다. 「rAF만 멈춤」이 아니라 WebKit 화면 프로세스의 주 스레드가 통째로 막힌 것이다
// (두 번 다 「조판 설정」 팝업 미리보기를 다시 그리는 자리: 팝업 열기 직후 svg가 보인 다음, 값 입력 직후).
// 막힌 뒤에는 페이지 안에서 아무것도 물을 수 없으므로, 막히기 전부터 밖으로 흘려 보낸 기록을 남긴다:
//   · 2초마다 [stall-probe] tick — 시각·rAF 간격·글자 재기(measureText) 횟수·이상한 폭(0·NaN) 수 → 마지막 tick이 언제 끊겼는지
//   · 글자 재기에서 처음 보는 글꼴로 폭이 0·NaN·무한이 나오면 [stall-probe] bad-measure(글꼴·글자) 한 번씩 — CI에만 없는 글꼴로
//     폭이 0/NaN이 되어 조판 줄 나누기가 끝나지 않는다는 가설을 가른다
//   · 막힌 것을 본 뒤 60초 동안 10초마다 다시 물어 「느리게라도 돌아오는지(느림)」 「끝내 안 돌아오는지(무한 반복)」를 가른다
const fs = require('node:fs');
const path = require('node:path');

const PROBE = () => {
  if (window.__stallProbe) return;
  const probe = window.__stallProbe = { lastRaf: performance.now(), maxGap: 0, maxGapAt: 0, timerTicks: 0, timerTicksSinceRaf: 0, measures: 0, badMeasures: 0, badFonts: [] };
  const raf = () => { const now = performance.now(), gap = now - probe.lastRaf; if (gap > probe.maxGap) { probe.maxGap = Math.round(gap); probe.maxGapAt = Math.round(now); } probe.lastRaf = now; probe.timerTicksSinceRaf = 0; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  setInterval(() => { probe.timerTicks++; probe.timerTicksSinceRaf++; }, 100);
  const where = () => (location.pathname.split('/').filter(Boolean).slice(-2).join('/') || '/');
  setInterval(() => {
    try { console.debug('[stall-probe] tick ' + JSON.stringify({ frame: where(), t: Math.round(performance.now()), sinceRaf: Math.round(performance.now() - probe.lastRaf), maxGap: probe.maxGap, measures: probe.measures, bad: probe.badMeasures, tsx: !!document.querySelector('.tsx-sheet svg'), busy: document.querySelectorAll('[aria-busy="true"]').length })); } catch {}
  }, 2000);
  const proto = window.CanvasRenderingContext2D?.prototype, original = proto?.measureText;
  if (original) proto.measureText = function (text) {
    const result = original.call(this, text);
    probe.measures++;
    const width = result?.width;
    if (String(text ?? '').trim() && !(Number.isFinite(width) && width > 0)) {
      probe.badMeasures++;
      const font = String(this.font || '');
      if (probe.badFonts.length < 12 && !probe.badFonts.includes(font)) {
        probe.badFonts.push(font);
        try { console.debug('[stall-probe] bad-measure ' + JSON.stringify({ frame: where(), font, text: String(text).slice(0, 24), width: String(width) })); } catch {}
      }
    }
    return result;
  };
};

// 페이지마다 [stall-probe] 기록 마지막 40줄(시각 포함)을 밖(Node)에 쌓는다 — 주 스레드가 막혀도 그 전까지의 기록은 남는다.
const logs = new WeakMap();
async function installStallProbe(context) {
  await context.addInitScript(PROBE);
  const watch = page => {
    if (logs.has(page)) return;
    const ring = []; logs.set(page, ring);
    page.on('console', message => { const text = message.text(); if (!text.startsWith('[stall-probe]')) return; ring.push(`${new Date().toISOString()} ${text}`); if (ring.length > 40) ring.shift(); });
  };
  context.pages().forEach(watch); context.on('page', watch);
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ timeout: ms }), ms))]);
const frameState = frame => frame.evaluate(() => { const p = window.__stallProbe; return {
  visibility: document.visibilityState, hasFocus: document.hasFocus(), readyState: document.readyState,
  sinceRafMs: p ? Math.round(performance.now() - p.lastRaf) : null, maxRafGapMs: p?.maxGap ?? null, maxRafGapAtMs: p?.maxGapAt ?? null,
  timerTicksSinceRaf: p?.timerTicksSinceRaf ?? null, measures: p?.measures ?? null, badMeasures: p?.badMeasures ?? null, badFonts: p?.badFonts ?? null,
  busy: [...document.querySelectorAll('[aria-busy="true"]')].map(e => e.id || e.className).slice(0, 8) }; }).catch(error => ({ error: error.message }));

async function describeStall(page, name, evidence) {
  const report = { engine: name, at: new Date().toISOString(), frames: [] };
  for (const frame of page.frames()) {
    const row = { url: frame.url().replace(/^https?:\/\/[^/]+/, ''), detached: frame.isDetached() };
    if (!row.detached) row.state = await withTimeout(frameState(frame), 5000);
    report.frames.push(row);
  }
  // 모든 프레임이 5초 안에 답하지 않으면 주 스레드가 통째로 막힌 것 — 60초 동안 10초마다 다시 물어 느림/무한 반복을 가른다.
  const live = report.frames.filter(row => !row.detached);
  report.mainThreadBlocked = live.length > 0 && live.every(row => row.state?.timeout);
  if (report.mainThreadBlocked) {
    report.recovery = [];
    const top = page.mainFrame(), started = Date.now();
    while (Date.now() - started < 60000) {
      const state = await withTimeout(frameState(top), 10000);
      report.recovery.push({ afterMs: Date.now() - started, answered: !state.timeout, ...(state.timeout ? {} : { sinceRafMs: state.sinceRafMs, maxRafGapMs: state.maxRafGapMs, measures: state.measures, badMeasures: state.badMeasures }) });
      if (!state.timeout) break;
    }
    report.verdict = report.recovery.some(row => row.answered) ? 'slow — main thread came back' : 'hung — no answer for 60s more (infinite loop or engine deadlock)';
  }
  report.lastProbeLog = (logs.get(page) || []).slice(-12);
  report.screenshot = await withTimeout(page.screenshot({ path: path.join(evidence, `${name}-stall.png`), timeout: 10000 }).then(() => 'ok', error => error.message.split('\n')[0]), 12000);
  try { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, `${name}-stall.json`), JSON.stringify(report, null, 1)); } catch {}
  return report;
}

// 실패한 오류에 진단을 붙여 다시 던진다(진단이 실패해도 원래 오류는 그대로).
async function rethrowWithStall(error, page, name, evidence) {
  try { const report = await withTimeout(describeStall(page, name, evidence), 110000); console.error(`${name}: stall probe ${JSON.stringify(report)}`); } catch {}
  throw error;
}

module.exports = { installStallProbe, describeStall, rethrowWithStall };
