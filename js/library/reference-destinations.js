// Preserve source indices across mixed destinations, storage receipts and retries.
export function referenceDestinations(referenceCount, { placement = 'separate', groups = null, groupKinds = null, conversionKind = 'image' } = {}) {
  const indices = Array.from({ length: referenceCount }, (_, index) => index);
  const assignments = groups ?? (placement === 'together' ? [indices] : indices.map(index => [index]));
  if (!Array.isArray(assignments) || !assignments.length) throw new Error('AI 작업에 보낼 이미지가 없습니다.');
  if (groupKinds !== null && (!Array.isArray(groupKinds) || groupKinds.length !== assignments.length)) {
    throw new Error('이미지 분류와 전달할 자료가 일치하지 않습니다.');
  }
  const destinations = assignments.flatMap((group, ordinal) => {
    const kind = groupKinds?.[ordinal] ?? conversionKind;
    if (!['image', 'graph'].includes(kind)) throw new Error('이미지의 전달 목적이 올바르지 않습니다.');
    if (!Array.isArray(group) || !group.length || new Set(group).size !== group.length
      || group.some(index => !Number.isInteger(index) || index < 0 || index >= referenceCount)) {
      throw new Error('AI 작업에 전달할 이미지 번호가 올바르지 않습니다.');
    }
    if (kind === 'graph') return group.map(index => ({ kind, indices: [index] }));
    if (group.length > 10) throw new Error('한 이미지 작업대는 이미지를 최대 10개까지 받을 수 있습니다.');
    return [{ kind, indices: [...group] }];
  });
  const owners = new Map();
  for (const { kind, indices: assigned } of destinations) for (const index of assigned) {
    if (owners.has(index) && owners.get(index) !== kind) throw new Error('같은 이미지를 서로 다른 AI 분류에 중복 배정할 수 없습니다.');
    owners.set(index, kind);
  }
  return destinations;
}
