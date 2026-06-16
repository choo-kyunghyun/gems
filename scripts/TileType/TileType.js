/**
 * One tile material: identity (`id`/`name`) plus its pathfinding cost. Stored as the cell
 * value of a TileLayer's Grid; `pathCost` feeds the Level nav grid via getNavData.
 */
globalThis.TileType = class TileType {
  /**
   * @param {{id:number, name?:string, pathCost?:number|null}} def
   *   `pathCost: null` → Infinity (blocking); omitted → 1.
   */
  constructor(def) {
    this.id = def.id;
    this.name = def.name ?? "";
    this.pathCost = def.pathCost === null ? Infinity : (def.pathCost ?? 1);
  }

  /** @param {{id:number,name:string,pathCost:number}} data @returns {TileType} */
  static import(data) {
    return new TileType(data);
  }

  /** @returns {{id:number,name:string,pathCost:number}} serializable type. */
  export() {
    return {
      id: this.id,
      name: this.name,
      pathCost: this.pathCost,
    };
  }
};
