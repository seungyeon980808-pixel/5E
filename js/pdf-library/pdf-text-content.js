export async function readPageTextContent(page, params = {}) {
  if (page.isPureXfa || typeof page.streamTextContent !== 'function') return page.getTextContent(params);
  const reader = page.streamTextContent(params).getReader();
  const content = { items: [], styles: Object.create(null), lang: null };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return content;
      content.lang ??= value.lang;
      Object.assign(content.styles, value.styles);
      content.items.push(...value.items);
    }
  } finally {
    reader.releaseLock();
  }
}
