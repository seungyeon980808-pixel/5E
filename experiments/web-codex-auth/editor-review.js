export function simplifyComparison(root) {
  root.setAttribute('aria-label', '수정 전후 비교');
  const tools = root.querySelector('.ai-scoped-edit-comparison-tools');
  const grid = root.querySelector('.ai-scoped-edit-comparison-grid');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '변경 상세';
  const [metric, bounds] = tools.children;
  details.append(summary, metric, bounds);
  const mask = grid.lastElementChild;
  details.append(mask, root.lastElementChild);
  grid.style.gridTemplateColumns = 'repeat(2,minmax(0,1fr))';
  grid.style.minWidth = '0';
  tools.querySelector('input').setAttribute('aria-label', '전후 이미지 확대 비율');
  root.append(details);
  const fit = tools.querySelector('button');
  let width = 0;
  const observer = new ResizeObserver(entries => {
    const next = entries[0].contentRect.width;
    if (next === width) return;
    width = next;
    fit.click();
  });
  observer.observe(grid);
  const dispose = root.dispose;
  root.dispose = () => { observer.disconnect(); dispose?.(); };
  return root;
}
