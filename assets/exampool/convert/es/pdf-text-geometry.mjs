const identity = () => [1, 0, 0, 1, 0, 0];
const multiply = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

// TextContent may merge glyphs drawn with different matrices. Preserve their original placement.
export function equationTextItems(operations, ops, fonts) {
  let state = { ctm: identity(), tm: identity(), x: 0, y: 0, lineX: 0, lineY: 0,
    fontId: '', fontSize: 0, spacing: 0, word: 0, scale: 1, rise: 0, leading: 0 };
  const stack = [];
  const items = [];
  const move = (x, y) => { state.lineX += x; state.lineY += y; state.x = state.lineX; state.y = state.lineY; };
  for (let index = 0; index < operations.fnArray.length; index += 1) {
    const op = operations.fnArray[index], args = operations.argsArray[index];
    if (op === ops.save) stack.push(structuredClone(state));
    else if (op === ops.restore) state = stack.pop() || state;
    else if (op === ops.transform) state.ctm = multiply(state.ctm, args);
    else if (op === ops.beginText) Object.assign(state, { tm: identity(), x: 0, y: 0, lineX: 0, lineY: 0 });
    else if (op === ops.setFont) { state.fontId = args[0]; state.fontSize = args[1]; }
    else if (op === ops.setCharSpacing) state.spacing = args[0];
    else if (op === ops.setWordSpacing) state.word = args[0];
    else if (op === ops.setHScale) state.scale = args[0] / 100;
    else if (op === ops.setTextRise) state.rise = args[0];
    else if (op === ops.setLeading) state.leading = -args[0];
    else if (op === ops.setTextMatrix) Object.assign(state, { tm: Array.from(args[0]), x: 0, y: 0, lineX: 0, lineY: 0 });
    else if (op === ops.moveText) move(args[0], args[1]);
    else if (op === ops.setLeadingMoveText) { state.leading = args[1]; move(args[0], args[1]); }
    else if (op === ops.nextLine) move(0, state.leading);
    else if (op === ops.showText) {
      const font = fonts[state.fontId];
      const math = /^(?:HyhwpEQ|HYhwpEQ)/u.test(font?.name?.split('+').at(-1) || '');
      const matrix = multiply(state.ctm, state.tm);
      const horizontal = Math.hypot(matrix[0], matrix[1]);
      const height = Math.hypot(matrix[2], matrix[3]) * Math.abs(state.fontSize);
      const unit = font?.fontMatrix?.[0] || 0.001;
      for (const glyph of args[0]) {
        if (typeof glyph === 'number') { state.x -= glyph * state.fontSize * state.scale / 1000; continue; }
        if (!glyph) continue;
        const advance = glyph.width * state.fontSize * unit;
        if (math && glyph.unicode?.trim()) {
          const x = matrix[0] * state.x + matrix[2] * (state.y + state.rise) + matrix[4];
          const y = matrix[1] * state.x + matrix[3] * (state.y + state.rise) + matrix[5];
          const width = Math.abs(advance * state.scale * horizontal);
          const previous = items.at(-1);
          if (/^[a-z]+$/u.test(previous?.str || '') && /^[a-z]$/u.test(glyph.unicode)
            && previous.fontName === state.fontId && Math.abs(previous.height - height) < 0.01
            && Math.abs(previous.transform[5] - y) < 0.01
            && Math.abs(previous.transform[4] + previous.width - x) < 0.5) {
            previous.str += glyph.unicode;
            previous.width = x + width - previous.transform[4];
          } else items.push({ str: glyph.unicode, width, height, fontName: state.fontId,
            transform: [horizontal * state.fontSize, 0, 0, height, x, y] });
        }
        state.x += (advance + state.spacing + (glyph.isSpace ? state.word : 0)) * state.scale;
      }
    }
  }
  return items;
}
