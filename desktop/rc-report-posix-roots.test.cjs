const test = require("node:test");
const assert = require("node:assert/strict");
const { fixture, options } = require("./rc-package-provenance-fixture.cjs");

const LOCAL_ROOTS = [
  "tmp", "home", "Users", "var", "etc", "root", "opt", "usr", "mnt", "private", "Volumes",
  "workspace", "workspaces", "proc", "dev", "run", "sys", "bin", "boot", "lib", "lib64", "media",
  "sbin", "srv", "lost+found",
];
const WEB_ROOTS = ["dashboard", "api", "route", "assets"];

function load() {
  return require("../scripts/stabilization/rc-package-provenance.cjs");
}

function encodings(root) {
  const raw = `/${root}/entry`;
  const encoded = encodeURIComponent(raw);
  return [raw, encoded, encodeURIComponent(encoded)];
}

function traversalEncodings(value) {
  const encoded = value.replaceAll("/", "%2F").replaceAll(".", "%2E");
  return [value, encoded, encoded.replaceAll("%", "%25")];
}

function driveEncodings(value) {
  const encoded = value.replaceAll("/", "%2F").replaceAll("\\", "%5C").replaceAll(":", "%3A");
  return [value, encoded, encoded.replaceAll("%", "%25")];
}

function urlSurfaces(root) {
  const componentValues = encodings(root);
  const userinfoValues = componentValues.slice(1).concat(encodeURIComponent(componentValues.at(-1)));
  return componentValues.flatMap((surface) => [
    `https://example.test/${surface.replace(/^\//u, "")}`,
    `https://example.test/a?next=${surface}`,
    `https://example.test/a#${surface}`,
  ]).concat(userinfoValues.map((surface) => `https://${surface}@example.test/a`));
}

for (const root of LOCAL_ROOTS) {
  for (const unsafeUrl of urlSurfaces(root)) {
    test(`Given the POSIX /${root} root in a URL component, When audited, Then it is rejected`, (t) => {
      const item = fixture(t);
      item.policyReports.source.unknown = unsafeUrl;
      assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
    });
  }
}

for (const root of WEB_ROOTS) {
  for (const safeUrl of encodings(root).flatMap((surface) => [
    `https://example.test/${surface.replace(/^\//u, "")}`,
    `https://example.test/a?next=${surface}`,
    `https://example.test/a#${surface}`,
  ])) {
    test(`Given the ordinary /${root} web root, When audited, Then it remains allowed`, (t) => {
      const item = fixture(t);
      item.policyReports.source.unknown = safeUrl;
      assert.doesNotThrow(() => load().createCandidateProvenance(item, options()));
    });
  }
}

for (const traversal of traversalEncodings("/dashboard/../proc/entry")) {
  for (const unsafeUrl of [
    `https://example.test/${traversal.replace(/^\//u, "")}`,
    `https://example.test/a?next=${traversal}`,
    `https://example.test/a#${traversal}`,
  ]) {
    test("Given a dot-segment traversal to /proc, When audited, Then it is rejected", (t) => {
      const item = fixture(t);
      item.policyReports.source.unknown = unsafeUrl;
      assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
    });
  }
}

for (const traversal of traversalEncodings("/dashboard/../proc/entry").slice(1)
  .concat("%25252Fdashboard%25252F%25252E%25252E%25252Fproc%25252Fentry")) {
  test("Given a decoded userinfo traversal to /proc, When audited, Then it is rejected", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = `https://${traversal}@example.test/a`;
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}

for (const traversal of ["/../../proc/entry", "/dashboard\\..//proc/entry"]) {
  test("Given an above-root or mixed-slash traversal, When audited, Then it is rejected", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = `https://example.test/a?next=${traversal}`;
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}

for (const route of ["/dashboard/../profile", "/assets/../route"]) {
  for (const surface of traversalEncodings(route)) {
    test("Given a benign normalized web route, When audited, Then it remains allowed", (t) => {
      const item = fixture(t);
      item.policyReports.source.unknown = `https://example.test/a?next=${surface}#${surface}`;
      assert.doesNotThrow(() => load().createCandidateProvenance(item, options()));
    });
  }
}

for (const driveRoute of driveEncodings("/dashboard/../C:/secret/entry")) {
  for (const unsafeUrl of [
    `https://example.test/${driveRoute.replace(/^\//u, "")}`,
    `https://example.test/a?next=${driveRoute}`,
    `https://example.test/a#route=${driveRoute}`,
  ]) {
    test("Given a slash-prefixed Windows drive route, When audited, Then it is rejected", (t) => {
      const item = fixture(t);
      item.policyReports.source.unknown = unsafeUrl;
      assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
    });
  }
}

for (const driveRoute of [
  "/dashboard/..///C:/secret/entry",
  "/dashboard/../c:/secret/entry",
  "/dashboard/../c:\\secret\\entry",
]) {
  test("Given a multi-slash lowercase or backslash drive route, When audited, Then it is rejected", (t) => {
    const item = fixture(t);
    item.policyReports.source.unknown = `https://example.test/a?next=${driveRoute}`;
    assert.throws(() => load().createCandidateProvenance(item, options()), /PROVENANCE_AUDIT_PATH_UNSAFE/);
  });
}
