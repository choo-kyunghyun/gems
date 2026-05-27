/** @implements {WorldLayer} */
globalThis.Floor = class Floor {
  constructor(width, height) {
    this.grid = new Grid(width, height);
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  export() {
    return this.grid.export();
  }

  import(data) {
    this.grid = Grid.import(data);
  }

  static from(data) {
    const floor = new Floor(data.width, data.height);
    floor.import(data);
    return floor;
  }

  set(x, y, type) {
    this.grid.set(x, y, type);
    return this;
  }

  get(x, y) {
    return this.grid.get(x, y);
  }

  getNavData(x, y) {
    const type = this.grid.get(x, y);
    if (type === undefined) return { cost: undefined };
    return { cost: type.pathCost };
  }
};
