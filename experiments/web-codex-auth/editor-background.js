import { transparentOuterPng } from '/outer-background.mjs';

export function createBackgroundOptions(panel) {
  const saved = localStorage.getItem('5e.aiOutputBackground');
  let mode = ['all', 'outer', 'white'].includes(saved) ? saved : 'outer';
  const savedThickness = Number(localStorage.getItem('5e.aiOutputThickness'));
  let thickness = [0, 1, 2].includes(savedThickness) ? savedThickness : 0;
  const cache = new WeakMap();
  const previews = new Map();
  const row = document.createElement('div');
  row.className = 'ai-background-option';
  const label = document.createElement('label');
  label.textContent = '배경';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '생성 이미지 배경');
  select.add(new Option('모든 흰색 배경 제거', 'all'));
  select.add(new Option('물체 외부 흰색 배경 제거', 'outer'));
  select.add(new Option('흰색 배경', 'white'));
  select.value = mode;
  label.append(select);
  const thicknessLabel = document.createElement('label');
  thicknessLabel.textContent = '선 굵기';
  const thicknessSelect = document.createElement('select');
  thicknessSelect.setAttribute('aria-label', '생성 이미지 선 굵기');
  thicknessSelect.add(new Option('원본', '0'));
  thicknessSelect.add(new Option('굵게 · 각 방향 1px', '1'));
  thicknessSelect.add(new Option('더 굵게 · 각 방향 2px', '2'));
  thicknessSelect.value = String(thickness);
  thicknessLabel.append(thicknessSelect);
  const note = document.createElement('small');
  note.textContent = '미리보기·페이지 삽입에 적용 · 원본 보관 · 원본 해상도 기준, 검은 선과 글자에 적용';
  const status = document.createElement('small');
  status.setAttribute('role', 'status');
  row.append(label, thicknessLabel, note, status);
  panel.querySelector('.ai-output-actions').before(row);
  function transformed(item, selectedMode, selectedThickness) {
    const key = `${selectedMode}:${selectedThickness}`;
    if (!cache.has(item)) cache.set(item, new Map());
    const variants = cache.get(item);
    if (!variants.has(key)) variants.set(key,
      transparentOuterPng(item.data, selectedMode, selectedThickness).catch(error => { variants.delete(key); throw error; }));
    return variants.get(key);
  }
  async function show(item, img) {
    const current = mode;
    const currentThickness = thickness;
    try {
      const src = await transformed(item, current, currentThickness);
      if (current !== mode || currentThickness !== thickness || !previews.has(img)) return;
      img.src = src;
      img.classList.toggle('ai-outer-transparent', current !== 'white');
      status.textContent = current === 'all' ? '물체 내부의 흰색도 함께 제거합니다.' : current === 'outer' ? '외곽선이 열린 부분은 내부도 투명해질 수 있습니다.' : '';
    } catch {
      if (current !== mode || currentThickness !== thickness) return;
      img.src = item.data;
      img.classList.remove('ai-outer-transparent');
      status.textContent = '이미지 처리에 실패했습니다. 흰색 배경·원본 굵기로 바꿔 주세요.';
    }
  }
  function refreshPreviews() {
    for (const [img, item] of previews) {
      if (!panel.contains(img)) { previews.delete(img); continue; }
      void show(item, img);
    }
  }
  select.onchange = () => {
    mode = select.value;
    localStorage.setItem('5e.aiOutputBackground', mode);
    refreshPreviews();
  };
  thicknessSelect.onchange = () => {
    thickness = Number(thicknessSelect.value);
    localStorage.setItem('5e.aiOutputThickness', String(thickness));
    refreshPreviews();
  };
  return {
    register(item, img) {
      if (item.kind !== 'generated' || item.sceneResult) return;
      previews.set(img, item);
      void show(item, img);
    },
    output(item) { return !item.sceneResult ? transformed(item, mode, thickness) : Promise.resolve(item.data); },
  };
}
