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
  if (purpose !== "scene") return base;
  return {
    ...base,
    baseInstructions: SCENE_BASE_INSTRUCTIONS,
    developerInstructions: SCENE_DEVELOPER_INSTRUCTIONS,
    environments: [],
    selectedCapabilityRoots: [],
  };
}

module.exports = {
  SCENE_BASE_INSTRUCTIONS,
  SCENE_DEVELOPER_INSTRUCTIONS,
  buildEphemeralThreadStartParams,
};
