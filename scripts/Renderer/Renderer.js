/**
 * @typedef {Object} RenderPass
 * @property {boolean} enabled - drawn only while true; toggled in place (e.g. debug overlays)
 * @property {function(): void} destroy
 * @property {function(): void} draw
 */

/**
 * Ordered list of RenderPasses a scene draws each frame. The scene owns one and
 * calls `draw(world)` from its own draw(); passes are inserted in back-to-front
 * order and toggled in place via each pass's `enabled` flag.
 */
globalThis.Renderer = class Renderer {
  constructor() {
    /** @type {RenderPass[]} */
    this.passes = [];
  }

  /** Destroy every pass (freeing native handles) and clear the list. */
  destroy() {
    for (const pass of this.passes) {
      pass.destroy();
    }
    this.passes = [];
  }

  /** Add `pass` at `index` (appended/top by default). @param {RenderPass} pass @returns {Renderer} this */
  insert(pass, index = this.passes.length) {
    this.passes.splice(index, 0, pass);
    return this;
  }

  /** Detach `pass` (does not destroy it). @param {RenderPass} pass @returns {Renderer} this */
  remove(pass) {
    const index = this.passes.indexOf(pass);
    if (index >= 0) {
      this.passes.splice(index, 1);
    }
    return this;
  }

  /** Run every enabled pass in order. @param {World} world */
  draw(world) {
    for (const pass of this.passes) {
      // Every pass declares `enabled` (RenderPass contract); a disabled pass stays in the
      // list but is skipped, so debug overlays toggle in place without re-inserting.
      if (!pass.enabled) continue;
      pass.draw(world);
    }
  }
};
