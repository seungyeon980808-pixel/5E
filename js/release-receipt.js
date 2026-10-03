const release = Object.freeze({
  version: '1.6.0',
  releasedAt: '2026.09.29',
  // Publication stamps the validated commit after copying its tracked source.
  sourceCommit: null,
  sourceBaseline: 'e310624a636e79c0aa4cbcbcff458f0d400b7665',
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
