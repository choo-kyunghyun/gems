/**
 * @typedef {Object} RenderPass
 * @property {boolean} enabled - drawn only while true; toggled in place (e.g. debug overlays)
 * @property {function(): void} destroy
 * @property {function(): void} draw
 */

/** ordered back-to-front pass list; scene owns one, calls draw(world) each frame. */
globalThis.Renderer = class Renderer {
  constructor() {
    /** @type {RenderPass[]} */
    this.passes = [];
  }

  /** destroy every pass and clear the list. */
  destroy() {
    for (const pass of this.passes) {
      pass.destroy();
    }
    this.passes = [];
  }

  /** insert `pass` at `index` (default: append). @param {RenderPass} pass @returns {Renderer} this */
  insert(pass, index = this.passes.length) {
    this.passes.splice(index, 0, pass);
    return this;
  }

  /** detach `pass` without destroying it. @param {RenderPass} pass @returns {Renderer} this */
  remove(pass) {
    const index = this.passes.indexOf(pass);
    if (index >= 0) {
      this.passes.splice(index, 1);
    }
    return this;
  }

  /** run every enabled pass in order. @param {ECS} world */
  draw(world) {
    for (const pass of this.passes) {
      if (!pass.enabled) continue;
      pass.draw(world);
    }
  }
};
