const test = require('node:test');
const assert = require('node:assert/strict');

// 1.7.1(1단계 09 보고서 D1 ①): 맥 설치 파일은 비용 없이 번들 전체를 임시(ad-hoc) 서명한다.
// 서명이 없거나 실행 파일만 링커 서명이면 번들 봉인이 없어 받은 사람에게 「손상되었기 때문에 열 수 없습니다」가 뜬다.
// 임시 서명 + 하드닝 끔이면 `codesign --verify --deep --strict`가 통과하고, 받은 사람은 「그래도 열기」로 열 수 있다.
// 확인(빌드 뒤): codesign --verify --deep --strict release/mac-arm64/5E.app && codesign -dv release/mac-arm64/5E.app
//   → Signature=adhoc, Sealed Resources version=2 여야 한다.
test('맥 빌드 설정: 번들 전체 임시 서명(identity "-")과 하드닝 끔', () => {
  const mac = require('../package.json').build.mac;
  assert.equal(mac.identity, '-');
  assert.equal(mac.hardenedRuntime, false, '임시 서명 + 하드닝이면 Electron 프레임워크 라이브러리 검증에 걸려 켜지지 않을 수 있음');
  assert.equal(mac.notarize, undefined, '공증은 Apple Developer 계정이 생긴 뒤');
});
