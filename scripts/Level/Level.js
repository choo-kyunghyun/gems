/**
 * ONE map, and everything of it — PURE DATA: a Level never updates or draws; the Scene does
 * that, and the World pools Levels by map id.
 *
 * One member: the entities standing on it (CONCEPT.md — a Level is grid-based and owns its
 * entities). Everything that is the map's AS A WHOLE is a component of `self`, the level's own
 * entity in that store, under the consumer's KEY: the grid it is laid out on (`Level.GRID` — the
 * `grid` accessor), its whole-map records (the sky pinned over it, the settlement it is, an
 * indoor flag — through `entities.of(level.self, KEY, make)`, saved with the store like any
 * component) and what a consumer DERIVES from its data and keeps between frames (a nav grid, a
 * collider snapshot, a room mirror, a render pass stack, a camera's native view — through
 * `entities.derive`, minted so no export carries it and freed with the store through its own
 * `destroy()`). So a save holds the store and nothing else, a new per-level fact rides along
 * unlisted, and a map switch is a pointer swap — nothing of one level survives in a singleton. A
 * per-tick scratch buffer that holds no data between ticks stays module-scope (ARCHITECTURE →
 * Hot-path idioms).
 *
 * The grid crosses a save as a BINARY blob through the store's codec channel: a level that is
 * saved registers `entities.codec(Level.GRID, …)` — pack is the grid's own (`LevelGrid.pack`),
 * unpack is the builder's, since only it knows which TileType a cell's id names
 * (ColonyMap._gridCodec). A level with no codec exports its grid as JSON — a test level, never
 * saved.
 *
 * `self` is index 0: allocated at construction before anything else and never removed, so it
 * keeps its id across a store export/import (a save restores every entity under its saved id).
 *
 * The grid is optional in practice: a side-scroller has entities and no grid, the level editor a
 * grid it edits and no entities. It is assigned after construction when the builder needs the
 * store first (ColonyLevel.build fills a store, then hands back the grid it painted).
 */
globalThis.Level = class Level {
  static GRID = "grid"; // the grid's token on `self` — a data key (a save holds it, as a blob)

  /**
   * @param {Object} [opt]
   * @param {string} [opt.id]        map id — the key it pools under in World
   * @param {LevelGrid} [opt.grid]   tile layers; none for a grid-less level
   * @param {number} [opt.capacity]  entity store size (a streamed map wants a bigger one)
   */
  constructor(opt = {}) {
    this.id = opt.id ?? "";
    this.entities = new Table(opt.capacity ?? 256);
    this.self = this.entities.create(); // the level's own entity — its grid, records and derived entries
    if (opt.grid !== undefined) this.grid = opt.grid;
  }

  /** The tile grid — the GRID component of `self` — or null for a grid-less level. */
  get grid() {
    const g = this.entities.get(this.self, Level.GRID);
    return g === undefined ? null : g;
  }

  set grid(g) {
    if (g === null) this.entities.detach(this.self, Level.GRID);
    else this.entities.add(this.self, Level.GRID, g);
  }

  /** Frees the store (each derived entry's `destroy`, each minted handle's release hook), then the grid. */
  destroy() {
    const g = this.grid;
    this.entities.destroy();
    if (g !== null) g.destroy();
  }
};
