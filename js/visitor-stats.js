// Counts come from the shared server; local previews never create visits.
const HOSTS = new Set(['5e.ai.kr', 'www.5e.ai.kr']);
const ID_KEY = '5e.visitor.v1';
const kstDay = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);

export function validVisitorStats(value) {
  return value?.timezone === 'Asia/Seoul' && /^\d{4}-\d{2}-\d{2}$/.test(value.date || '')
    && Number.isSafeInteger(value.total) && Number.isSafeInteger(value.today)
    && value.total >= 0 && value.today >= 0 && value.today <= value.total;
}

export function initVisitorStats() {
  const widget = document.querySelector('[data-visitor-stats]');
  if (!widget) return;
  const eligible = location.protocol === 'https:' && HOSTS.has(location.hostname)
    && !navigator.webdriver && !/bot|crawler|spider|headless/i.test(navigator.userAgent);
  const note = text => { widget.title = text; widget.setAttribute('aria-label', text); };
  if (!eligible) {
    note('누적·오늘 이용자 수 · 로컬 미리보기와 자동 검수는 집계에서 제외합니다.');
    return;
  }
  let endpoint;
  try {
    endpoint = new URL(document.querySelector('meta[name="5e-visitor-stats-endpoint"]')?.content || '/api/visitor-stats', location.href);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error('Invalid endpoint');
  } catch { note('이용자 집계 서버 연결을 확인하고 있습니다.'); return; }
  let visitorId;
  try {
    visitorId = localStorage.getItem(ID_KEY);
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(visitorId || '')) {
      localStorage.setItem(ID_KEY, crypto.randomUUID());
      visitorId = localStorage.getItem(ID_KEY);
    }
  } catch { visitorId = null; }
  let running = false, checkedAt = 0, recordedDay = '', displayedDay = '';
  async function refresh() {
    if (displayedDay && displayedDay !== kstDay()) {
      widget.textContent = widget.textContent.replace(/오늘 .+$/, '오늘 —');
      displayedDay = ''; checkedAt = 0;
    }
    if (running || document.hidden || Date.now() - checkedAt < 300000) return;
    running = true; checkedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const record = visitorId && recordedDay !== kstDay();
      const response = await fetch(endpoint, {
        method: record ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
        headers: record ? { 'Content-Type': 'application/json' } : undefined,
        body: record ? JSON.stringify({ visitorId }) : undefined, signal: controller.signal,
      });
      if (!response.ok) throw new Error('Visitor service unavailable');
      const stats = await response.json();
      if (!validVisitorStats(stats) || stats.date !== kstDay()) throw new Error('Invalid visitor stats');
      if (record) recordedDay = stats.date;
      displayedDay = stats.date;
      const format = new Intl.NumberFormat('ko-KR');
      widget.textContent = `누적 ${format.format(stats.total)} · 오늘 ${format.format(stats.today)}`;
      note(`누적 이용 브라우저 ${format.format(stats.total)} · 오늘 ${format.format(stats.today)} (${stats.date}, 한국 시간). 같은 브라우저의 중복 방문은 제외합니다. 집계 시작 이후의 수치입니다.`);
    } catch {
      // Keep any last successful value; a network failure must not block editing.
      note('이용자 집계 서버에 연결하지 못했습니다. 편집은 계속할 수 있습니다.');
    } finally { clearTimeout(timer); running = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  setInterval(() => void refresh(), 300000);
  if ('requestIdleCallback' in window) requestIdleCallback(() => void refresh(), { timeout: 2000 });
  else setTimeout(() => void refresh(), 500);
}
