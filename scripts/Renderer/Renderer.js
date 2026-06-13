/**
 * @typedef {Object} RenderPass
 * @property {boolean} enabled - drawn only while true; toggled in place (e.g. debug overlays)
 * @property {function(): void} destroy
 * @property {function(): void} draw
 */

globalThis.Renderer = class Renderer {
  constructor() {
    this.passes = [];
  }

  destroy() {
    for (const pass of this.passes) {
      pass.destroy();
    }
    this.passes = [];
  }

  insert(pass, index = this.passes.length) {
    this.passes.splice(index, 0, pass);
    return this;
  }

  remove(pass) {
    const index = this.passes.indexOf(pass);
    if (index >= 0) {
      this.passes.splice(index, 1);
    }
    return this;
  }

  draw(world) {
    for (const pass of this.passes) {
      // Every pass declares `enabled` (RenderPass contract); a disabled pass stays in the
      // list but is skipped, so debug overlays toggle in place without re-inserting.
      if (!pass.enabled) continue;
      pass.draw(world);
    }
  }
};
