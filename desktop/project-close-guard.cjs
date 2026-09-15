function validSnapshot(value) {
  if (!value || typeof value !== "object") return null;
  const projectDirty = value.projectDirty === true;
  if (projectDirty && typeof value.projectJson !== "string") return null;
  return {
    projectDirty,
    projectJson: projectDirty ? value.projectJson : "",
    aiRecovered: value.aiRecovered !== false,
    aiHasWork: value.aiHasWork === true,
  };
}

function createProjectCloseGuard({ requestSnapshot, prompt, saveProject, notifyUnrecoverableAi, notifySaveFailure, close }) {
  let checking = false;
  let allowed = false;
  return async () => {
    if (allowed || checking) return false;
    checking = true;
    try {
      const snapshot = validSnapshot(await requestSnapshot());
      if (!snapshot || !snapshot.aiRecovered) {
        await notifyUnrecoverableAi();
        return false;
      }
      if (!snapshot.projectDirty) {
        allowed = true;
        close();
        return true;
      }
      const choice = await prompt(snapshot);
      if (choice === 1) {
        allowed = true;
        close();
        return true;
      }
      if (choice !== 0) return false;
      const outcome = await saveProject(snapshot.projectJson);
      if (outcome?.kind !== "saved") {
        if (outcome?.kind === "failed") await notifySaveFailure?.();
        return false;
      }
      allowed = true;
      close();
      return true;
    } finally {
      checking = false;
    }
  };
}

module.exports = { createProjectCloseGuard };
