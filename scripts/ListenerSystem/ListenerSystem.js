/**
 * Hears from the tracked body, not the view: the view clamps at map edges and a free camera flies
 * away from it; the view's look-at is the fallback without a tracked body.
 */
globalThis.ListenerSystem = {
  update(level) {
    const entities = level.entities;
    const ep = entities.get(entities.first(CameraFocus), Position);
    if (ep !== undefined) {
      Audio.listen(ep.x, ep.y);
      return;
    }
    const view = CameraSystem.view(level);
    Audio.listen(view.toX, view.toY);
  },
};
