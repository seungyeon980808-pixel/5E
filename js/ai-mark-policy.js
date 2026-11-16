/** Rendering choices are separate from source observations and physical geometry. */
export const MARK_POLICY_VERSION = '1.2.0';
export function normalizeMarkPolicy(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    arrows: ['structural','keep','remove'].includes(v.arrows) ? v.arrows : 'keep',
    trendLines: ['keep','remove'].includes(v.trendLines) ? v.trendLines : 'keep',
    leaders: ['keep','remove'].includes(v.leaders) ? v.leaders : 'keep',
  };
}
export function buildMarkPolicyContract(value) {
  const p = normalizeMarkPolicy(value);
  const arrows = {
    structural: '화살표: 구조 표시만 유지. 운동·상태 변화·발생·힘 등 의미 관계를 나타내는 화살표는 유지하고 문자 주석만 가리키는 화살표는 제거한다.',
    keep: '과학적 화살표: 유지. 힘·운동·상태·혈류·전류 등 실제 과학 의미를 나타내는 화살표의 위치·방향·개수·화살촉과 선 몸통을 유지한다. 라벨 소속 주석 화살표는 글자와 함께 전체 선·끝점을 제거한다.',
    remove: '화살표: 모두 제거. 구조/운동/상태/발생 화살표도 화살촉뿐 아니라 화살표 몸통까지 제거한다. 물체·축·실제 도선·관·경계선까지 지우지 않는다.',
  };
  return `표시선 처리 선택 v${MARK_POLICY_VERSION} (원본 관찰과 별개인 출력 선택):\n${arrows[p.arrows]}\n추세선·경향선: ${p.trendLines === 'keep' ? '원본의 선 종류·위치·기울기·곡률을 유지한다.' : '변화 경향/회귀·추세를 설명하는 선을 제거한다. 실제 측정점·자료 곡선·좌표축이나 물체 윤곽을 추세선으로 오인하여 삭제하지 않는다.'}\n보조선·지시선: ${p.leaders === 'keep' ? '라벨 소속이 아닌 설명용 보조선을 원래 위치에 유지한다. 라벨을 가리키는 지시선 전체와 끝점은 글자와 함께 제거한다.' : '문자를 가리키는 지시선과 설명용 보조선을 제거한다.'}\n라벨 소속 제거가 위 표시선 선택보다 우선한다. 강조틀(원·타원·사각형 등 특정 부분을 둘러 강조하는 테두리)·확대 연결선·확대 범위를 나타내는 회색 면은 보조선 선택과 무관하게 항상 제거한다. 일반 라벨 글자·전체 지시선·시작 접점·화살촉·채운 점·빈 원의 테두리를 항상 함께 제거한다. 기타 표시는 위 선택을 따른다. 실제 물체의 윤곽·관·도선·막·층 경계는 선택과 무관하게 보존한다. 라벨 소속이 아닌 과학적 화살표로 확인한 표시는 화살표 선택을 따른다. 추세선으로 확인한 표시는 추세선 선택을 따른다. 선의 역할이 불확실하면 임의 삭제하지 말고 불확실성으로 남긴다.\n계측 눈금 보호: 명시적인 눈금 삭제 요청이 없으면 실제 자·계기·눈금실린더·좌표축의 눈금선은 숫자·단위·문자와 구별해 보존한다. 보조선·지시선 제거는 기기 자체의 눈금선 삭제를 뜻하지 않는다. 확인 가능한 눈금의 위치·간격·길이 패턴을 유지하고, 반복 표식이라는 이유로 장식이나 문자 주석으로 취급하지 않는다. 자동 관찰의 annotation 분류도 이 보호를 뒤집지 않는다. 실제 눈금인지 불명확하면 임의 삭제하지 않고 불확실성으로 남긴다.\n검수: 선택에 따라 제거한 표시의 개수 감소·연결 소실은 의도된 변화이므로 object-counts/connections/composition-state/request-scope 실패로 오판하지 않는다. 반대로 유지로 선택한 표시의 누락이나 제거로 선택한 표시의 잔존은 검수한다. 원본 구조 관찰 JSON을 삭제 후의 가짜 원본으로 고쳐 쓰지 않는다. 실제 이미지 도구 prompt에도 이 선택을 전달한다.`;
}
