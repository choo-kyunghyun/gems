/**
 * One map and everything of it, as pure data: a Level never updates or draws.
 *
 * Its one member is the entity store standing on it. Everything that is the map's as a whole is
 * a component of `self`, the level's own entity, under the consumer's key: the grid, whole-map
 * records (through `entities.of`, saved like any component) and what a consumer derives and
 * keeps between frames (through `entities.derive`, never exported, freed with the store). So a
 * save holds the store and nothing else, a new per-level fact rides along unlisted, and a map
 * switch is a pointer swap: nothing of one level survives in a singleton. Per-tick scratch that
 * holds no data between ticks stays module-scope (docs/ARCHITECTURE.md).
 *
 * The grid is two components: its cells record under `CELLS`, pure data that a save carries as a
 * binary blob, and the live `LevelGrid` over it under `GRID`, minted and freed as it leaves its
 * slot. A saved level comes back with its cells alone; whoever knows the tile types builds the
 * grid over them.
 *
 * `self` is index 0, allocated first and never removed, so it keeps its id across an
 * export/import.
 *
 * The grid is optional: a level may have entities and no grid, or a grid and no entities. It may
 * be assigned after construction when the builder needs the store first.
 */
globalThis.Level = class Level {
  static GRID = "grid"; // the live grid on `self`; never saved
  static CELLS = "cells"; // the grid's cells record on `self`; a save holds it as a blob

  /**
   * @param {Object} [opt]
   * @param {string} [opt.id]        map id, the key it pools under
   * @param {LevelGrid} [opt.grid]
   * @param {number} [opt.capacity]  entity store size (a streamed map wants a bigger one)
   */
  constructor(opt = {}) {
    this.id = opt.id ?? "";
    this.entities = new Table(opt.capacity ?? 256);
    this.self = this.entities.create();
    this.entities.codec(Level.CELLS, { pack: LevelGrid.pack, unpack: LevelGrid.unpack });
    if (opt.grid !== undefined) this.grid = opt.grid;
  }

  /** null for a grid-less level. */
  get grid() {
    const g = this.entities.get(this.self, Level.GRID);
    return g === undefined ? null : g;
  }

  /** The level owns the grid from here: it is freed as it leaves its slot. */
  set grid(g) {
    const s = this.entities;
    if (g === null) {
      s.detach(this.self, Level.GRID);
      s.detach(this.self, Level.CELLS);
      return;
    }
    s.add(this.self, Level.GRID, g, { mint: true, destroy: Level._free });
    s.add(this.self, Level.CELLS, g.cells);
  }

  static _free(grid) {
    grid.destroy();
  }

  /** Frees the store, the grid and every derived entry with it. */
  destroy() {
    this.entities.destroy();
  }
};
