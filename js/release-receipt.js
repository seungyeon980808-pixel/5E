const release = Object.freeze({
  version: '1.6.1',
  releasedAt: '2026.10.04',
  // Publication stamps the validated commit after copying its tracked source.
  sourceCommit: null,
  sourceBaseline: '751b1ed4622058497a6f3ba43f92333eb15268eb',
});

// Release builds show only the version line; the source commit stays available on hover.
const version = document.querySelector('[data-release-version]');
if (version) {
  const source = release.sourceCommit || release.sourceBaseline;
  const label = release.sourceCommit ? '소스 커밋' : '원본 기준 소스';
  version.title = `5E ${release.version} · ${label} ${source.slice(0, 8)}`;
  if (release.sourceCommit) version.dataset.sourceCommit = release.sourceCommit;
  else version.dataset.sourceBaseline = release.sourceBaseline;
}
