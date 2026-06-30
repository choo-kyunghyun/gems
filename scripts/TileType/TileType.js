/**
 * Tile material identity + nav cost. `pathCost: null` → Infinity (blocking); omit → 1.
 * Stored as the cell value of a TileLayer's Grid.
 */
globalThis.TileType = class TileType {
  /** @param {{id:number, name?:string, pathCost?:number|null}} def */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost === null ? Infinity : (def.pathCost ?? 1);
  }

  /** @param {{id:number,name:string,pathCost:number}} data @returns {TileType} */
  static import(data) {
    return new TileType(data);
  }

  /** @returns {{id:number,name:string,pathCost:number}} */
  export() {
    return {
      id: this.id,
      name: this.name,
      pathCost: this.pathCost,
    };
  }
};
