const requiredTruthy = Object.freeze([
  "panelOpened", "modelCatalogReadable", "captureSourcesReadable", "aiUsesCentralModal",
  "aiAutoConnectControlsSimplified", "aiProgressUiReady", "aiResultsPlacedLeft",
  "aiSourceEntrypointsReady", "aiLoadMenuReady", "aiCaptureCropReady", "aiCancelIsContextual",
  "aiReturnsAfterLibraryClose", "cutChooserVisible", "cutChooserInToolPanel", "textChooserBehavior",
  "angleChooserBehavior", "angleTabToggleWorks", "chooserPanelSwitchingWorks", "cutChooserPersistsAfterChoice",
  "chooserClosesOnOtherTool", "eraseToolReachable", "cutToolReachable", "delayedCutUiReachable",
  "eraseShortcutWorks", "delayedShortcutWorks", "currentSourceReferenceWorks", "aiReferencesOpenImmediately",
  "aiTaskIsolationWorks", "aiCurrentComparisonReady", "aiAreaCommentReady", "aiAreaCommentTracksZoom",
  "aiComposerDockedRight", "aiPublicRasterVisible", "aiPublicAssetHidden",
  "aiQualityControlsReady", "aiOutputControlsReady", "aiWorkspaceControlsReady",
  "artboardAreaOverlayOpened", "artboardConfirmButtonPresent",
  "artboardAreaCaptureWorks", "artboardCornerHandleRemoved", "artboardSelectionRecentersObjects",
  "artboardSelectionRecentersGuides", "internalCutSeparates", "internalCutSelectsExtracted", "internalCutRendersBoth",
  "menuBarStateValid", "appIconReadable",
]);

function desktopSmokePasses(result) {
  return result.buttonText === "AI 이미지 변환" &&
    result.codexSendInvocationsDuringLocalSmoke === 0 &&
    result.realSendCount === 0 &&
    result.fixtureSendCount === 1 &&
    !result.installDialogOpened &&
    requiredTruthy.every((field) => result[field] === true);
}

module.exports = { desktopSmokePasses, requiredTruthy };
