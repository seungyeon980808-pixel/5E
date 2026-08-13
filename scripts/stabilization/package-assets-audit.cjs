const fs = require("node:fs");
const path = require("node:path");
const { AuditInputError, flattenScopes, isIncluded, normalizeScopedPath, parseBuildFiles } = require("./package-file-matcher.cjs");

const REPORT_SCHEMA = "5e-package-source-audit-v1";
const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_POLICY = path.join(__dirname, "package-assets-policy.json");

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePolicy(policy) {
  const assetRoot = normalizeScopedPath(policy.assetRoot, "POLICY_PATH_OUTSIDE_ROOT");
  const paths = (values) => [...values]
    .map((value) => normalizeScopedPath(value, "POLICY_PATH_OUTSIDE_ROOT", { allowGlob: true }))
    .sort(compareText);
  const normalized = {
    schema: policy.schema,
    assetRoot,
    allowedAssetRoots: paths(policy.allowedAssetRoots),
    requiredRuntime: paths(policy.requiredRuntime),
    forbiddenBuildPatterns: paths(policy.forbiddenBuildPatterns),
    forbiddenAssetRoots: paths(policy.forbiddenAssetRoots),
  };
  for (const root of [...normalized.allowedAssetRoots, ...normalized.forbiddenAssetRoots]) {
    if (root !== assetRoot && !root.startsWith(`${assetRoot}/`)) {
      const error = new Error("POLICY_ASSET_ROOT_MISMATCH");
      error.code = "POLICY_ASSET_ROOT_MISMATCH";
      throw error;
    }
  }
  return normalized;
}

function realpathInside(canonicalRoot, absolutePath) {
  const canonicalPath = fs.realpathSync.native(absolutePath);
  const relative = path.relative(canonicalRoot, canonicalPath);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return canonicalPath;
  }
  throw new AuditInputError("PACKAGE_PATH_OUTSIDE_ROOT", "PACKAGE_PATH_OUTSIDE_ROOT");
}

function listFiles(root, relativeRoot) {
  const absoluteRoot = path.join(root, ...relativeRoot.split("/"));
  let rootStats;
  try {
    rootStats = fs.lstatSync(absoluteRoot);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  realpathInside(root, absoluteRoot);
  if (rootStats.isSymbolicLink()) {
    throw new AuditInputError("PACKAGE_ASSET_LINK_UNSUPPORTED", "PACKAGE_ASSET_LINK_UNSUPPORTED");
  }
  const files = [];
  const visitedDirectories = new Set();
  const visit = (absoluteDirectory, relativeDirectory) => {
    const canonicalDirectory = realpathInside(root, absoluteDirectory);
    if (visitedDirectories.has(canonicalDirectory)) return;
    visitedDirectories.add(canonicalDirectory);
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absoluteEntry = path.join(absoluteDirectory, entry.name);
      const relativeEntry = path.posix.join(relativeDirectory, entry.name);
      const linkStats = fs.lstatSync(absoluteEntry);
      realpathInside(root, absoluteEntry);
      if (linkStats.isSymbolicLink()) {
        throw new AuditInputError("PACKAGE_ASSET_LINK_UNSUPPORTED", "PACKAGE_ASSET_LINK_UNSUPPORTED");
      }
      const stats = fs.statSync(absoluteEntry);
      if (stats.isDirectory()) visit(absoluteEntry, relativeEntry);
      else if (stats.isFile()) files.push({ path: relativeEntry, bytes: stats.size });
    }
  };
  visit(absoluteRoot, relativeRoot);
  return files;
}

