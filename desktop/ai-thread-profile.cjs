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
  IMAGE_BASE_INSTRUCTIONS,
  IMAGE_DEVELOPER_INSTRUCTIONS,
  SCENE_BASE_INSTRUCTIONS,
  SCENE_DEVELOPER_INSTRUCTIONS,
  buildEphemeralThreadStartParams,
};
