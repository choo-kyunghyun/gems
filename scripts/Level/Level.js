/**
 * ONE map, and everything of it — PURE DATA: a Level never updates or draws; the Scene does
 * that, and the World pools Levels by map id.
 *
 * Two members: the grid it is laid out on and the entities standing on it (CONCEPT.md — a Level
 * is grid-based and owns its entities). What is the map's AS A WHOLE — its whole-map records (the
 * sky pinned over it, the settlement it is, an indoor flag) and what a consumer DERIVES from its
 * data and keeps between frames (a nav grid, a collider snapshot, a room mirror, a render pass
 * stack, a camera's native view) — is a component of `self`, the level's own entity in its own
 * store, under the consumer's KEY: a record through `entities.of(level.self, KEY, make)`, saved
 * with the store like any component; a derived entry through `entities.derive`, minted so no
 * export carries it and freed with the store through its own `destroy()`. So a save holds the
 * grid and the store and nothing else, a new per-level fact rides along unlisted, and a map
 * switch is a pointer swap — nothing of one level survives in a singleton. A per-tick scratch
 * buffer that holds no data between ticks stays module-scope (ARCHITECTURE → Hot-path idioms).
 *
 * `self` is index 0: allocated at construction before anything else and never removed, so it
 * keeps its id across a store export/import (a save restores every entity under its saved id).
 *
 * The grid and the store are optional in practice: a side-scroller has entities and no grid,
 * the level editor a grid it edits and no entities. `grid` is assigned after construction when
 * the builder needs the store first (ColonyLevel.build fills a store, then hands back the grid
 * it painted).
 */
globalThis.Level = class Level {
  /**
   * @param {Object} [opt]
   * @param {string} [opt.id]        map id — the key it pools under in World
   * @param {LevelGrid} [opt.grid]   tile layers; null for a grid-less level
   * @param {number} [opt.capacity]  entity store size (a streamed map wants a bigger one)
   */
  constructor(opt = {}) {
    this.id = opt.id ?? "";
    this.grid = opt.grid ?? null;
    this.entities = new EntityStore(opt.capacity ?? 256);
    this.self = this.entities.create(); // the level's own entity — its records and derived entries
  }

  /** Frees the store (each derived entry's `destroy`, each minted handle's release hook) and the grid. */
  destroy() {
    this.entities.destroy();
    if (this.grid !== null) this.grid.destroy();
    this.grid = null;
  }
};
