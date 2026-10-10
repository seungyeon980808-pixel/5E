export const STYLE_CONTRACT_VERSION = '2.0.0';

export const REQUIRED_STYLE_CHECKS = Object.freeze([
  Object.freeze(['kice-flat-style', 'rhwp 승인 평가원식 선화']),
  Object.freeze(['flat-gray-regions', '필요한 회색 채움·음영'])
]);

// Check identifiers remain stable for saved reports; v2 uses the RHWP image
// harness's approved style, including necessary restrained grayscale shading.
export function buildKiceStyleContract() {
  return `[5e-kice-flat-style v${STYLE_CONTRACT_VERSION}]
기준: rhwp 작업판의 승인된 첫 PNG 이미지 하네스와 같은 표현을 검사한다. 라벨 분석·위치 복원은 별도이며 독자적인 평면색/무음영 스타일을 추가하지 않는다.
표현: 불투명한 흰 배경의 평가원식 흑백 과학 도식. 실제 물체·부품 수, 연결·접촉·안팎 관계, 물질 분포와 상태, 의미 있는 상대 비율·위치·방향을 보존한다.
회색과 음영: 선명한 검정 윤곽과 필요한 회색 채움·음영을 허용한다. 음영을 무조건 없애지 않는다. 피스톤은 내부 유체보다 어둡게 구분하고, 도르래에는 형태 구분을 돕는 절제된 회색 음영을 허용한다. 서로 다른 물질·입자 종류를 무채색에서도 구분한다. 회색이 균일하지 않다는 이유만으로 실패로 판정하지 않는다.
정리: 불필요한 질감·반사·장식은 제거한다. 글자·숫자·단위·수식·라벨·문자만 가리키는 지시선을 제거하되 실제 구조선·경계·눈금은 보존하고 과학적 화살표는 사용자의 명시적 제거/유지 선택을 따른다. 라벨 복원 문구의 원본 서체를 그림 스타일 기준으로 삼지 않는다.
판정: 구조/범주/형태 구분을 돕는 승인된 회색 음영과 불필요한 사진식 광택·반사·질감을 구별한다. 필요한 회색 채움·음영 자체를 실패로 판단하거나 무음영으로 자동 교정하지 않는다. 구조 손상과 문자·지시선 잔존은 별도로 확인한다. 실제 관찰 없이 합격으로 추정하지 않는다.
[END 5e-kice-flat-style]`;
}

// Only known historical harness instructions are rewritten. Case geometry,
// source ownership plans and the user's mark policy remain intact.
const LEGACY_STYLE_REPLACEMENTS = Object.freeze([
  ['선명한 검정 윤곽과 필요한 회색 채움·음영을 사용하되 불필요한 질감·반사·장식은 정리하세요.', '선명한 검정 윤곽과 흰 면을 기본으로 하고, 과학적 구분에 필요한 물리 영역만 균일한 회색 평면색으로 표현하세요. 질감·반사·장식은 제거하세요.'],
  ['음영을 무조건 없애지는 마세요.', '입체 음영·광택·그라데이션은 사용하지 마세요. 과학적 구분에 필요한 균일한 회색 영역과 실제 내부 구조선은 보존하세요.'],
  ['피스톤은 내부 유체보다 어둡게 구분하고, 도르래에는 형태 구분을 돕는 절제된 회색 음영을 사용하세요.', '피스톤과 내부 유체의 과학적 구분은 서로 다른 균일한 평면색으로 유지하세요. 도르래는 검정 윤곽과 흰 면을 기본으로 하고, 원본에서 확인된 물리 영역 구분에만 균일한 회색을 사용하세요. 입체감을 위한 명암은 추가하지 마세요.']
]);

export function normalizeKiceStyleBody(body) {
  if (typeof body !== 'string' || body.length > 200000) throw new TypeError('Invalid KICE style prompt body');
  let normalized = body;
  for (const [before, after] of LEGACY_STYLE_REPLACEMENTS) normalized = normalized.replaceAll(before, after);
  const contract = buildKiceStyleContract();
  const existingContract = /\[5e-kice-flat-style v[^\]\n]+\][\s\S]*?\[END 5e-kice-flat-style\]/g;
  if (existingContract.test(normalized)) return normalized.replace(existingContract, contract);
  if (/(^|\n)표현: 교과서·시험지용 단정한 2D 과학 도식\.[^\n]*/.test(normalized)) return normalized.replace(/(^|\n)표현: 교과서·시험지용 단정한 2D 과학 도식\.[^\n]*/, (_, boundary) => `${boundary}${contract}`);
  return `${contract}\n\n${normalized}`;
}
