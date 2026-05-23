globalThis.Terrain = class Terrain {
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

  static import(data) {
    const terrain = new Terrain(data.width, data.height);
    terrain.grid = Grid.import(data);
    return terrain;
  }

  set(x, y, value) {
    this.grid.set(x, y, value);
    return this;
  }

  get(x, y) {
    return this.grid.get(x, y);
  }

  getCost(x, y) {
    const type = this.get(x, y);
    return type === undefined ? Infinity : type.pathCost;
  }
};
