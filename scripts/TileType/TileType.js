/**
 * Tile material identity and nav cost, stored as a tile layer's cell value. `pathCost: null`
 * blocks paths and motion alike; omitted it costs 1.
 */
globalThis.TileType = class TileType {
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost === null ? Infinity : (def.pathCost ?? 1);
  }
};
