const fs = require("node:fs");
const path = require("node:path");

const REPORT_SCHEMA = "5e-package-source-audit-v1";
const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_POLICY = path.join(__dirname, "package-assets-policy.json");

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeRelative(value) {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//, "");
  return path.posix.normalize(normalized).replace(/^\/$/, "");
}

function patternIncludesPath(pattern, relativePath) {
  const normalizedPattern = normalizeRelative(pattern);
  const normalizedPath = normalizeRelative(relativePath);
  for (const suffix of ["/**/*", "/**"]) {
    if (normalizedPattern.endsWith(suffix)) {
      const root = normalizedPattern.slice(0, -suffix.length);
      return normalizedPath.startsWith(`${root}/`);
    }
  }
  if (normalizedPattern.endsWith("/*")) {
    const root = normalizedPattern.slice(0, -2);
    return path.posix.dirname(normalizedPath) === root;
  }
  return normalizedPattern === normalizedPath;
}

function listFiles(root, relativeRoot) {
  const absoluteRoot = path.join(root, ...relativeRoot.split("/"));
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (absoluteDirectory, relativeDirectory) => {
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absoluteEntry = path.join(absoluteDirectory, entry.name);
      const relativeEntry = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(absoluteEntry, relativeEntry);
      else if (entry.isFile()) files.push({ path: relativeEntry, bytes: fs.statSync(absoluteEntry).size });
    }
  };
  visit(absoluteRoot, relativeRoot);
  return files;
}

function assetFamily(assetRoot, relativePath) {
  const remainder = relativePath.slice(assetRoot.length).replace(/^\//, "");
  const firstSegment = remainder.split("/")[0];
  return remainder.includes("/") ? `${assetRoot}/${firstSegment}` : assetRoot;
}

function collectAssetFamilies(root, assetRoot, buildFiles) {
  const families = new Map();
  for (const file of listFiles(root, assetRoot)) {
    if (!buildFiles.some((pattern) => patternIncludesPath(pattern, file.path))) continue;
    const familyPath = assetFamily(assetRoot, file.path);
    const family = families.get(familyPath) || { path: familyPath, files: 0, bytes: 0 };
    family.files += 1;
    family.bytes += file.bytes;
    families.set(familyPath, family);
  }
  return [...families.values()].sort((left, right) => compareText(left.path, right.path));
}

function auditPackageSources({ root = DEFAULT_ROOT, policy }) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const buildFiles = [...packageJson.build.files].map(normalizeRelative).sort(compareText);
  const requiredRuntime = [...policy.requiredRuntime].map(normalizeRelative).sort(compareText).map((runtimePath) => ({
    path: runtimePath,
    present: fs.existsSync(path.join(root, ...runtimePath.split("/"))),
    included: buildFiles.some((pattern) => patternIncludesPath(pattern, runtimePath)),
  }));
  const violations = [];
  for (const pattern of policy.forbiddenBuildPatterns.map(normalizeRelative)) {
    if (buildFiles.includes(pattern)) violations.push({ code: "FORBIDDEN_BUILD_PATTERN", value: pattern });
  }
  for (const forbiddenRoot of policy.forbiddenAssetRoots.map(normalizeRelative)) {
    const probe = `${forbiddenRoot}/__package_audit_probe__`;
    if (buildFiles.some((pattern) => patternIncludesPath(pattern, probe))) {
      violations.push({ code: "FORBIDDEN_ASSET_ROOT", value: forbiddenRoot });
    }
  }
  for (const runtime of requiredRuntime) {
    if (!runtime.present) violations.push({ code: "REQUIRED_RUNTIME_MISSING", value: runtime.path });
    else if (!runtime.included) violations.push({ code: "REQUIRED_RUNTIME_EXCLUDED", value: runtime.path });
  }
  violations.sort((left, right) => compareText(left.code, right.code) || compareText(left.value, right.value));
  return {
    schema: REPORT_SCHEMA,
    policySchema: policy.schema,
    buildFiles,
    assetFamilies: collectAssetFamilies(root, normalizeRelative(policy.assetRoot), buildFiles),
    requiredRuntime,
    violations,
  };
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
    process.stderr.write(`${JSON.stringify({ schema: REPORT_SCHEMA, error: error.message })}\n`);
    process.exitCode = 2;
  }
}

module.exports = { auditPackageSources, patternIncludesPath, runCli };
