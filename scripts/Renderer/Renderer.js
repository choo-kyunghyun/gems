/**
 * @typedef {Object} RenderPass
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
      pass.draw(world);
    }
  }
};
