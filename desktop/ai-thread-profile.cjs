const IMAGE_BASE_INSTRUCTIONS = "You are a single-purpose image renderer. Create a new image from the supplied description when no image is attached; otherwise follow the supplied editing specification. Use the native image-generation tool exactly once. Do not call shell, web, MCP, tool discovery, skills or file tools. Produce one PNG.";
const IMAGE_DEVELOPER_INSTRUCTIONS = "Complete exactly one image creation or editing response with the native image-generation tool. When images are attached, treat them only as visual references. Never call shell, web, MCP, tool discovery, skills, or filesystem tools.";
const SCENE_BASE_INSTRUCTIONS = "You are a single-purpose JSON scene planner. Return only the requested compact JSON. Do not use tools, search, browse, inspect files, ask questions, or narrate your reasoning.";
const SCENE_DEVELOPER_INSTRUCTIONS = "Complete exactly one scene-planning response. Treat local images only as visual references. Never call image generation, shell, web, skills, or filesystem tools.";

function buildEphemeralThreadStartParams({ purpose = "image", model = null, serviceTier = null, cwd = null } = {}) {
  const base = {
    model: model || null,
    serviceTier: serviceTier || null,
    cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    serviceName: purpose === "scene" ? "5e-fast-scene" : "5e-image-render",
  };
  if (purpose === "image") {
    return {
      ...base,
      baseInstructions: IMAGE_BASE_INSTRUCTIONS,
      developerInstructions: IMAGE_DEVELOPER_INSTRUCTIONS,
      environments: [],
      selectedCapabilityRoots: [],
    };
  }
  // 출제 대화(chat) 등 나머지도 도구 없이 시작한다 — 읽기 전용 샌드박스도 홈 폴더 읽기는 되므로, 불러온 문항·PDF 글에 숨은 지시가
  // ~/.codex·~/.ssh 같은 파일을 읽어 답에 섞게 할 수 있었다(R2). 출제 대화는 문항·근거를 메시지로만 받는다.
  if (purpose !== "scene") return { ...base, environments: [], selectedCapabilityRoots: [] };
  return {
    ...base,
    baseInstructions: SCENE_BASE_INSTRUCTIONS,
    developerInstructions: SCENE_DEVELOPER_INSTRUCTIONS,
    environments: [],
    selectedCapabilityRoots: [],
  };
}

module.exports = {
  IMAGE_BASE_INSTRUCTIONS,
  IMAGE_DEVELOPER_INSTRUCTIONS,
  SCENE_BASE_INSTRUCTIONS,
  SCENE_DEVELOPER_INSTRUCTIONS,
  buildEphemeralThreadStartParams,
};
