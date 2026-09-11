const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultCoreDirectory = path.join(repositoryRoot, "tests");
const childEnvironment = { ...process.env };
delete childEnvironment.NODE_TEST_CONTEXT;

function optionValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a directory`);
  return path.resolve(value);
}

function filesMatching(directory, predicate) {
  return fs.readdirSync(directory)
    .filter(predicate)
    .sort()
    .map((name) => path.join(directory, name));
}

function coreAssertionSuites(directory) {
  return filesMatching(directory, (name) => {
    if (!name.startsWith("test-") || !name.endsWith(".mjs")) return false;
    return fs.readFileSync(path.join(directory, name), "utf8").includes("assert.");
  });
}

function coreDiagnosticScripts(directory) {
  return filesMatching(directory, (name) => {
    if (!name.startsWith("test-") || !name.endsWith(".mjs")) return false;
    return !fs.readFileSync(path.join(directory, name), "utf8").includes("assert.");
  });
}

function printInventory(label, files) {
  console.log(`${label} (${files.length}):`);
  for (const file of files) console.log(`  ${path.relative(repositoryRoot, file)}`);
}

function runNodeTest(files) {
  const result = spawnSync(process.execPath, ["--test", ...files], {
    cwd: repositoryRoot,
    stdio: "inherit",
    env: childEnvironment,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runDiagnostics(files) {
  for (const file of files) {
    const result = spawnSync(process.execPath, [file], {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

const desktopDirectory = optionValue("--desktop-test-dir") ?? __dirname;
const coreDirectory = optionValue("--core-test-dir") ?? defaultCoreDirectory;
const diagnosticMode = process.argv.includes("--diagnostics");
const desktopSuites = filesMatching(desktopDirectory, (name) => name.endsWith(".test.cjs"));
const coreSuites = coreAssertionSuites(coreDirectory);
const diagnosticScripts = coreDiagnosticScripts(coreDirectory);

if (diagnosticMode) {
  if (diagnosticScripts.length === 0) throw new Error("No core diagnostic scripts were found");
  printInventory("Diagnostic scripts (not regression assertions)", diagnosticScripts);
  process.exit(runDiagnostics(diagnosticScripts));
}

const assertionSuites = [...desktopSuites, ...coreSuites];
if (assertionSuites.length === 0) throw new Error("No assertion suites were found");
printInventory("Assertion suites", assertionSuites);
console.log(`Diagnostics excluded from this gate: ${diagnosticScripts.length} (npm run test:diagnostics)`);
process.exit(runNodeTest(assertionSuites));
