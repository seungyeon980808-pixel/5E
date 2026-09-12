function createFullscreenCoordinator(target, publish) {
  let desired = Boolean(target.isFullScreen());
  let pendingTarget = null;
  let restoreBounds = null;

  const request = (active) => {
    if (pendingTarget === active) return;
    pendingTarget = active;
    target.setFullScreen(active);
  };

  const settle = (active) => {
    if (pendingTarget === active) pendingTarget = null;
    else desired = active;

    if (active && !restoreBounds) restoreBounds = target.getNormalBounds();
    if (!active && restoreBounds) {
      const current = target.getBounds();
      if (current.width !== restoreBounds.width || current.height !== restoreBounds.height) {
        target.setBounds({
          x: current.x,
          y: current.y,
          width: restoreBounds.width,
          height: restoreBounds.height,
        });
      }
      restoreBounds = null;
    }

    publish(active);
    if (active !== desired) request(desired);
  };

  const enter = () => settle(true);
  const leave = () => settle(false);
  target.on('enter-full-screen', enter);
  target.on('leave-full-screen', leave);

  return {
    current: () => Boolean(target.isFullScreen()),
    toggle: () => {
      desired = !desired;
      if (desired && !restoreBounds) restoreBounds = target.getBounds();
      const active = Boolean(target.isFullScreen());
      if (active !== desired && pendingTarget !== desired) request(desired);
      return desired;
    },
    dispose: () => {
      target.removeListener('enter-full-screen', enter);
      target.removeListener('leave-full-screen', leave);
    },
  };
}

module.exports = { createFullscreenCoordinator };
