/**
 * Tile material identity + nav cost. `pathCost: null` → Infinity (blocking); omit → 1.
 * Stored as the cell value of a TileLayer's Grid.
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
