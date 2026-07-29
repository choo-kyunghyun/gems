/**
 * one zone channel: Grid of zone-id ints (0 = none) + Zone registry.
 * overlapping purposes (faction / weather / event) use separate ZoneMaps.
 */
globalThis.ZoneMap = class ZoneMap {
  /**
   * @param {number} cols
   * @param {number} rows
   */
  constructor(cols, rows) {
    this.grid = new Grid(cols, rows); // int zone ids, 0 = none
    // plain object — for...in is GMRT-safe; Map iteration is not
    this.zones = {};
    // entityId -> zoneId for ZoneSystem enter/exit sweep
    this._inside = {};
    this._nextId = 1;
  }

  /**
   * @param {ZoneOpt} opt
   * @returns {Zone}
   */
  define(opt = {}) {
    const id = opt.id ?? this._nextId;
    // data is deep-copied: a def stamped repeatedly (Prefab.apply) passes ONE payload object for
    // every zone it defines — stored by reference, mutating one zone's data would alias its
    // siblings and the registry def. Round-trip is safe: Zone.data is a JSON payload (no Set/refs),
    // and only native stringify faults on nesting (GMRT.md #15565).
    const data =
      opt.data !== undefined ? JSON.parse(json_stringify(opt.data)) : opt.data;
    const zone = new Zone({
      id: id,
      name: opt.name,
      tags: opt.tags,
      data: data,
    });
    this.zones[id] = zone;
    if (id >= this._nextId) this._nextId = id + 1;
    return zone;
  }

  /**
   * @param {number} id
   * @returns {Zone|undefined} the registered zone for an id.
   */
  zone(id) {
    return this.zones[id];
  }

  /**
   * @param {string} tag
   * @returns {Zone[]} every registered zone carrying `tag`.
   */
  byTag(tag) {
    const out = [];
    for (const id in this.zones) {
      const zone = this.zones[id];
      if (zone.hasTag(tag)) out.push(zone);
    }
    return out;
  }

  /**
   * Paint zone `id` into one cell (0 clears).
   * @param {number} id
   * @param {number} gx
   * @param {number} gy
   * @returns {ZoneMap} this
   */
  paint(id, gx, gy) {
    if (this.grid.inBounds(gx, gy)) this.grid.set(gx, gy, id);
    return this;
  }

  /**
   * Paint zone `id` into an inclusive cell rect.
   * @param {number} id
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @returns {ZoneMap} this
   */
  paintRect(id, x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (this.grid.inBounds(x, y)) this.grid.set(x, y, id);
      }
    }
    return this;
  }

  /**
   * Clear one cell to no-zone.
   * @param {number} gx
   * @param {number} gy
   * @returns {ZoneMap} this
   */
  erase(gx, gy) {
    return this.paint(0, gx, gy);
  }

  /**
   * Clear an inclusive cell rect to no-zone.
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @returns {ZoneMap} this
   */
  eraseRect(x1, y1, x2, y2) {
    return this.paintRect(0, x1, y1, x2, y2);
  }

  /**
   * @param {number} gx
   * @param {number} gy
   * @returns {number} zone id at a cell (0 if out of bounds / none).
   */
  idAt(gx, gy) {
    return this.grid.inBounds(gx, gy) ? this.grid.get(gx, gy) : 0;
  }

  /**
   * @param {number} gx
   * @param {number} gy
   * @returns {Zone | undefined}
   */
  at(gx, gy) {
    return this.zones[this.idAt(gx, gy)];
  }

  /**
   * @param {number} gx
   * @param {number} gy
   * @param {string} tag
   * @returns {boolean} the zone at a cell carries `tag`.
   */
  contains(gx, gy, tag) {
    const zone = this.at(gx, gy);
    return zone !== undefined && zone.hasTag(tag);
  }

  /**
   * @param {number} id
   * @returns {{x:number,y:number}[]} every cell painted with zone `id`.
   */
  cells(id) {
    const out = [];
    for (let y = 0; y < this.grid.rows; y++) {
      for (let x = 0; x < this.grid.cols; x++) {
        if (this.grid.get(x, y) === id) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  /** @returns {Object} */
  export() {
    const zones = [];
    for (const id in this.zones) {
      const zone = this.zones[id];
      zones.push({
        id: zone.id,
        name: zone.name,
        tags: zone.tags.slice(),
        data: zone.data,
      });
    }
    return { grid: this.grid.export(), zones: zones, nextId: this._nextId };
  }

  /**
   * @param {Object} data
   * @returns {ZoneMap} this
   */
  import(data) {
    this.grid = Grid.import(data.grid);
    this.zones = {};
    for (let i = 0; i < data.zones.length; i++) {
      const z = data.zones[i];
      this.zones[z.id] = new Zone(z);
    }
    this._nextId = data.nextId;
    this._inside = {};
    return this;
  }

  /** Free the backing grid and drop zone + membership state. */
  destroy() {
    this.grid.destroy();
    this.grid = undefined;
    this.zones = {};
    this._inside = {};
  }
};
