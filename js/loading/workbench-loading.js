import { BlurReveal } from './blur-reveal.js';
import { RevealStatus } from './reveal-status.js';
import { trackLoadingMotion } from './activity-visibility.js';

const COPY = Object.freeze({
  image: { start: '시험지 스타일로 다시 그리고 있어요', slow: '평소보다 조금 더 걸리고 있어요', verySlow: '아직 작업 중이에요 · 원본은 그대로 있어요', done: '시험지 스타일로 바꿨어요', failed: '변환하지 못했어요 · 원본은 그대로예요' },
  graph: { start: '그래프에서 축과 눈금을 읽고 있어요', slow: '조금 더 걸리고 있어요 · 계속 진행 중', done: '이제 직접 고칠 수 있어요', failed: '그래프를 읽지 못했어요 · 원본은 그대로예요' },
});
// 실제 작업 신호(phase)를 사용자에게 보이는 4단계로 묶는다. sec는 기록이 없을 때 진행 기준.
// 칸 폭은 시간 비율이 아니라 고정 비율: 그림 그리기 칸이 너무 길면 답답해 보인다.
const STAGE_PLANS = Object.freeze({
  label: [
    { short: '원본·라벨 읽기', name: '원본과 라벨을 읽고 있어요', sec: 15, phases: ['sourceAnalysis'] },
    { short: '그림 새로 그리기', name: '그림을 새로 그리고 있어요', sec: 50, phases: ['pixelProcessing', 'generation', 'localRestore', 'localReview'] },
    { short: '라벨 자리 맞추기', name: '라벨이 들어갈 자리를 맞추고 있어요', sec: 15, phases: ['targetMapping', 'labelProposals', 'finalVerification'] },
    { short: '라벨 넣고 확인', name: '라벨을 넣고 결과를 확인하고 있어요', sec: 12, phases: ['labelPlacement', 'review', 'validating'] },
  ],
  image: [
    { short: '원본 읽기', name: '원본을 읽고 있어요', sec: 12, phases: ['sourceAnalysis'] },
    { short: '그림 새로 그리기', name: '그림을 새로 그리고 있어요', sec: 50, phases: ['pixelProcessing', 'generation', 'localRestore'] },
    { short: '배경 정리', name: '배경을 정리하고 있어요', sec: 5, phases: ['localReview', 'labelPlacement', 'review'] },
    { short: '결과 확인', name: '결과를 확인하고 있어요', sec: 6, phases: ['validating'] },
  ],
});
const STAGE_WIDTHS = [1, 1.5, 1, 1];
const STAGE_STORE = '5e.loading.stageTimes.v1';
const readStageTimes = () => { try { return JSON.parse(localStorage.getItem(STAGE_STORE) || '{}') || {}; } catch { return {}; } };
const writeStageTimes = value => { try { localStorage.setItem(STAGE_STORE, JSON.stringify(value)); } catch {} };
const median = values => { const v = values.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const roughLeft = ms => { const s = Math.max(5, Math.ceil(ms / 5000) * 5); return s < 60 ? `약 ${s}초` : `약 ${Math.floor(s / 60)}분${s % 60 >= 10 ? ` ${Math.round(s % 60 / 10) * 10}초` : ''}`; };
const samples = new Map();
export function estimateLoadingMs(kind, model, saved = []) {
  const values = [...(samples.get(`${kind}:${model}`) || []), ...saved].filter(n => Number.isFinite(n) && n >= 1000).sort((a,b) => a-b);
  return values.length ? values[Math.floor(values.length / 2)] : null;
}

export function createWorkbenchLoading({ host, legacy, panel }) {
  const frame = document.createElement('div');
  frame.className = 'ai-loading-frame'; frame.hidden = true; frame.dataset.aiLoadingFrame = '';
  const picture = document.createElement('div'), caption = document.createElement('div');
  picture.className = 'ai-loading-picture'; caption.className = 'ai-loading-caption';
  picture.append(caption); frame.append(picture); host.append(frame);
  const reveal = BlurReveal.attach(picture, { variant: 'focus', fit: 'contain', driven: true });
  const status = RevealStatus.attach(caption, { layout: 'band' });
  // 단계 막대: 칸마다 실제 단계 하나. 칸 폭은 보통 걸리는 시간 비율.
  const meta = document.createElement('span');
  meta.className = 'ai-loading-meta'; meta.setAttribute('aria-live', 'off');
  status.label.append(meta);
  // 그림 틀은 넘침을 숨기는 상자라 스크롤되면 막대가 밀린다. 늘 제자리에 둔다.
  picture.addEventListener('scroll', () => { if (picture.scrollTop || picture.scrollLeft) { picture.scrollTop = 0; picture.scrollLeft = 0; } });
  const stages = document.createElement('div');
  stages.className = 'ai-loading-stages'; stages.setAttribute('aria-hidden', 'true');
  status.root.append(stages);
  const releaseMotion = trackLoadingMotion(frame);
  let active = null, epoch = 0, timers = [], ticker = null;
  const elapsed = run => Math.max(0, (run.endedAt ?? Date.now()) - run.startedAt);
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearInterval(ticker); ticker = null; };
  const layout = () => {
    if (!active?.size || frame.hidden || !host.clientWidth || !host.clientHeight) return;
    const [sw, sh] = active.size;
    const availableW = Math.max(1, host.clientWidth - 16);
    const source = panel.querySelector('.is-ai-active-source .ai-preview-stage > img');
    const sourceBox = source?.getBoundingClientRect(), hostBox = host.getBoundingClientRect();
    // Reuse the workbench's fitted source size instead of fitting a second,
    // smaller image around a caption. The band overlays the image itself.
    const sourceVisible = sourceBox?.width > 0 && sourceBox?.height > 0;
    const scale = sourceVisible
      ? Math.min(sourceBox.width / sw, sourceBox.height / sh, host.clientWidth / sw)
      : Math.min(availableW / sw, Math.max(1, host.clientHeight - 16) / sh);
    const width = Math.max(1, sw * scale), height = Math.max(1, sh * scale);
    frame.style.width = `${width}px`; picture.style.width = `${width}px`; picture.style.height = `${height}px`;
    frame.style.left = `${(host.clientWidth - width) / 2}px`;
    frame.style.top = `${sourceVisible && panel.dataset.aiLayout === 'side-by-side'
      ? sourceBox.top + sourceBox.height / 2 - hostBox.top - height / 2
      : (host.clientHeight - height) / 2}px`;
  };
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  resize?.observe(host);
  const sourceChanges = new MutationObserver(layout);
  const referenceList = panel.querySelector('[data-ai-reference-list]');
  if (referenceList) sourceChanges.observe(referenceList, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] });
  referenceList?.addEventListener('scroll', layout, true);
  const stageKey = run => `${run.kind}:${run.model}:${run.planName}`;
  const renderStages = run => {
    stages.textContent = '';
    if (!run.plan) { caption.classList.remove('has-stages'); return; }
    caption.classList.add('has-stages');
    stages.style.gridTemplateColumns = run.plan.map((_, i) => `minmax(56px, ${STAGE_WIDTHS[i] ?? 1}fr)`).join(' ');
    run.cells = run.plan.map(step => {
      const cell = document.createElement('div'), bar = document.createElement('i'), fill = document.createElement('b'), name = document.createElement('span');
      cell.className = 'ai-loading-stage'; name.textContent = step.short; bar.append(fill); cell.append(bar, name); stages.append(cell);
      return { cell, fill };
    });
  };
  const stageProgress = run => {
    const now = run.endedAt ?? Date.now(), inStage = now - run.stageStartedAt;
    let weighted = 0, total = 0;
    const fills = run.expected.map((ms, i) => {
      const fill = run.settled ? 1 : i < run.stage ? 1 : i > run.stage ? 0 : Math.min(.92, inStage / ms);
      weighted += fill * ms; total += ms;
      return fill;
    });
    return { fills, overall: total ? weighted / total : 0, inStage, late: !run.settled && inStage > run.expected[run.stage] };
  };
  const tick = () => {
    const run = active;
    if (!run) return;
    if (!run.plan) { status.setElapsed(elapsed(run)); return; }
    const { fills, overall, inStage, late } = stageProgress(run);
    run.cells?.forEach(({ cell, fill }, i) => {
      fill.style.transform = `scaleX(${fills[i]})`;
      cell.dataset.state = run.settled || i < run.stage ? 'done' : i === run.stage ? 'current' : 'next';
    });
    reveal.progress(overall);
    if (run.settled) return;
    const left = run.expected.slice(run.stage + 1).reduce((a, b) => a + b, 0) + Math.max(0, run.expected[run.stage] - inStage);
    meta.textContent = `${run.stage + 1}/${run.plan.length} · ${run.measured && !late ? roughLeft(left) : clock(elapsed(run))}`;
    if (late && run.message !== '조금 더 걸리고 있어요') setPhase('조금 더 걸리고 있어요');
  };
  const advanceStage = (run, index) => {
    if (!run.plan || index <= run.stage || index >= run.plan.length) return;
    const now = Date.now();
    run.durations[run.stage] = now - run.stageStartedAt;
    for (let i = run.stage + 1; i < index; i++) run.durations[i] = 0;
    run.stage = index; run.stageStartedAt = now;
    setPhase(run.plan[index].name);
    tick();
  };
  const stage = phase => {
    const run = active;
    if (!run?.plan || run.settling) return;
    const index = run.plan.findIndex(step => step.phases.includes(phase));
    if (index >= 0) advanceStage(run, index);
  };
  const reset = () => {
    epoch++; clearTimers(); active = null; reveal.reset(); status.reset(); frame.hidden = true;
    delete panel.dataset.blurLoading; frame.removeAttribute('aria-busy');
    frame.dataset.loadingState = 'idle'; legacy.removeAttribute('aria-hidden');
  };
  const showOriginal = run => {
    if (active !== run || run.settling || !run.visible || !run.original || run.revealing) return;
    run.revealing = true;
    layout();
    void reveal.start(run.original, elapsed(run)).catch(() => {
      if (active === run && !run.settling) reveal.reset();
    });
  };
  const setPhase = message => {
    if (!active || active.settling || !message) return;
    if (active.plan && !active.plan.some(step => step.name === message) && message !== '조금 더 걸리고 있어요') return;
    active.message = message;
    if (active.visible) status.set(message);
  };
  const begin = ({ token, source, kind = 'image', model, expectedMs, startedAt = Date.now(), plan: planName = kind === 'image' ? 'image' : null, phased = false }) => {
    if (active?.token === token || !source) return;
    reset();
    const copy = COPY[kind] || COPY.image;
    const own = ++epoch;
    const plan = STAGE_PLANS[planName] || null;
    const run = active = { token, source, copy, kind, model, startedAt, settling: false, message: copy.start, size: [4, 3], plan, planName };
    if (plan) {
      const saved = readStageTimes()[stageKey(run)] || [];
      const history = plan.map((_, i) => median(saved.map(entry => entry[i])));
      run.measured = saved.length > 0;
      run.expected = plan.map((step, i) => history[i] || step.sec * 1000);
      run.durations = [];
      // 단계 신호가 없는 일반 생성은 원본 읽기를 생성 요청 안에서 함께 한다.
      run.stage = phased ? 0 : 1; run.stageStartedAt = startedAt;
      if (!phased) run.durations[0] = 0;
      run.message = plan[run.stage].name;
    }
    meta.textContent = '';
    renderStages(run);
    frame.hidden = false; frame.dataset.loadingState = 'pending'; frame.style.opacity = '0';
    frame.setAttribute('aria-busy', 'true');
    panel.dataset.blurLoading = 'true'; legacy.setAttribute('aria-hidden', 'true');
    layout();
    const image = typeof source === 'string' ? new Image() : source;
    if (typeof source === 'string') { image.decoding = 'async'; image.src = source; }
    const ready = () => {
      if (active !== run || run.settling) return;
      const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
      if (!width || !height) return;
      run.original = image; run.size = [width, height]; layout(); showOriginal(run);
    };
    if (image instanceof HTMLImageElement) void image.decode().then(ready, () => {}); else ready();
    timers.push(setTimeout(() => {
      if (epoch !== own || run.settling) return;
      run.visible = true; frame.style.opacity = '1'; status.show(run.message); tick(); layout(); showOriginal(run);
    }, Math.max(0, 150 - elapsed(run))));
    ticker = setInterval(tick, plan ? 250 : 1000);
    if (!plan && Number.isFinite(expectedMs) && expectedMs > 0) {
      timers.push(setTimeout(() => { if (epoch === own && !run.settling) setPhase(copy.slow); }, Math.max(0, expectedMs - elapsed(run))));
      if (copy.verySlow) timers.push(setTimeout(() => { if (epoch === own && !run.settling) setPhase(copy.verySlow); }, Math.max(0, expectedMs * 2 - elapsed(run))));
    }
  };
  const sharpFallback = (run, source) => {
    reveal.reset();
    const image = new Image(); image.alt = source === run.source ? '원본' : '생성 결과'; image.src = source;
    image.className = 'br-final'; image.style.objectFit = 'contain'; image.style.opacity = '1';
    reveal.stage.append(image);
  };
  const finish = async ({ token, outcome, result } = {}) => {
    if (!active || active.token !== token || active.settling) return;
    if (outcome === 'cancelled') { reset(); return; }
    const run = active, own = epoch;
    run.settling = true; run.endedAt = Date.now(); clearTimers();
    let failed = outcome === 'failed' || !result;
    if (run.plan && !failed) {
      run.durations[run.stage] = run.endedAt - run.stageStartedAt; run.settled = true;
      const all = readStageTimes(), key = stageKey(run);
      all[key] = [...(all[key] || []), run.plan.map((_, i) => run.durations[i] || 0)].slice(-20);
      writeStageTimes(all);
    }
    if (elapsed(run) < 150) { reset(); return; }
    frame.dataset.loadingState = failed ? 'failed' : 'completed'; frame.style.opacity = '1';
    if (failed) meta.textContent = '';
    frame.removeAttribute('aria-busy');
    if (!run.visible) status.show(run.message);
    if (failed) status.fail(run.copy.failed); else status.done(run.copy.done);
    tick(); layout();
    try {
      if (reveal.state === 'loading') await reveal.complete(failed ? run.source : result);
      else {
        const image = new Image(); image.src = failed ? run.source : result; await image.decode();
        if (epoch !== own) return;
        run.size = [image.naturalWidth, image.naturalHeight]; layout(); sharpFallback(run, image.src);
      }
    } catch {
      if (epoch !== own) return;
      failed = true;
      sharpFallback(run, run.source);
      frame.dataset.loadingState = 'failed'; status.fail(run.copy.failed); tick();
    }
    if (epoch !== own) return;
    if (!failed) {
      const key = `${run.kind}:${run.model}`, values = samples.get(key) || [];
      samples.set(key, [...values, elapsed(run)].slice(-20));
    }
    frame.removeAttribute('aria-busy');
    timers.push(setTimeout(reset, failed ? 6000 : 1000));
  };
  return { begin, finish, reset, setPhase, stage, frame, destroy() { reset(); resize?.disconnect(); sourceChanges.disconnect(); referenceList?.removeEventListener('scroll', layout, true); releaseMotion(); reveal.destroy(); status.destroy(); frame.remove(); } };
}

