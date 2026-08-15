function scalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('"') && value.endsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  return value;
}

function tokens(source) {
  return source.split(/\r?\n/).flatMap((raw, line) => {
    if (raw.includes("\t")) throw new Error(`tabs are unsupported at line ${line + 1}`);
    const content = raw.trim();
    if (!content || content.startsWith("#")) return [];
    return [{ indent: raw.length - raw.trimStart().length, content, line: line + 1 }];
  });
}

function splitEntry(content, line) {
  const separator = content.indexOf(":");
  if (separator < 1) throw new Error(`expected mapping entry at line ${line}`);
  return [content.slice(0, separator), content.slice(separator + 1).trim()];
}

function blockText(items, state, parentIndent) {
  const text = [];
  while (state.index < items.length && items[state.index].indent > parentIndent) {
    text.push(items[state.index].content);
    state.index += 1;
  }
  return text.join("\n");
}

function entryValue(items, state, entry) {
  const [key, rawValue] = splitEntry(entry.content, entry.line);
  if (rawValue === "|") return [key, blockText(items, state, entry.indent)];
  if (rawValue) return [key, scalar(rawValue)];
  if (state.index < items.length && items[state.index].indent > entry.indent) {
    return [key, parseBlock(items, state, items[state.index].indent)];
  }
  return [key, {}];
}

function parseMap(items, state, indent) {
  const value = {};
  while (state.index < items.length && items[state.index].indent === indent && !items[state.index].content.startsWith("- ")) {
    const entry = items[state.index];
    state.index += 1;
    const [key, parsed] = entryValue(items, state, entry);
    if (Object.hasOwn(value, key)) throw new Error(`duplicate key ${key} at line ${entry.line}`);
    value[key] = parsed;
  }
  return value;
}

function parseList(items, state, indent) {
  const value = [];
  while (state.index < items.length && items[state.index].indent === indent && items[state.index].content.startsWith("- ")) {
    const item = items[state.index];
    state.index += 1;
    const content = item.content.slice(2).trim();
    if (!content.includes(":")) {
      value.push(scalar(content));
      continue;
    }
    const mapped = { indent: indent + 2, content, line: item.line };
    const [key, parsed] = entryValue(items, state, mapped);
    const object = { [key]: parsed };
    if (state.index < items.length && items[state.index].indent === indent + 2) {
      Object.assign(object, parseMap(items, state, indent + 2));
    }
    value.push(object);
  }
  return value;
}

function parseBlock(items, state, indent) {
  return items[state.index].content.startsWith("- ")
    ? parseList(items, state, indent)
    : parseMap(items, state, indent);
}

function parseWorkflow(source) {
  const items = tokens(source);
  if (items.length === 0) throw new Error("workflow is empty");
  const state = { index: 0 };
  const workflow = parseBlock(items, state, items[0].indent);
  if (state.index !== items.length) throw new Error(`unexpected indentation at line ${items[state.index].line}`);
  return workflow;
}

module.exports = { parseWorkflow };
