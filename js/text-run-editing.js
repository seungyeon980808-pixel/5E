import { normalizeTextRuns, normalizeTextRunStyle, textRunStyleFromObject, textRunsToText, resolveTextLetterSpacing } from "./state.js?v=1.7.0-four-session-integration";

/* ----- run-list slicing: return the [start,end) character window of a run list
 * as its own run array, splitting runs at the boundaries. Preserves each run's
 * style, so styled (palette) symbols keep their font when text around them edits. */
function _sliceRuns(runs, start, end) {
  const out = [];
  let pos = 0;
  for (const r of runs) {
    const text = String(r.text ?? "");
    const rStart = pos, rEnd = pos + text.length;
    const s = Math.max(start, rStart), e = Math.min(end, rEnd);
    if (s < e) out.push({ text: text.slice(s - rStart, e - rStart), style: r.style });
    pos = rEnd;
    if (pos >= end) break;
  }
  return out;
}

// Merge/normalize a raw run list against the draft's base style (drops empties,
// coalesces adjacent same-style runs, fills missing style fields).
function _normalizeRunList(draft, list) {
  return normalizeTextRuns({ ...draft, textRuns: list });
}

/* Reconcile draft.textRuns to a new plain-text value WITHOUT discarding styled
 * runs. The old value is the runs' current text; the changed span is found via a
 * common prefix/suffix diff. Only the typed-over region is rebuilt (as a plain
 * base-style run); untouched runs — including palette-inserted symbols — survive.
 * This replaces the old flatten-to-one-run behavior that erased symbol styling. */
export function syncDraftRunsToText(draft, raw) {
  if (!draft) return;
  const runs = normalizeTextRuns(draft);
  const oldValue = textRunsToText(runs);
  const newValue = String(raw ?? "");
  if (oldValue === newValue) { draft.textRuns = runs; return; }
  const oldLen = oldValue.length, newLen = newValue.length;
  let p = 0;
  while (p < oldLen && p < newLen && oldValue[p] === newValue[p]) p++;
  let sfx = 0;
  while (sfx < (oldLen - p) && sfx < (newLen - p) &&
         oldValue[oldLen - 1 - sfx] === newValue[newLen - 1 - sfx]) sfx++;
  const head = _sliceRuns(runs, 0, p);
  const tail = _sliceRuns(runs, oldLen - sfx, oldLen);
  const midText = newValue.slice(p, newLen - sfx);
  const mid = midText ? [{ text: midText, style: textRunStyleFromObject(draft) }] : [];
  draft.textRuns = _normalizeRunList(draft, [...head, ...mid, ...tail]);
}

export function setDraftWholeTextStyle(draft, style) {
  // Re-style existing runs BEFORE mutating the object base, so role runs keep the
  // font metadata they were inserted with.
  const runs = normalizeTextRuns(draft);
  Object.assign(draft, {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? "italic" : "normal",
    italic: style.italic,
    letterSpacing: resolveTextLetterSpacing(style),
  });
  const base = normalizeTextRunStyle(style, draft);
  // Whole-text font/size/bold/italic applies to plain (role: normal) runs only.
  // Palette-inserted symbols (sectionRoman/quantity) keep their own Times font;
  // they only inherit the new size so the symbol scales with the rest of the text.
  draft.textRuns = runs.map((r) => {
    const role = (r.style && r.style.role) || "normal";
    if (role !== "normal") {
      return { text: r.text, style: { ...r.style, fontSize: base.fontSize } };
    }
    return { text: r.text, style: base };
  });
}
