/**
 * One zone channel: a Grid of zone-id ints (0 = none) + its Zone registry. Overlapping purposes
 * (faction / weather / event) use separate ZoneMaps.
 *
 * A channel is a pure SPATIAL INDEX, queried POINT-WISE: `idAt`/`at` answer "which zone owns this
 * cell" in one array read, which is the question every consumer actually asks — BuildMode gates a
 * cursor cell, `Settlement.ownerAt` a placement, `sceneColony._updateClimate` the player's cell. It
 * holds no per-entity membership, so a consumer wanting a border-cross EDGE caches the last id it
 * read and compares (what _updateClimate does).
 */
globalThis.ZoneMap = class ZoneMap {
  constructor(cols, rows) {
    this.grid = new Grid(cols, rows); // int zone ids, 0 = none
    // plain object — for...in is GMRT-safe; Map iteration is not
    this.zones = {};
    this._nextId = 1;
  }

  define(opt = {}) {
    const id = opt.id ?? this._nextId;
    // data is deep-copied: a def painted repeatedly (LevelData.paint) passes ONE payload object for
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

  zone(id) {
    return this.zones[id];
  }

  byTag(tag) {
    const out = [];
    for (const id in this.zones) {
      const zone = this.zones[id];
      if (zone.hasTag(tag)) out.push(zone);
    }
    return out;
  }

  paint(id, gx, gy) {
    if (this.grid.inBounds(gx, gy)) this.grid.set(gx, gy, id);
    return this;
  }

  paintRect(id, x1, y1, x2, y2) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (this.grid.inBounds(x, y)) this.grid.set(x, y, id);
      }
    }
    return this;
  }

  erase(gx, gy) {
    return this.paint(0, gx, gy);
  }

  eraseRect(x1, y1, x2, y2) {
    return this.paintRect(0, x1, y1, x2, y2);
  }

  idAt(gx, gy) {
    return this.grid.inBounds(gx, gy) ? this.grid.get(gx, gy) : 0;
  }

  at(gx, gy) {
    return this.zones[this.idAt(gx, gy)];
  }

  contains(gx, gy, tag) {
    const zone = this.at(gx, gy);
    return zone !== undefined && zone.hasTag(tag);
  }

  cells(id) {
    const out = [];
    for (let y = 0; y < this.grid.rows; y++) {
      for (let x = 0; x < this.grid.cols; x++) {
        if (this.grid.get(x, y) === id) out.push({ x: x, y: y });
      }
    }
    return out;
  }

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

  import(data) {
    this.grid = Grid.import(data.grid);
    this.zones = {};
    for (let i = 0; i < data.zones.length; i++) {
      const z = data.zones[i];
      this.zones[z.id] = new Zone(z);
    }
    this._nextId = data.nextId;
    return this;
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
    this.zones = {};
  }
};
