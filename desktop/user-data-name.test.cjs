const test = require('node:test');
const assert = require('node:assert/strict');

test('사용자 데이터 폴더 이름: package.json name 「5e-desktop」, 맨 위 productName 없음(바뀌면 기존 사용자 자료가 안 보임)', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.name, '5e-desktop');
  assert.equal(pkg.productName, undefined);
  assert.equal(pkg.build.productName, '5E', '설치 파일·앱 이름은 build.productName');
});
