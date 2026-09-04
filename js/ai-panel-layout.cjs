"use strict";

const DESKTOP_MODAL_MAX_WIDTH = 1760;
const DESKTOP_MARGIN = 40;
const CONVERSATION_WIDTH = 320;
const SOURCES_WIDTH = 360;

function desktopPaneMetrics(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth) || 0;
  const height = Number(viewportHeight) || 0;
  const modalWidth = Math.min(DESKTOP_MODAL_MAX_WIDTH, Math.max(0, width - DESKTOP_MARGIN));
  const threePane = width >= 1181;
  return {
    mode: threePane ? "three-pane" : "stacked",
    resultWidth: threePane ? modalWidth - CONVERSATION_WIDTH - SOURCES_WIDTH : modalWidth,
    conversationWidth: threePane ? CONVERSATION_WIDTH : modalWidth,
    sourcesWidth: threePane ? SOURCES_WIDTH : modalWidth,
    usableHeight: Math.min(1000, Math.max(0, height - 24)),
    horizontalOverflow: false,
    bottomActionsVisible: height >= 640,
  };
}

module.exports = { desktopPaneMetrics };
