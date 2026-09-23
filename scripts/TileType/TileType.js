/**
 * Tile material identity and nav cost, stored as a tile layer's cell value. `pathCost: null`
 * blocks; omitted it costs 1.
 */
globalThis.TileType = class TileType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost === null ? Infinity : (def.pathCost ?? 1);
  }

  static import(data) {
    return new TileType(data);
  }

  export() {
    return {
      id: this.id,
      name: this.name,
      pathCost: this.pathCost,
    };
  }
};
