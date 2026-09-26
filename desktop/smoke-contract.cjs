const requiredTruthy = Object.freeze([
  "panelOpened", "modelCatalogReadable", "captureSourcesReadable", "aiUsesCentralModal",
  "aiAutoConnectControlsSimplified", "aiProgressUiReady", "aiResultsPlacedLeft",
  "aiSourceEntrypointsReady", "aiLoadMenuReady", "aiCaptureCropReady", "aiCancelIsContextual",
  "aiReturnsAfterLibraryClose", "cutChooserVisible", "cutChooserInToolPanel", "textChooserBehavior",
  "angleChooserBehavior", "angleTabToggleWorks", "chooserPanelSwitchingWorks", "cutChooserPersistsAfterChoice",
  "chooserClosesOnOtherTool", "eraseToolReachable", "cutToolReachable", "delayedCutUiReachable",
  "eraseShortcutWorks", "delayedShortcutWorks", "examLibraryAiReferenceWorks", "imageLibraryAiReferenceWorks",
  "aiMultipleReferencesReady", "aiComparisonReady", "aiAreaCommentReady", "aiAreaCommentTracksZoom",
  "aiReferencesOpenImmediately", "aiComposerDockedRight", "aiLocalAssetZeroRoundTripWorks",
  "aiLocalApparatusZeroRoundTripWorks", "aiQualityControlsReady", "aiOutputControlsReady",
  "aiTaskTabsIsolated", "aiWorkspaceControlsReady", "artboardAreaOverlayOpened", "artboardConfirmButtonPresent",
  "artboardAreaCaptureWorks", "artboardCornerHandleRemoved", "artboardSelectionRecentersObjects",
  "artboardSelectionRecentersGuides", "internalCutSeparates", "internalCutSelectsExtracted", "internalCutRendersBoth",
  "menuBarStateValid", "appIconReadable",
]);

function desktopSmokePasses(result) {
  return result.buttonText === "AI 이미지 생성" &&
    result.codexSendInvocationsDuringLocalSmoke === 0 &&
    !result.installDialogOpened &&
    requiredTruthy.every((field) => result[field] === true);
}

module.exports = { desktopSmokePasses, requiredTruthy };
