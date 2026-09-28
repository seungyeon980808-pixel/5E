/* Keep one editable original page inside a lazily rendered continuous document. */
export function createContinuousCropPages({ stage, canvas, loadPage, onPage }) {
  let root = null, observer = null, pageCount = 0, activePage = 1, extent = 0;
  let generation = 0, pageWidth = 0;
  const ratios = new Map();
  const slots = new Map();
  const reset = () => {
    generation += 1;
    ratios.clear();
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
    const placeholder = document.createElement("div");
    placeholder.className = "unilib-crop-page-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    slot.append(placeholder);
    const status = document.createElement("div");
    status.className = "unilib-crop-page-status";
    status.setAttribute("role", "status");
    status.textContent = `${page}쪽을 불러오는 중…`;
    slot.append(status);
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
      slot.querySelector(".unilib-crop-page-placeholder")?.remove();
      status.remove();
      slot.dataset.loaded = "ready";
    } catch (_) {
      if (own === generation) {
        slot.dataset.loaded = "error";
        status.replaceChildren(`${page}쪽을 불러오지 못했습니다.`);
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "unilib-button";
        retry.textContent = "다시 시도";
        retry.addEventListener("click", () => { delete slot.dataset.loaded; status.remove(); slot.querySelector(".unilib-crop-page-placeholder")?.remove(); void render(slot, page); });
        status.append(retry);
      }
    }
  };
  const mount = (count, page, geometry) => {
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
      const dimensions = geometry?.(number);
      if (dimensions) ratios.set(number, dimensions.height / dimensions.width);
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
    if (!root || page === activePage) return;
    await onPage(page);
  };
  stage.addEventListener("scroll", () => {
    if (!root || !extent) return;
    void request(pageAtScroll());
  });
  stage.addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    const slot = event.target.closest(".unilib-crop-page");
    if (slot && Number(slot.dataset.page) !== activePage) { event.stopImmediatePropagation(); void request(Number(slot.dataset.page)); }
  }, true);
  return { mount, reset, size, activate, get mounted() { return Boolean(root); } };
}
