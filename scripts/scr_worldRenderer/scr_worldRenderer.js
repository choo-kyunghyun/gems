global.WorldRenderer = class WorldRenderer {
  constructor() {
    this.passes = [];
  }

  count() {
    return this.passes.length;
  }

  at(index) {
    if (index < 0 || index >= this.count()) return undefined;
    return this.passes[index];
  }

  insert(pass, index = this.passes.length) {
    this.passes.splice(index, 0, pass);
    return this;
  }

  remove(pass_or_index) {
    let index = -1;
    if (typeof pass_or_index === "number") {
      index = pass_or_index;
    } else {
      index = this.passes.indexOf(pass_or_index);
    }

    if (index >= 0 && index < this.passes.length) {
      this.passes.splice(index, 1);
    }

    return this;
  }

  clear() {
    // TODO: Remove
    this.passes = [];
  }

  destroy() {
    for (const pass of this.passes) {
      pass.destroy();
    }
    this.passes = [];
  }

  prepare(world, camera) {
    for (const pass of this.passes) {
      pass.prepare(world, camera);
    }
  }

  draw(world, camera) {
    for (const pass of this.passes) {
      pass.draw(world, camera);
    }
  }
};
