/** Explicit input choices travel together through request, cache and recovery. */
export const IMAGE_LABEL_WORKFLOW_VERSION = '1.1.0';
export function normalizeImageLabelWorkflow(value, { requireExplicit = false } = {}) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const imageKind = ['exam', 'general'].includes(v.imageKind) ? v.imageKind : null;
  const labelResult = ['remove', 'restore-editable'].includes(v.labelResult) ? v.labelResult : null;
  const validVersion = v.version === undefined || v.version === '1.0.0' || v.version === IMAGE_LABEL_WORKFLOW_VERSION;
  const validPolicies = (v.auxiliaryMarks === undefined || ['keep', 'remove'].includes(v.auxiliaryMarks))
    && (v.scientificArrows === undefined || ['keep', 'remove'].includes(v.scientificArrows))
    && (v.verificationMode === undefined || ['full', 'draft-first'].includes(v.verificationMode));
  const explicit = Boolean(imageKind && labelResult && validVersion && validPolicies && v.explicit !== false);
  if (requireExplicit && !explicit) throw new TypeError('이미지 종류와 라벨 처리 선택을 확인해야 합니다. 이전 작업의 처리 정책을 자동으로 추측하지 않습니다.');
  return Object.freeze({ version: IMAGE_LABEL_WORKFLOW_VERSION, imageKind, labelResult,
    verificationMode: v.verificationMode === 'draft-first' ? 'draft-first' : 'full',
    auxiliaryMarks: ['keep', 'remove'].includes(v.auxiliaryMarks) ? v.auxiliaryMarks : 'keep',
    scientificArrows: ['keep', 'remove'].includes(v.scientificArrows) ? v.scientificArrows : 'keep', explicit });
}
export function buildImageLabelWorkflowContract(value) {
  const p = normalizeImageLabelWorkflow(value, { requireExplicit: true });
  return `[5e-image-label-workflow v${p.version}]\n이미지 종류: ${p.imageKind}. 라벨 결과: ${p.labelResult}.\n${p.imageKind === 'exam'
    ? '기출 원본 보존: 전체 이미지 생성·스타일 변환 금지. 확인된 국소 제거 마스크 안에서만 처리하고 마스크 밖 디코딩 픽셀을 정확히 보존한다. 국소 복원은 필요시 최대 1회이며 실패를 전체 생성으로 대체하지 않는다.'
    : '일반 이미지: 확정한 같은 라벨 제거 계획을 최초 스타일 변환 1회에 적용한다. 기본 자동 추가 교정은 0회이며 그림 정밀 복원은 별도 사용자 선택이다.'}\n라벨 글자와 소속 지시선 전체·접점·화살촉·채운 점·빈 원 끝점은 항상 함께 제거한다. 보조선 또는 과학적 화살표 유지 옵션은 라벨 소속 제거를 뒤집지 않는다.\n기타 보조선·확대 연결선·강조틀: ${p.auxiliaryMarks}. 과학적 힘·운동·혈류·전류 화살표: ${p.scientificArrows}. 실제 관·혈관·배선·물체 윤곽·눈금과 그래프 내부 표기는 보존한다. 소속이 불확실하면 임의 삭제하지 않고 검수 대상으로 남긴다.\n원본 분석과 제거 계획은 한 번 확정한다. ${p.labelResult === 'restore-editable' ? `원본에 있던 라벨만 기존 5E 편집 객체로 복원한다. ${p.verificationMode === 'draft-first' ? '로컬 편집 초안을 먼저 제공하고 최종 연결·품질 검수는 사용자 선택으로 수행한다. 미검수 초안을 자동 승인하지 않는다.' : '최종 후보의 연결 대상 대응을 확인한다.'}` : '편집 라벨을 생성하지 않는다.'}`;
}
