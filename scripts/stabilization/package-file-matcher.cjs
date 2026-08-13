const path = require("node:path");

class AuditInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuditInputError";
    this.code = code;
  }
}

function slash(value) {
  return String(value).replaceAll("\\", "/");
}

function normalizeScopedPath(value, code, { allowGlob = false, allowEmpty = false } = {}) {
  if (typeof value !== "string") throw new AuditInputError(code, `${code}: expected string`);
  const source = slash(value).replace(/^\.\//, "");
  if (path.posix.isAbsolute(source) || path.win32.isAbsolute(value)) {
    throw new AuditInputError(code, `${code}: absolute path`);
  }
  if (source.split("/").includes("..")) throw new AuditInputError(code, `${code}: parent traversal`);
  const normalized = path.posix.normalize(source || ".").replace(/^\.\//, "");
  const result = normalized === "." ? "" : normalized.replace(/\/$/, "");
  if (!allowEmpty && !result) throw new AuditInputError(code, `${code}: empty path`);
  if (!allowGlob && /[*?\[\]{}]/.test(result)) throw new AuditInputError(code, `${code}: wildcard path`);
  return result;
}

function segmentMatches(pattern, value) {
  let expression = "^";
  for (const character of pattern) {
    if (character === "*") expression += ".*";
    else if (character === "?") expression += ".";
    else expression += character.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${expression}$`).test(value);
}

function globMatches(pattern, relativePath) {
  const candidate = normalizeScopedPath(relativePath, "BUILD_PATH_OUTSIDE_ROOT", { allowEmpty: true });
  const normalized = normalizeScopedPath(pattern, "BUILD_PATTERN_OUTSIDE_ROOT", { allowGlob: true });
  if (!/[*?]/.test(normalized) && (candidate === normalized || candidate.startsWith(`${normalized}/`))) return true;
  const patterns = normalized.split("/");
  const segments = candidate ? candidate.split("/") : [];
  const memo = new Map();
  const visit = (patternIndex, segmentIndex) => {
    const key = `${patternIndex}:${segmentIndex}`;
    if (memo.has(key)) return memo.get(key);
    let matched;
    if (patternIndex === patterns.length) matched = segmentIndex === segments.length;
    else if (patterns[patternIndex] === "**") {
      matched = visit(patternIndex + 1, segmentIndex)
        || (segmentIndex < segments.length && visit(patternIndex, segmentIndex + 1));
    } else {
      matched = segmentIndex < segments.length
        && segmentMatches(patterns[patternIndex], segments[segmentIndex])
        && visit(patternIndex + 1, segmentIndex + 1);
    }
    memo.set(key, matched);
    return matched;
  };
  return visit(0, 0);
}

function sourcePattern(value) {
  if (typeof value !== "string") {
    throw new AuditInputError("UNSUPPORTED_FILE_SET", "UNSUPPORTED_FILE_SET: filter must be string");
  }
  if (value.startsWith("!!") || value.startsWith("!(")) {
    throw new AuditInputError("UNSUPPORTED_GLOB_SYNTAX", "UNSUPPORTED_GLOB_SYNTAX");
  }
  const negative = value.startsWith("!");
  const rawPattern = negative ? value.slice(1) : value;
  if (/[\\{}\[\]]/.test(rawPattern) || /[@+?!*]\(/.test(rawPattern)) {
    throw new AuditInputError("UNSUPPORTED_GLOB_SYNTAX", "UNSUPPORTED_GLOB_SYNTAX");
  }
  const filter = normalizeScopedPath(rawPattern, "BUILD_PATTERN_OUTSIDE_ROOT", { allowGlob: true });
  return { pattern: filter, negative };
}

function parseBuildFiles(value) {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.some((entry) => typeof entry !== "string")) {
    throw new AuditInputError("UNSUPPORTED_FILE_SET", "UNSUPPORTED_FILE_SET");
  }
  const scope = entries.map((entry) => Object.freeze(sourcePattern(entry)));
  return Object.freeze([Object.freeze(scope)]);
}

function scopeIncludes(matchers, relativePath) {
  let included = false;
  for (const matcher of matchers) {
    if (globMatches(matcher.pattern, relativePath)) included = !matcher.negative;
  }
  return included;
}

function isIncluded(scopes, relativePath) {
  return scopes.some((scope) => scopeIncludes(scope, relativePath));
}

function flattenScopes(scopes) {
  return scopes.flat();
}

module.exports = { AuditInputError, flattenScopes, globMatches, isIncluded, normalizeScopedPath, parseBuildFiles };
