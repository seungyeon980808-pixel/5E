const FEATURE_RULES = Object.freeze([
  { label: "로그 축 척도", pattern: /(?:로그|대수)\s*(?:축|척도)|logarithmic\s*(?:axis|scale)|\.scale\b/i },
  { label: "사용자 지정 축 교점", pattern: /axisAt|축\s*(?:교점|원점|위치)/i },
  { label: "극좌표", pattern: /극좌표|polar/i },
]);

const unique = (values) => [...new Set(values.filter(Boolean))];

export function outputEngineForce(value) {
  if (value === "asset") return "fast-scene";
  if (value === "raster") return "raster";
  return "auto";
}

export function knownUnsupportedGraphFeatures(request) {
  const text = String(request || "");
  return FEATURE_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.label);
}

export function mustKeepNativeFailure({ outputEngine, routeDecision } = {}) {
  return outputEngine === "asset"
    || (outputEngine === "auto" && routeDecision?.engine === "fast-scene" && routeDecision?.rule === "chart-or-graph");
}

export function nativeSceneFailureReport(result = {}, requestedFeatures = []) {
  const issues = [...(result.errors || []), ...(result.unsupported || [])];
  const issueText = (issue) => `${issue?.path || ""} ${issue?.message || ""} ${issue?.code || ""}`;
  const detected = FEATURE_RULES.filter((rule) => issues.some((issue) => rule.pattern.test(issueText(issue))))
    .map((rule) => rule.label);
  const features = unique([...requestedFeatures, ...detected]);
  const detail = features.length ? features.join(", ") : "현재 네이티브 그래프 계약 밖의 요소";
  return {
    features,
    message: `편집 가능한 그래프로 정확히 재현하지 못했습니다. 지원되지 않은 항목: ${detail}. `
      + "원본을 단순 그래프로 바꾸거나 자동으로 래스터로 바꾸지 않았습니다. 지원 가능한 부분 그래프만 별도로 요청하거나, 고급 설정에서 시험문제용 도판을 명시적으로 선택해 주세요.",
  };
}
