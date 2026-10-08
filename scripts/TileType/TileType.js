/**
 * Tile material identity and nav cost, stored as a tile layer's cell value. `key` names the
 * material within its layer, "" for a layer's lone type. `pathCost: null` blocks paths and motion
 * alike; omitted it costs 1.
 */
globalThis.TileType = class TileType {
  constructor(def) {
    this.id = def.id;
    this.key = def.key ?? "";
    this.name = def.name ?? "";
    this.pathCost = def.pathCost === null ? Infinity : (def.pathCost ?? 1);
  }
};
