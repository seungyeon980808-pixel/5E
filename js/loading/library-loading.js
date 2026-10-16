/* Ported from the approved demo. Counts decoded successes and failed requests separately. */
function el(tag, cls, text) {
  const node = document.createElement(tag); node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
class LibraryIndicator {
  constructor(options) {
    this.o = { showAfter: 300, minVisible: 600, slowAfter: 4000, ...options };
    this.status = el('span', 'll'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
    this.text = el('span', 'll-text'); this.count = el('span', 'll-count');
    this.status.append(el('span', 'll-mark', '5E'), this.text, this.count);
    this.o.header.append(this.status);
    this.bar = el('div', 'll-bar'); this.fill = el('div', 'll-bar-fill'); this.bar.append(this.fill);
    this.o.header.insertAdjacentElement('afterend', this.bar);
    this.sheen = el('div', 'll-sheen'); this.sheen.append(el('div', 'll-sheen-band'));
    this.o.grid.classList.add('ll-grid'); this.o.grid.append(this.sheen);
  }
  begin(total = null) {
    this.reset(); this.total = total; this.loaded = 0; this.failed = 0; this.ended = false;
    this.status.dataset.state = 'loading'; this.text.textContent = '썸네일 불러오는 중'; this.render();
    this.schedule(); return this;
  }
  schedule() {
    clearTimeout(this.showTimer); clearTimeout(this.slowTimer);
    if (!this.visible) this.showTimer = setTimeout(() => this.show(), this.o.showAfter);
    this.slowTimer = setTimeout(() => { this.text.textContent = '조금 더 걸리고 있어요'; }, this.o.slowAfter);
  }
  setTotal(total) {
    clearTimeout(this.endTimer); clearTimeout(this.hideTimer);
    this.total = total;
    if (this.ended) {
      this.ended = false; this.status.classList.remove('is-done');
      this.status.dataset.state = 'loading'; this.text.textContent = '썸네일 불러오는 중'; this.schedule();
      if (this.visible) this.o.grid.classList.add('is-loading');
    }
    this.render(); return this;
  }
  progress(loaded, failed = 0) {
    this.loaded = loaded; this.failed = failed; this.render();
    if (this.total != null && loaded + failed >= this.total) this.end();
    return this;
  }
  end() {
    this.ended = true; clearTimeout(this.showTimer); clearTimeout(this.slowTimer);
    this.o.grid.classList.remove('is-loading');
    if (!this.visible) return this;
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      this.status.dataset.state = this.failed ? 'partial-failure' : 'completed';
      this.text.textContent = `${this.loaded}개 준비됨${this.failed ? ` · ${this.failed}개 불러오지 못함` : ''}`;
      this.count.textContent = ''; this.status.classList.add('is-done');
      this.hideTimer = setTimeout(() => this.hide(), 1100);
    }, Math.max(0, this.o.minVisible - (performance.now() - this.shownAt)));
    return this;
  }
  fail(message = '썸네일을 불러오지 못했어요') {
    this.clear(); this.show(); this.ended = true;
    this.o.grid.classList.remove('is-loading'); this.status.dataset.state = 'failed';
    this.text.textContent = message; this.count.textContent = ''; return this;
  }
  render() {
    this.count.textContent = this.total == null ? '' : `${this.loaded} / ${this.total}`;
    this.fill.style.transform = `scaleX(${this.total ? (this.loaded + this.failed) / this.total : 0})`;
  }
  show() {
    this.visible = true; this.shownAt = performance.now();
    this.status.classList.add('is-on'); this.bar.classList.add('is-on'); this.o.grid.classList.add('is-loading');
  }
  hide() { this.visible = false; this.status.classList.remove('is-on', 'is-done'); this.bar.classList.remove('is-on'); this.o.grid.classList.remove('is-loading'); }
  clear() { for (const key of ['showTimer','slowTimer','endTimer','hideTimer']) clearTimeout(this[key]); }
  reset() { this.clear(); this.hide(); return this; }
  destroy() { this.reset(); this.status.remove(); this.bar.remove(); this.sheen.remove(); this.o.grid.classList.remove('ll-grid'); }
}
export const LibraryLoading = { attach: options => new LibraryIndicator(options) };
if (typeof window !== 'undefined') window.LibraryLoading = LibraryLoading;