function runtimeStatus(root, runtimePath, matcherScopes) {
  const absolutePath = path.join(root, ...runtimePath.split("/"));
  let linkStats;
  try {
    linkStats = fs.lstatSync(absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") return { path: runtimePath, present: false, included: isIncluded(matcherScopes, runtimePath) };
    throw error;
  }
  try {
    realpathInside(root, absolutePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new AuditInputError("REQUIRED_RUNTIME_NOT_FILE", "REQUIRED_RUNTIME_NOT_FILE");
  }
  const stats = linkStats.isSymbolicLink() ? fs.statSync(absolutePath) : linkStats;
  if (!stats.isFile()) throw new AuditInputError("REQUIRED_RUNTIME_NOT_FILE", "REQUIRED_RUNTIME_NOT_FILE");
  return { path: runtimePath, present: true, included: isIncluded(matcherScopes, runtimePath) };
}

function assetFamily(assetRoot, relativePath) {
  const remainder = relativePath.slice(assetRoot.length).replace(/^\//, "");
  const firstSegment = remainder.split("/")[0];
  return remainder.includes("/") ? `${assetRoot}/${firstSegment}` : assetRoot;
}

function collectAssetFamilies(root, assetRoot, matchers) {
  const families = new Map();
  for (const file of listFiles(root, assetRoot)) {
    if (!isIncluded(matchers, file.path)) continue;
    const familyPath = assetFamily(assetRoot, file.path);
    const family = families.get(familyPath) || { path: familyPath, files: 0, bytes: 0 };
    family.files += 1;
    family.bytes += file.bytes;
    families.set(familyPath, family);
  }
  return [...families.values()].sort((left, right) => compareText(left.path, right.path));
}

function auditPackageSources({ root = DEFAULT_ROOT, policy }) {
  const canonicalRoot = fs.realpathSync.native(root);
  const packageJson = JSON.parse(fs.readFileSync(path.join(canonicalRoot, "package.json"), "utf8"));
  const matcherScopes = parseBuildFiles(packageJson.build.files);
  const matchers = flattenScopes(matcherScopes);
  const normalizedPolicy = normalizePolicy(policy);
  const buildFiles = matchers.map(({ pattern, negative }) => `${negative ? "!" : ""}${pattern}`).sort(compareText);
  const requiredRuntime = normalizedPolicy.requiredRuntime
    .map((runtimePath) => runtimeStatus(canonicalRoot, runtimePath, matcherScopes));
  const assetFamilies = collectAssetFamilies(canonicalRoot, normalizedPolicy.assetRoot, matcherScopes);
  const violations = [];
  for (const pattern of normalizedPolicy.forbiddenBuildPatterns) {
    if (matchers.some((matcher) => !matcher.negative && matcher.pattern === pattern)) {
      violations.push({ code: "FORBIDDEN_BUILD_PATTERN", value: pattern });
    }
  }
  for (const forbiddenRoot of normalizedPolicy.forbiddenAssetRoots) {
    if (isIncluded(matcherScopes, `${forbiddenRoot}/__package_audit_probe__`)) {
      violations.push({ code: "FORBIDDEN_ASSET_ROOT", value: forbiddenRoot });
    }
  }
  for (const family of assetFamilies) {
    if (!normalizedPolicy.allowedAssetRoots.includes(family.path)) {
      violations.push({ code: "UNAPPROVED_ASSET_ROOT", value: family.path });
    }
  }
  for (const runtime of requiredRuntime) {
    if (!runtime.present) violations.push({ code: "REQUIRED_RUNTIME_MISSING", value: runtime.path });
    else if (!runtime.included) violations.push({ code: "REQUIRED_RUNTIME_EXCLUDED", value: runtime.path });
  }
  violations.sort((left, right) => compareText(left.code, right.code) || compareText(left.value, right.value));
  return { schema: REPORT_SCHEMA, policySchema: normalizedPolicy.schema, buildFiles, assetFamilies, requiredRuntime, violations };
}

function parseArguments(argv) {
  const options = { root: DEFAULT_ROOT, policyPath: DEFAULT_POLICY, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--strict") options.strict = true;
    else if (argument === "--root") options.root = path.resolve(argv[++index]);
    else if (argument === "--policy") options.policyPath = path.resolve(argv[++index]);
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  return options;
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const policy = JSON.parse(fs.readFileSync(options.policyPath, "utf8"));
  const report = auditPackageSources({ root: options.root, policy });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (options.strict && report.violations.length > 0) process.exitCode = 1;
  return report;
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schema: REPORT_SCHEMA, code: error.code, error: error.message })}\n`);
    process.exitCode = 2;
  }
}

module.exports = { auditPackageSources, runCli };
