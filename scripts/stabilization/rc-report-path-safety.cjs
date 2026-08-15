const path = require("node:path");

const MAX_SCAN_LENGTH = 32768;
const MAX_DECODE_ROUNDS = 4;

function decodeValidPercentBytes(value) {
  return value.replace(/(?:%[0-9a-f]{2})+/giu, (encoded) => {
    try { return decodeURIComponent(encoded); }
    catch {
      return encoded.replace(/%([0-9a-f]{2})/giu,
        (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    }
  });
}

function decodedSurfaces(value) {
  if (value.length > MAX_SCAN_LENGTH) return null;
  const candidates = [value];
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const decoded = decodeValidPercentBytes(candidates.at(-1));
    if (decoded === candidates.at(-1)) break;
    if (decoded.length > MAX_SCAN_LENGTH) return null;
    candidates.push(decoded);
  }
  return candidates;
}

function unsafePlain(value, allowWebRoute = false) {
  if (/(?:^|[^a-z0-9_]|%[a-z0-9]{2})file:/iu.test(value)) return true;
  const trimmed = value.trim();
  const boundary = String.raw`(?:^|[\s"'(){}<>=,;:]|\[|\]|%[a-z0-9]{2})`;
  const windowsToken = new RegExp(`${boundary}(?:[a-z]:[\\\\/]|\\\\)`, "iu");
  const posixToken = new RegExp(`${boundary}/`, "iu");
  if (windowsToken.test(value)) return true;
  if (allowWebRoute) return false;
  return path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed) || posixToken.test(value);
}

function knownLocalRoot(value) {
  const boundary = String.raw`(?:^|[\s"'(){}<>=,;:]|\[|\]|%[a-z0-9]{2})`;
  const roots = "tmp|home|users|var|etc|root|opt|usr|mnt|private|volumes|workspaces?"
    + "|proc|dev|run|sys|bin|boot|lib|lib64|media|sbin|srv|lost\\+found";
  const matcher = new RegExp(`${boundary}/+(?:${roots})(?:/|$)`, "iu");
  if (matcher.test(value)) return true;
  const normalized = normalizedUrlPath(value);
  return normalized !== null && matcher.test(normalized);
}

function normalizedUrlPath(value) {
  const slashNormalized = value.trim().replaceAll("\\", "/");
  return path.posix.isAbsolute(slashNormalized) ? path.posix.normalize(slashNormalized) : null;
}

function rootedWindowsDrive(value) {
  const normalized = normalizedUrlPath(value);
  return normalized !== null && /^\/+[a-z]:\//iu.test(normalized);
}

function semanticPathKey(value) {
  const surfaces = decodedSurfaces(value);
  if (!surfaces) return true;
  return surfaces.some((surface) => {
    const tokens = surface.replace(/([a-z])([A-Z])/gu, "$1-$2").toLowerCase().split(/[^a-z]+/u);
    if (tokens.length === 1 && ["redirect", "next", "route"].includes(tokens[0])) return false;
    const pathWord = /^(?:(?:file|path|dir|directory|root|source|artifact){1,3})(?:name)?$/u;
    return tokens.some((token) => pathWord.test(token));
  });
}

function unsafeUrlValue(value, { pathname = false, denyAbsolute = false } = {}, depth) {
  const surfaces = decodedSurfaces(value);
  if (!surfaces) return true;
  return surfaces.some((surface) => {
    let unsafeUrl = false;
    const remainder = surface.replace(/\bhttps?:\/\/[^\s"'<>)]*/giu, (token) => {
      unsafeUrl ||= unsafeHttpUrl(token, depth + 1);
      return "";
    });
    if (unsafeUrl || knownLocalRoot(remainder) || rootedWindowsDrive(remainder)) return true;
    const trimmed = remainder.trim();
    if (denyAbsolute && path.posix.isAbsolute(trimmed)) return true;
    const candidate = pathname && remainder.startsWith("/") ? remainder.slice(1) : remainder;
    return unsafePlain(candidate, true);
  });
}

function unsafeHash(value, depth) {
  if (unsafeUrlValue(value, {}, depth)) return true;
  const normalized = value.replace(/^[/?#]+/u, "");
  const pairs = normalized.split(/[?&;]/u).filter((part) => part.includes("="));
  return pairs.some((pair) => {
    const separator = pair.indexOf("=");
    const key = pair.slice(0, separator);
    const entry = pair.slice(separator + 1);
    return unsafeUrlValue(key, {}, depth)
      || unsafeUrlValue(entry, { denyAbsolute: semanticPathKey(key) }, depth);
  });
}

function unsafeHttpUrl(token, depth) {
  let parsed;
  try { parsed = new URL(token); }
  catch { return true; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
  if ([parsed.username, parsed.password]
    .some((part) => unsafeUrlValue(part, { denyAbsolute: true }, depth))) return true;
  if (unsafeUrlValue(parsed.pathname, { pathname: true }, depth)
    || unsafeHash(parsed.hash.slice(1), depth)) return true;
  return parsed.search.slice(1).split("&").filter(Boolean).some((pair) => {
    const separator = pair.indexOf("=");
    const key = separator < 0 ? pair : pair.slice(0, separator);
    const value = separator < 0 ? "" : pair.slice(separator + 1);
    return unsafeUrlValue(key, {}, depth)
      || unsafeUrlValue(value, { denyAbsolute: semanticPathKey(key) }, depth);
  });
}

function unsafeSurface(value, depth = 0) {
  if (depth > MAX_DECODE_ROUNDS) return true;
  const candidates = decodedSurfaces(value);
  if (!candidates) return true;
  return candidates.some((candidate) => {
    let unsafeUrl = false;
    const remainder = candidate.replace(/\bhttps?:\/\/[^\s"'<>)]*/giu, (token) => {
      unsafeUrl ||= unsafeHttpUrl(token, depth);
      return "";
    });
    return unsafeUrl || unsafePlain(remainder);
  });
}

module.exports = { unsafeSurface };