// 작업 창을 닫아 둔 채 끝나면 AI 버튼 바로 위에 뜨는 말풍선. 사용자가 닫거나 열 때까지 그대로 둔다.
// 버튼이 안 보이면 오른쪽 아래에 뜬다.
export function showDoneNotice({ title, detail = '', onOpen, anchor = document.getElementById('ai-image-install-open') } = {}) {
  document.querySelector('.ai-done-notice')?.dispatchEvent(new Event('ai-done-notice-close'));
  const box = document.createElement('div'), head = document.createElement('div'), sub = document.createElement('div'), row = document.createElement('div');
  const dismiss = document.createElement('button'), open = document.createElement('button');
  box.className = 'ai-done-notice'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
  head.className = 'ai-done-notice-title';
  head.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  head.append(title || '작업이 끝났어요');
  sub.className = 'ai-done-notice-detail'; sub.textContent = detail;
  row.className = 'ai-done-notice-actions';
  dismiss.type = open.type = 'button'; dismiss.textContent = '닫기'; open.textContent = '결과 보기';
  dismiss.className = 'ai-done-notice-dismiss'; open.className = 'ai-done-notice-open';
  const place = () => {
    const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const visible = rect && rect.width > 0 && rect.height > 0 && !anchor.closest('[hidden], [inert]');
    box.classList.toggle('is-anchored', !!visible);
    if (!visible) { box.style.left = box.style.bottom = ''; return; }
    const width = box.offsetWidth || 280;
    const left = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    box.style.left = `${Math.round(left)}px`;
    box.style.bottom = `${Math.round(innerHeight - rect.top + 12)}px`;
    box.style.setProperty('--ai-done-tail', `${Math.round(rect.left + rect.width / 2 - left)}px`);
  };
  const close = () => { removeEventListener('resize', place); anchor?.classList.remove('has-done-notice'); box.remove(); };
  box.addEventListener('ai-done-notice-close', close);
  dismiss.addEventListener('click', close);
  open.addEventListener('click', () => { close(); onOpen?.(); });
  row.append(dismiss, open); box.append(head, sub, row); document.body.append(box);
  anchor?.classList.add('has-done-notice');
  place(); addEventListener('resize', place);
  return box;
}
