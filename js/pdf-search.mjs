function wordsOf(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function queryTerms(query) {
  return [...new Set(wordsOf(query))];
}

function termFrequency(words, term) {
  return words.reduce((count, word) => count + Number(word.startsWith(term)), 0);
}

function snippetOf(text, terms, radius = 80) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  const lowered = compact.toLocaleLowerCase("ko");
  const positions = terms.map((term) => lowered.indexOf(term)).filter((position) => position >= 0);
  const center = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, center - radius);
  const end = Math.min(compact.length, center + radius * 2);
  return `${start ? "…" : ""}${compact.slice(start, end)}${end < compact.length ? "…" : ""}`;
}

export function rankPdfPages(pages, query, limit = 60) {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  const documents = pages.map((page) => ({ page, words: wordsOf(page.text) }));
  const averageLength = documents.reduce((sum, item) => sum + item.words.length, 0)
    / Math.max(1, documents.length);
  const documentFrequency = new Map(terms.map((term) => [
    term,
    documents.filter((item) => termFrequency(item.words, term) > 0).length,
  ]));
  const k1 = 1.2;
  const b = 0.75;
  const ranked = documents.flatMap(({ page, words }) => {
    const frequencies = terms.map((term) => termFrequency(words, term));
    if (frequencies.some((frequency) => frequency === 0)) return [];
    const score = terms.reduce((sum, term, index) => {
      const frequency = frequencies[index];
      const frequencyInDocuments = documentFrequency.get(term) || 0;
      const inverseFrequency = Math.log(1 + ((documents.length - frequencyInDocuments + 0.5)
        / (frequencyInDocuments + 0.5)));
      const normalizedLength = words.length / Math.max(1, averageLength);
      return sum + inverseFrequency * ((frequency * (k1 + 1))
        / (frequency + k1 * (1 - b + b * normalizedLength)));
    }, 0);
    return [{ ...page, score, snippet: snippetOf(page.text, terms) }];
  }).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id, "ko"));
  const bestScore = ranked[0]?.score || 1;
  return ranked.slice(0, limit).map((item) => ({
    ...item,
    matchPercent: Math.max(1, Math.min(100, Math.round((item.score / bestScore) * 100))),
  }));
}
