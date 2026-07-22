// The level's GRID DATA — tile layers + zone channels (`zoneMaps`) + cell dims and world<->grid
// conversion. Pure spatial data: no entities, systems, or presentation. A Level composes one and
// holds it as the legacy handle `.level` (rename deferred — docs/ROADMAP.md → Rename Passes).
// NOTE: live pathfinding does NOT read the tile layers — NavGrid (colliders + streamed-terrain
// costs) is the one nav source. `costAt` below is on-demand layer cost, for debug/inspection.
/**
 * @typedef {Object} TileType
 * @property {number} id
 * @property {string} name
 * @property {number} pathCost
 */

/**
 * @typedef {{ cost: number | undefined }} NavData
 */

/**
 * @typedef {Object} LevelLayer
 * @property {function(number, number): TileType | undefined} get
 * @property {function(number, number, TileType | undefined): LevelLayer} set
 * @property {function(number, number): NavData} getNavData
 * @property {function(): Object} export
 * @property {function(Object): void} import
 * @property {function(): void} destroy
 */

globalThis.LevelGrid = class LevelGrid {
  constructor(opt = {}) {
    this.cellWidth = opt.cellWidth ?? 32;
    this.cellHeight = opt.cellHeight ?? 32;
    this.cols = opt.cols ?? Math.floor(room_width / this.cellWidth);
    this.rows = opt.rows ?? Math.floor(room_height / this.cellHeight);

    /** @type {LevelLayer[]} */
    this.layers = [];

    // plain object — for...in is GMRT-safe, Map iteration is not
    /** @type {Object<string, ZoneMap>} */
    this.zoneMaps = {};
  }

  /** @param {string} key @param {ZoneMap} [map] @returns {ZoneMap} */
  addZoneMap(key, map = new ZoneMap(this.cols, this.rows)) {
    this.zoneMaps[key] = map;
    return map;
  }

  /** @returns {ZoneMap | undefined} */
  zoneMap(key) {
    return this.zoneMaps[key];
  }

  /** @returns {Zone | undefined} */
  zoneAt(key, wx, wy) {
    const map = this.zoneMaps[key];
    if (map === undefined) return undefined;
    const g = this.worldToGrid(wx, wy);
    return map.at(g.x, g.y);
  }

  /** Insert a LevelLayer at `index` (top by default; higher index = higher nav priority). @param {LevelLayer} layer @returns {LevelGrid} this */
  insert(layer, index = this.layers.length) {
    this.layers.splice(index, 0, layer);
    return this;
  }

  /** Detach a LevelLayer. @param {LevelLayer} layer @returns {LevelGrid} this */
  remove(layer) {
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
    return this;
  }

  /**
   * On-demand tile nav cost of a cell: topmost layer with a defined cost wins (higher index =
   * higher priority); no layer reporting → Infinity. Debug/inspection only (RenderDebugTileMap
   * shading) — live pathfinding reads NavGrid, never the tile layers.
   * @param {number} x @param {number} y @returns {number}
   */
  costAt(x, y) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const nav = this.layers[i].getNavData(x, y);
      if (nav.cost !== undefined) return nav.cost;
    }
    return Infinity;
  }

  /** @param {number} wx @param {number} wy @returns {{x:number,y:number}} the grid cell containing the point. */
  worldToGrid(wx, wy) {
    return {
      x: Math.floor(wx / this.cellWidth),
      y: Math.floor(wy / this.cellHeight),
    };
  }

  /** @param {number} gx @param {number} gy @returns {{x:number,y:number}} world coords of the cell's CENTER. */
  gridToWorld(gx, gy) {
    return {
      x: gx * this.cellWidth + this.cellWidth * 0.5,
      y: gy * this.cellHeight + this.cellHeight * 0.5,
    };
  }

  /** @returns {Object} */
  export() {
    const data = {
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      cols: this.cols,
      rows: this.rows,
      layers: this.layers.map((layer) => layer.export()),
    };
    // omit zoneMaps when absent so existing saved levels are unaffected
    const keys = Object.keys(this.zoneMaps);
    if (keys.length > 0) {
      const zoneMaps = {};
      for (let i = 0; i < keys.length; i++) {
        zoneMaps[keys[i]] = this.zoneMaps[keys[i]].export();
      }
      data.zoneMaps = zoneMaps;
    }
    return data;
  }

  /** @param {Object} data @returns {LevelGrid} this */
  import(data) {
    for (let i = 0; i < this.layers.length; i++) {
      if (data.layers[i] !== undefined) {
        this.layers[i].import(data.layers[i]);
      }
    }
    if (data.zoneMaps !== undefined) {
      const keys = Object.keys(data.zoneMaps);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const map = this.zoneMaps[key] ?? this.addZoneMap(key);
        map.import(data.zoneMaps[key]);
      }
    }
    return this;
  }

  /** free layers + zone channels */
  destroy() {
    for (const layer of this.layers) {
      layer.destroy();
    }
    const keys = Object.keys(this.zoneMaps);
    for (let i = 0; i < keys.length; i++) {
      this.zoneMaps[keys[i]].destroy();
    }
    this.zoneMaps = {};
    this.layers = [];
  }
};
