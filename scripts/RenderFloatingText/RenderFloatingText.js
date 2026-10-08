/**
 * The floating numbers in world space, tilted to face the camera head-on. Inserted after the
 * bodies they float over.
 * @implements {RenderPass}
 */
globalThis.RenderFloatingText = class RenderFloatingText {
  constructor(opt = {}) {
    this.enabled = true;
    this.level = opt.level;
    this.camera = opt.camera;
  }

  destroy() {}

  draw(_entities) {
    FloatingText.draw(this.level, (this.camera.pitch * 180) / Math.PI);
  }
};
