/* Keep one editable original page inside a lazily rendered continuous document. */
export function createContinuousCropPages({ stage, canvas, loadPage, onPage }) {
  let root = null, observer = null, pageCount = 0, activePage = 1, extent = 0;
  let busy = false, generation = 0, pendingPage = null, pageWidth = 0;
  const ratios = new Map();
  const slots = new Map();
  const reset = () => {
    generation += 1;
    busy = false; pendingPage = null; ratios.clear();
    observer?.disconnect();
    observer = null;
    if (root) { stage.append(canvas); root.remove(); }
    root = null;
    slots.clear();
    stage.classList.remove("is-continuous-crop");
  };
  const render = async (slot, page) => {
    if (slot.dataset.loaded) return;
    slot.dataset.loaded = "loading";
    const own = generation;
    try {
      const src = await loadPage(page);
      if (own !== generation) return;
      const image = new Image();
      image.alt = `${page}쪽`;
      image.src = src;
      image.draggable = false;
      await image.decode();
      if (own !== generation) return;
      ratios.set(page, image.naturalHeight / image.naturalWidth);
      if (pageWidth) slot.style.height = `${pageWidth * ratios.get(page)}px`;
      slot.prepend(image);
      slot.dataset.loaded = "ready";
    } catch (_) {
      if (own === generation) { delete slot.dataset.loaded; slot.setAttribute("aria-label", `${page}쪽 다시 불러오기`); }
    }
  };
  const mount = (count, page) => {
    reset();
    pageCount = count;
    activePage = page;
    root = document.createElement("div");
    root.className = "unilib-crop-pages";
    stage.classList.add("is-continuous-crop");
    for (let number = 1; number <= count; number += 1) {
      const slot = document.createElement("div");
      slot.className = "unilib-crop-page";
      slot.dataset.page = String(number);
      slot.setAttribute("aria-label", `${number} / ${count}쪽`);
      slots.set(number, slot);
      root.append(slot);
    }
    stage.append(root);
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) void render(entry.target, Number(entry.target.dataset.page));
    }, { root: stage, rootMargin: "100% 0px" });
    slots.forEach(slot => observer.observe(slot));
    slots.get(page).append(canvas);
    slots.get(page).classList.add("is-active");
  };
  const size = (width, height) => {
    if (!root) return;
    extent = height;
    pageWidth = width;
    ratios.set(activePage, height / width);
    root.style.width = `${width}px`;
    slots.forEach((slot, page) => { slot.style.height = `${ratios.has(page) ? width * ratios.get(page) : height}px`; });
  };
  const activate = (page, scroll = false) => {
    if (!root) return;
    slots.get(activePage)?.classList.remove("is-active");
    activePage = page;
    slots.get(page).append(canvas);
    slots.get(page).classList.add("is-active");
    if (scroll) stage.scrollTop = slots.get(page).offsetTop - root.offsetTop;
  };
  const pageAtScroll = () => {
    const y = stage.scrollTop + Math.min(80, stage.clientHeight / 4);
    let page = 1;
    for (const [number, slot] of slots) {
      if (slot.offsetTop - root.offsetTop <= y) page = number;
      else break;
    }
    return page;
  };
  const request = async page => {
    if (!root) return;
    pendingPage = page;
    if (busy) return;
    busy = true;
    const own = generation;
    try {
      while (own === generation && root && pendingPage !== null) {
        const next = pendingPage;
        pendingPage = null;
        if (next !== activePage) await onPage(next);
      }
    } finally { if (own === generation) busy = false; }
  };
  stage.addEventListener("scroll", () => {
    if (!root || !extent) return;
    void request(pageAtScroll());
  });
  stage.addEventListener("pointerdown", event => {
    const slot = event.target.closest(".unilib-crop-page");
    if (slot && Number(slot.dataset.page) !== activePage) { event.stopImmediatePropagation(); void request(Number(slot.dataset.page)); }
  }, true);
  return { mount, reset, size, activate, get mounted() { return Boolean(root); } };
}
