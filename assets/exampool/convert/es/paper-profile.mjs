export const trackLabels = { common: '공통', all: '전 범위', ga: '가형', na: '나형',
  probability_statistics: '확률과 통계', calculus: '미적분', geometry: '기하', hwajak: '화법과 작문', eonmae: '언어와 매체' };
export const variantLabels = { odd: '홀수형', even: '짝수형', single: '단일형' };

// A physical PDF can contain several complete papers. Never deduplicate by question number.
export function matchesPaper(item, filters = {}) {
  if (!['math', 'kor'].includes(item.subject) || filters.allProfiles === true || filters.allProfiles === '1') return true;
  const variant = filters.variant || 'odd';
  if (item.variant && item.variant !== 'single' && item.variant !== variant) return false;
  const track = item.track || 'all';
  if (track === 'all') return true;
  if (['ga', 'na'].includes(track)) return track === (filters.track || 'ga');
  if (['ga', 'na'].includes(filters.track)) return false;
  return track === 'common' || track === filters.track;
}

export function paperLabel(items, filters = {}) {
  if (filters.allProfiles === true || filters.allProfiles === '1') return '모든 선택과목·유형';
  const tracks = [...new Set(items.map((item) => item.track).filter((value) => value && value !== 'common'))];
  const variants = [...new Set(items.map((item) => item.variant).filter((value) => value && value !== 'single'))];
  return [tracks.map((track) => trackLabels[track] || track).join(' · '),
    variants.map((variant) => variantLabels[variant] || variant).join(' · ')].filter(Boolean).join(' · ');
}

export function paperReady(items, filters = {}) {
  if (!items.length) return false;
  if (!['math', 'kor'].includes(items[0].subject)) return true;
  if (filters.allProfiles === true || filters.allProfiles === '1') return true;
  return !items.some((item) => item.track === 'common') || !!filters.track;
}

export function paperPages(allItems, selectedItems) {
  const selected = new Set(selectedItems.map((item) => `${item.variant || 'single'}:${item.track || 'all'}`));
  const groups = new Map();
  for (const item of allItems) {
    const key = `${item.variant || 'single'}:${item.track || 'all'}`;
    const pages = groups.get(key) || [];
    pages.push(item.page);
    groups.set(key, pages);
  }
  // Include continuation pages between indexed question starts in each chosen section.
  const pages = new Set();
  for (const [key, values] of groups) if (selected.has(key)) {
    for (let page = Math.min(...values); page <= Math.max(...values); page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
