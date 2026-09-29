const release = Object.freeze({
  version: '1.6.0',
  releasedAt: '2026.09.29',
  sourceCommit: 'e310624a636e79c0aa4cbcbcff458f0d400b7665',
});

// Release builds show only the version line; the source commit stays available on hover.
const version = document.querySelector('[data-release-version]');
if (version) {
  version.title = `5E ${release.version} · 소스 커밋 ${release.sourceCommit.slice(0, 8)}`;
  version.dataset.sourceCommit = release.sourceCommit;
}
