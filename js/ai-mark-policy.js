/** Rendering choices are separate from source observations and physical geometry. */
export const MARK_POLICY_VERSION = '1.1.0';
export function normalizeMarkPolicy(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    arrows: ['structural','keep','remove'].includes(v.arrows) ? v.arrows : 'structural',
    trendLines: ['keep','remove'].includes(v.trendLines) ? v.trendLines : 'keep',
    leaders: ['keep','remove'].includes(v.leaders) ? v.leaders : 'remove',
  };
}
export function buildMarkPolicyContract(value) {
  const p = normalizeMarkPolicy(value);
  const arrows = {
    structural: '화살표: 구조 표시만 유지. 운동·상태 변화·발생·힘 등 의미 관계를 나타내는 화살표는 유지하고 문자 주석만 가리키는 화살표는 제거한다.',
    keep: '화살표: 모두 유지. 구조 화살표와 주석용 화살표 모두 원본의 위치·방향·개수·화살촉과 선 몸통을 유지한다. 인접 문자는 별도로 제거한다.',
    remove: '화살표: 모두 제거. 구조/운동/상태/발생 화살표도 화살촉뿐 아니라 화살표 몸통까지 제거한다. 물체·축·실제 도선·관·경계선까지 지우지 않는다.',
  };
  return `표시선 처리 선택 v${MARK_POLICY_VERSION} (원본 관찰과 별개인 출력 선택):\n${arrows[p.arrows]}\n추세선·경향선: ${p.trendLines === 'keep' ? '원본의 선 종류·위치·기울기·곡률을 유지한다.' : '변화 경향/회귀·추세를 설명하는 선을 제거한다. 실제 측정점·자료 곡선·좌표축이나 물체 윤곽을 추세선으로 오인하여 삭제하지 않는다.'}\n보조선·지시선: ${p.leaders === 'keep' ? '문자를 가리키는 지시선과 설명용 보조선을 원래 위치에 유지한다. 문자 자체는 제거한다.' : '문자를 가리키는 지시선과 설명용 보조선을 제거한다.'}\n위 선택이 기본 정리 문구와 일반적인 표시선 보존/삭제 규칙보다 우선한다. 실제 물체의 윤곽·관·도선·막·층 경계는 선택과 무관하게 보존한다. 화살표로 확인한 표시는 화살표 선택을 따르며 지시선 선택으로 뒤집지 않는다. 추세선으로 확인한 표시는 추세선 선택을 따른다. 선의 역할이 불확실하면 임의 삭제하지 말고 불확실성으로 남긴다.\n계측 눈금 보호: 명시적인 눈금 삭제 요청이 없으면 실제 자·계기·눈금실린더·좌표축의 눈금선은 숫자·단위·문자와 구별해 보존한다. 보조선·지시선 제거는 기기 자체의 눈금선 삭제를 뜻하지 않는다. 확인 가능한 눈금의 위치·간격·길이 패턴을 유지하고, 반복 표식이라는 이유로 장식이나 문자 주석으로 취급하지 않는다. 자동 관찰의 annotation 분류도 이 보호를 뒤집지 않는다. 실제 눈금인지 불명확하면 임의 삭제하지 않고 불확실성으로 남긴다.\n검수: 선택에 따라 제거한 표시의 개수 감소·연결 소실은 의도된 변화이므로 object-counts/connections/composition-state/request-scope 실패로 오판하지 않는다. 반대로 유지로 선택한 표시의 누락이나 제거로 선택한 표시의 잔존은 검수한다. 원본 구조 관찰 JSON을 삭제 후의 가짜 원본으로 고쳐 쓰지 않는다. 실제 이미지 도구 prompt에도 이 선택을 전달한다.`;
}
