const plain = (runs) => runs.filter((run) => run.kind === 'text').map((run) => run.value).join('');
const word = /[\p{L}\p{N}]+/gu;
const startsQuote = (text) => /^[“‘"']/u.test(text);
const particles = /^(?:은|는|이|가|을|를|의|에|에서|에게|께|으로|로|와|과|도|만|보다|부터|까지|이라고|이라는|이라|이라면|이며|이고|이나|이지만)(?:는|은|도|만|부터|까지|라도)?$/u;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A PDF line end is not itself a word boundary. Use spaces actually printed
 * elsewhere in the same source before considering an attested joined word. */
export function lineSeparator(left, right, reference = '') {
  const before = left.at(-1), after = right[0];
  if (!before || !after) return '';
  if (before.kind !== 'text' || after.kind !== 'text') return ' ';
  if (/\s$/u.test(before.value) || /^\s/u.test(after.value)) return '';
  const a = before.value.match(/[\p{L}\p{N}]+$/u)?.[0];
  const b = after.value.match(/^[\p{L}\p{N}]+/u)?.[0];
  if (!a || !b) return /[（(「“]$/u.test(before.value) || /^[,.!?;:，。！？)）」”]/u.test(after.value) ? '' : ' ';
  if (!/[가-힣]/u.test(a + b)) return ' ';
  // Do not erase a source-attested space (e.g. "문제 되는데", "그 책임").
  if (new RegExp(`${escape(a)}[ \\t]+${escape(b)}(?:[^\\p{L}\\p{N}]|$)`, 'u').test(reference)) return ' ';
  const joined = a + b;
  const tokens = reference.match(word) || [];
  if (tokens.includes(joined)) return '';
  // Also recognise inflected forms: "실현된다" corroborates "실현/되는데",
  // and "책임은" corroborates "책/임이". A printed separated pair wins above.
  const prefix = a + b[0];
  if (prefix.length >= 2 && tokens.some((token) => token.normalize('NFD').startsWith(prefix.normalize('NFD')) && token.length >= joined.length - 2)) return '';
  // These are bound verb/adjective endings, not independent words. Only
  // physical PDF-line joins reach this function; a same-line attested space
  // already won above. Keep dependent nouns such as "그런 / 게" separate.
  if (a.length >= 2 && /^[가-힣]+$/u.test(a)
    && (/^(?:네요|겠(?:다|구나|군요|네요|어요|습니다|지|지만|는데|다면|다고|다는|습니까))$/u.test(b)
      || /(?:하|되)$/u.test(a) && /^(?:게|도록|면서)$/u.test(b)
      || /거$/u.test(a) && b === '늘'
      || /(?:었|였|옵)사$/u.test(a) && b === '오니')) return '';
  if (particles.test(b) && !(/(?:과|와)$/u.test(a) && /^(?:은|이)$/u.test(b))) return '';
  if (/는$/u.test(a) && /^(?:지|지가|지는|지를)$/u.test(b)) return '';
  // Productive 하다/되다 inflections can wrap without another occurrence of
  // the same verb. Exclude connectives such as "해야 한다" and "할 수".
  if (a.length >= 2 && !/[다요며고면서야는은던을라]$/u.test(a)
    && /^(?:하(?:는|면|며|여|고|지|려|도록|기|였다|소서)|한(?:다|데|지|다면)|할(?:지|수|때)?$|함$|되(?:는|면|며|어|고|지|려|도록|기|었)|된(?:다)?$|될$|됨$)/u.test(b)) return '';
  return ' ';
}

export function appendLineRuns(left, right, reference = '') {
  const separator = lineSeparator(left, right, reference);
  return [...left, ...(separator ? [{ kind: 'text', value: separator }] : []), ...right];
}

function protectedLine(block, inlineChoices, continuing = false) {
  if (block.kind || !Array.isArray(block.runs) || !block.sourceLine) return true;
  if (!['stem', 'ask', 'passage', 'bogi'].includes(block.role)) return true;
  const text = plain(block.runs).trim();
  if (!text || !/[\p{L}]/u.test(text)) return true; // display equations stay independent
  if (!inlineChoices && /^[①②③④⑤❶❷❸❹❺]/u.test(text)) return true;
  if (/^[◦○∙•ㆍ]/u.test(text)) return !continuing;
  const heading = /^(?:\[\s*\d+\s*[～~∼-]|[<〈]\s*보\s*기|\([가-힣A-Z]\)(?=\s|$)|[가-힣A-Z]\s*[:：]|[-―—]\s*[^ ]|\*|※|\d+[.)]|[ㄱ-ㅎ][.․])/u.test(text);
  return heading && !(continuing && /^(?:\([가-힣A-Z]\)(?=\s|$)|[가-힣A-Z]\s*[:：]|\d+[.)])/u.test(text) && text.length >= 20);
}

/** Only reflow lines with PDF geometry. Prepared semantic paragraphs without
 * sourceLine remain untouched. Tables, drawings, labels and verse boundaries
 * cannot be crossed by a merge. Native equation runs retain their identities. */
