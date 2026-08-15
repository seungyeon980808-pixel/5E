function fail() {
  throw new Error("JSON_INVALID");
}

function parseStrictJson(text) {
  if (typeof text !== "string") fail();
  let index = 0;

  function whitespace() {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/u.test(text[index])) index += 1;
  }

  function string() {
    if (text[index] !== '"') fail();
    const start = index++;
    while (index < text.length) {
      const character = text[index++];
      if (character === '"') {
        try { return JSON.parse(text.slice(start, index)); }
        catch { fail(); }
      }
      if (character.charCodeAt(0) < 0x20) fail();
      if (character !== "\\") continue;
      const escaped = text[index++];
      if (escaped === "u") {
        if (!/^[0-9a-fA-F]{4}$/u.test(text.slice(index, index + 4))) fail();
        index += 4;
      } else if (!'"\\/bfnrt'.includes(escaped)) fail();
    }
    fail();
  }

  function primitive() {
    const remainder = text.slice(index);
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(remainder);
    if (!match) fail();
    index += match[0].length;
  }

  function array() {
    index += 1;
    whitespace();
    if (text[index] === "]") { index += 1; return; }
    while (true) {
      value();
      whitespace();
      if (text[index] === "]") { index += 1; return; }
      if (text[index++] !== ",") fail();
      whitespace();
    }
  }

  function object() {
    index += 1;
    whitespace();
    const keys = new Set();
    if (text[index] === "}") { index += 1; return; }
    while (true) {
      const key = string();
      if (keys.has(key)) throw new Error("JSON_DUPLICATE_KEY");
      keys.add(key);
      whitespace();
      if (text[index++] !== ":") fail();
      whitespace();
      value();
      whitespace();
      if (text[index] === "}") { index += 1; return; }
      if (text[index++] !== ",") fail();
      whitespace();
    }
  }

  function value() {
    whitespace();
    if (text[index] === "{") object();
    else if (text[index] === "[") array();
    else if (text[index] === '"') string();
    else primitive();
  }

  value();
  whitespace();
  if (index !== text.length) fail();
  try { return JSON.parse(text); }
  catch { fail(); }
}

module.exports = { parseStrictJson };
