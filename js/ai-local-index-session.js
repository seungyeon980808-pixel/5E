export function createLocalIndexSession(loadPages, publish, reportError) {
  let epoch = 0;

  function cancel() {
    epoch += 1;
  }

  async function accept(assets, rootLabel) {
    const sessionEpoch = ++epoch;
    const images = assets.images || [];
    const pdfs = assets.pdfs || [];
    const pages = [];
    const notices = [];
    const current = () => sessionEpoch === epoch;
    const update = (folderLabel, indexing) => {
      if (!current()) return false;
      publish({ images, pdfs, pages: [...pages], folderLabel, indexing, notices: [...notices] });
      return true;
    };

    update(rootLabel, true);
    for (let index = 0; index < pdfs.length; index += 1) {
      const pdf = pdfs[index];
      if (!update(`${pdf.relativePath} 분석 중 (${index + 1}/${pdfs.length})`, true)) return false;
      let lastRenderedPage = 0;
      const textlessPages = [];
      try {
        const indexed = await loadPages(pdf, ({ pageNumber, pageCount, searchable }) => {
          if (!current()) return;
          if (searchable === false) {
            textlessPages.push(pageNumber);
            notices.push(`${pdf.relativePath} ${pageNumber}쪽: 검색 가능한 텍스트 없음`);
          }
          if (pageNumber !== pageCount && pageNumber - lastRenderedPage < 5) return;
          lastRenderedPage = pageNumber;
          update(`${pdf.relativePath} · ${pageNumber}/${pageCount}쪽 분석 중 (${index + 1}/${pdfs.length})`, true);
        });
        if (!current()) return false;
        if (!indexed.length && textlessPages.length) {
          notices.splice(notices.length - textlessPages.length, 0,
            `${pdf.relativePath}: 검색 가능한 텍스트 없음`);
        }
        pages.push(...indexed);
        update(`${pdf.relativePath} 분석 완료 (${index + 1}/${pdfs.length})`, true);
      } catch (error) {
        if (!current()) return false;
        reportError(pdf, error);
      }
    }
    return update(`${rootLabel} · PDF ${pdfs.length}개 / 검색 가능 페이지 ${pages.length}쪽`, false);
  }

  return { accept, cancel };
}
