function routeFullscreenEscape(event, input, target) {
  if (!target.isFullScreen() || input.key !== 'Escape' || input.isComposing
    || input.alt || input.control || input.meta || input.shift) return false;
  event.preventDefault();
  if (input.type === 'keyDown' && !input.isAutoRepeat) {
    target.webContents.send('window:escape');
  }
  return true;
}

module.exports = { routeFullscreenEscape };
