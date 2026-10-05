/**
 * The colony's world-space gameplay cues under the camera's pitch. Inserted after the ground
 * passes, whose opaque fill would hide them.
 * @implements {RenderPass}
 */
globalThis.RenderWorldOverlay = class RenderWorldOverlay {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera;
  }

  destroy() {}

  draw(entities) {
    WorldOverlay.draw(entities, this.camera.pitch);
  }
};
