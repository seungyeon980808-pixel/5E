// Inventory is deliberately limited to observed raster objects, detected vector figures,
// and reconstructed native tables. It is not a claim of full semantic PDF coverage.
export function observedContentRegions(question, pdf, primitives, regions, figures, blocks, includeImages) {
  const contains = (a, b, margin = 0.5) => a[0] <= b[0] + margin && a[1] <= b[1] + margin
    && a[2] >= b[2] - margin && a[3] >= b[3] - margin;
  const native = blocks.filter((block) => block.kind === 'table' && block.box);
  const candidates = [
    ...primitives.filter((p) => p.type === 'image' && p.box[2] - p.box[0] >= 6 && p.box[3] - p.box[1] >= 6)
      .map((p) => ({ box: p.box, kind: 'raster' })),
    ...regions.filter((r) => r.kind !== 'image').map((r) => ({ box: r.box, kind: 'vector' })),
    ...native.map((t) => ({ box: t.box, kind: 'table', nativeBlock: t })),
  ];
  const seen = new Set();
  return candidates.filter(({ box }) => contains(question.box, box)).flatMap(({ box, kind, nativeBlock }) => {
    const key = `${kind}:${box.map((n) => n.toFixed(2)).join(',')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const editable = kind === 'table';
    const captured = figures.some((f) => contains(f.flowBox || f.box, box));
    let page = question.page, original = [...box];
    if (pdf.figureSourceRegions) {
      const origin = pdf.figureSourceRegions.find((r) => contains(r.flowBox, box));
      if (!origin) return [];
      page = origin.page || page;
      original = box.map((v, index) => v - (index % 2 ? origin.dy : origin.dx));
    }
    const state = editable ? 'editable' : !includeImages ? 'excluded' : captured ? 'pending-image' : 'unresolved';
    const id = `${question.id}:content:${seen.size}`;
    if (nativeBlock) nativeBlock.sourceContentId = id;
    return [{ id, kind, page, box: original, state,
      ...(state === 'unresolved' ? { reason: '원본 자료 영역을 안전한 그림 크롭으로 복원하지 못했습니다.' } : {}) }];
  });
}
