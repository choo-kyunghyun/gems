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
 * The grid crosses a save as a binary blob through the store's codec: a saved level registers a
 * codec for `Level.GRID` whose unpack is the builder's, since only it knows the tile types. A
 * level with no codec exports its grid as JSON, which only an unsaved test level does.
 *
 * `self` is index 0, allocated first and never removed, so it keeps its id across an
 * export/import.
 *
 * The grid is optional: a level may have entities and no grid, or a grid and no entities. It may
 * be assigned after construction when the builder needs the store first.
 */
globalThis.Level = class Level {
  static GRID = "grid"; // the grid's token on `self`; a save holds it as a blob

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
    if (opt.grid !== undefined) this.grid = opt.grid;
  }

  /** null for a grid-less level. */
  get grid() {
    const g = this.entities.get(this.self, Level.GRID);
    return g === undefined ? null : g;
  }

  set grid(g) {
    if (g === null) this.entities.detach(this.self, Level.GRID);
    else this.entities.add(this.self, Level.GRID, g);
  }

  /** Frees the store, derived entries included, then the grid. */
  destroy() {
    const g = this.grid;
    this.entities.destroy();
    if (g !== null) g.destroy();
  }
};