export function restoreProseBlocks(blocks, { referenceText = '', inlineChoices = false, preserveVerse = false } = {}) {
  const verse = new Set();
  if (preserveVerse) {
    let start = 0;
    blocks.forEach((block, index) => {
      const text = plain(block.runs || []).trim();
      if (/^\([가-힣]\)$/u.test(text)) start = index + 1;
      if (!/^[-―—]\s*.+(?:[｢「]|시조|가사)/u.test(text)) return;
      const section = blocks.slice(start, index).filter(b => b.sourceLine && plain(b.runs || []).trim().length > 4);
      // Credits delimit literary works, including a poem followed by an essay
      // in the same passage. Short verse must keep each printed line and stanza.
      const explicitVerse = /시조|가사/u.test(text);
      const quotedTurns = section.filter(b => startsQuote(plain(b.runs).trim())).length;
      const speechAttributions = section.filter(b => /(?:왈|가로되|말(?:했|하였)다|물었다|대답했다)[,.，]?$/u.test(plain(b.runs).trim())).length;
      const filledLines = section.filter(({ sourceLine: line }) =>
        line.right >= line.columnRight - line.height * 3).length;
      // A credited novel may average fewer characters than a poem because of
      // its short dialogue turns. Repeated attributed speech plus many filled
      // PDF rows is evidence of wrapped narrative, not verse lineation.
      const wrappedDialogue = quotedTurns >= 3 && speechAttributions >= 2 && filledLines >= 6;
      if (section.length >= 4 && (explicitVerse || !wrappedDialogue
        && section.reduce((n, b) => n + plain(b.runs).trim().length, 0) / section.length < 28.5))
        section.forEach(b => verse.add(b));
      start = index + 1;
    });
  }
  const groupKey = (block, line = block.sourceLine) => `${line.region}:${block.role}`;
  const groups = new Map();
  for (const block of blocks) {
    if (verse.has(block) || protectedLine(block, inlineChoices)) continue;
    const line = block.sourceLine;
    const group = groups.get(groupKey(block)) || [];
    group.push(line);
    groups.set(groupKey(block), group);
  }
  const limits = new Map([...groups].map(([key, lines]) => {
    const starts = lines.filter((line) => !line.opening).map((line) => line.left);
    const modes = new Map();
    for (const x of starts) { const bin = Math.round(x / 3) * 3; modes.set(bin, (modes.get(bin) || 0) + 1); }
    const repeatedStarts = [...modes].filter(([, count]) => count >= 3).map(([x]) => x);
    const left = repeatedStarts.length ? Math.min(...repeatedStarts)
      : [...modes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? lines[0].left;
    const height = [...lines].map((line) => line.height).sort((a, b) => a - b)[Math.floor(lines.length / 2)];
    const endings = new Map();
    for (const line of lines) { const bin = Math.round(line.right / 3) * 3; endings.set(bin, (endings.get(bin) || 0) + 1); }
    const aligned = [...endings].filter(([, count]) => count >= 3).map(([x]) => x);
    // A short poem must not define its longest verse as the column's right edge.
    const right = Math.max(...lines.map((line) => Math.max(line.right, line.columnRight - height * 2.2)));
    return [key, { left, right, height, aligned, repeatedStarts }];
  }));
  const result = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    const a = previous?.sourceEnd || previous?.sourceLine, b = block.sourceLine;
    let join = previous && !verse.has(previous) && !verse.has(block) && !protectedLine(previous, inlineChoices, true) && !protectedLine(block, inlineChoices)
      && previous.role === block.role && !block.label;
    if (join) {
      const old = limits.get(groupKey(previous, a)), next = limits.get(groupKey(block, b));
      const sameRegion = a.region === b.region;
      if (!old || !next) { result.push(block); continue; }
      const hanging = previous.label || a.opening || a.left - old.left >= old.height * .45 && a.left - old.left <= old.height * 2;
      const listOpening = previous.label || /^[◦○∙•ㆍ]/u.test(plain(previous.runs).trim());
      const continuationIndent = listOpening && b.left >= a.left - 2 && b.left - a.left <= old.height * 2;
      const ordinaryStart = Math.abs(b.left - next.left) <= Math.max(2, next.height * .25)
        || next.repeatedStarts.some(x => Math.abs(b.left - x) <= 2) && Math.abs(b.left - a.left) <= 2
        || !sameRegion && Math.abs((b.left - next.left) - (a.left - old.left)) <= 2
        || continuationIndent || a.opening && Math.abs(b.left - a.left) <= old.height * 2
        || previous.sourceEnd && Math.abs(b.left - a.left) <= Math.max(2, next.height * .25);
      const nearColumnEdge = a.right >= old.right - old.height * 1.7;
      const sentenceEnded = /[.!?。？！][”’"]?$/u.test(plain(previous.runs).trim());
      const filledLine = nearColumnEdge
        || !sentenceEnded && old.aligned.some((x) => Math.abs(x - a.right) <= 2);
      const gap = a.y - b.y;
      join = ordinaryStart && filledLine && (sameRegion
        ? gap >= old.height * .65 && gap <= old.height * 1.95
          && (Math.abs(a.left - b.left) <= old.height * .45 || hanging || continuationIndent || previous.sourceEnd)
        : true);
      // Preserve separate dialogue turns and list/section headings even if the
      // preceding row happens to fill the column.
      if (/[:：]$/u.test(plain(previous.runs).trim()) || startsQuote(plain(block.runs).trim())) join = false;
    }
    if (join) result[result.length - 1] = { ...previous,
      runs: appendLineRuns(previous.runs, block.runs, referenceText), sourceEnd: b };
    else result.push(block);
  }
  return result;
}
