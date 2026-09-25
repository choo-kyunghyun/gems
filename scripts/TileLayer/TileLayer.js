const DIRTY_CAP = 256; // cell writes tracked individually before a mirror just resamples everything

/**
 * A level layer of TileType cells and the solid colliders meshed from them. `emptyCost` controls
 * empty-cell nav: undefined passes through to lower layers; Infinity makes a blocking base.
 * `edits` counts every cell write, and `dirty`/`dirtyAll` say which cells, so a single paint costs
 * a mirror one resample, not the level's. Only one mirror may drain them; a second would need its
 * own cursor. A cell write and a remesh are each seen by nav on its own, so no resync call follows.
 * An empty cell reads 0, not undefined, so occupancy is a truthy test, never `!== undefined`.
 * @implements {LevelLayer}
 */
globalThis.TileLayer = class TileLayer {
  constructor(cols, rows, opt = {}) {
    this.grid = new Grid(cols, rows);
    this.emptyCost = opt.emptyCost;
    this.edits = 0;
    this.dirty = [];
    this.dirtyAll = false;
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  export() {
    return this.grid.export();
  }

  import(data) {
    this.grid = Grid.import(data);
    this.edits++;
    this.dirtyAll = true;
    this.dirty.length = 0;
  }

  static from(data, opt) {
    const layer = new TileLayer(data.cols, data.rows, opt);
    layer.import(data);
    return layer;
  }

  /** Caller must remesh after editing a solid layer. */
  set(x, y, type) {
    this.grid.set(x, y, type);
    this.edits++;
    if (!this.dirtyAll) {
      if (this.dirty.length < DIRTY_CAP) this.dirty.push(this.grid.toIndex(x, y));
      else {
        this.dirtyAll = true;
        this.dirty.length = 0;
      }
    }
    return this;
  }

  clear(x, y) {
    return this.set(x, y, undefined);
  }

  get(x, y) {
    return this.grid.get(x, y);
  }

  occupied(x, y) {
    return !!this.grid.get(x, y);
  }

  costAt(x, y) {
    const type = this.grid.get(x, y);
    return type ? type.pathCost : this.emptyCost;
  }

  /** The solid cells as the fewest [gx,gy,wCells,hCells] rects. */
  meshRects() {
    const g = this.grid;
    return Grid.meshRects(g.cols, g.rows, (x, y) => !!g.get(x, y));
  }

  /** One kinematic-solid collider per rect, sized by the level `grid`; ids pushed onto `out`. */
  meshSolid(entities, grid, out) {
    Colliders.boxes(entities, this.meshRects(), grid.cellWidth, grid.cellHeight, out);
  }

  /** Replaces `colliders` in place; flushes first so old ids don't collide. */
  remesh(entities, grid, colliders) {
    for (let i = 0; i < colliders.length; i++) entities.remove(colliders[i]);
    entities.flush();
    colliders.length = 0;
    this.meshSolid(entities, grid, colliders);
  }
};
