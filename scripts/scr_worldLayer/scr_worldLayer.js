globalThis.WorldLayer = class WorldLayer {
  constructor(width, height) {
    this.elements = new Grid(width, height);
    this.pathCosts = new Grid(width, height);
  }
};
