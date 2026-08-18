/**
 * ONE map's data, and nothing else: the grid it is laid out on and the entities standing on it
 * (CONCEPT.md — a Level is grid-based and owns its entities). PURE DATA — a Level never updates
 * or draws; the Scene does that, and the World pools Levels by map id.
 *
 * Both halves are optional in practice: a side-scroller has entities and no grid, the level
 * editor a grid it edits and no entities. `grid` is assigned after construction when the builder
 * needs the store first (ColonyLevel.build fills a store, then hands back the grid it painted).
 */
globalThis.Level = class Level {
  /**
   * @param {Object} [opt]
   * @param {string} [opt.id]        map id — the key it pools under in World
   * @param {LevelGrid} [opt.grid]   tile layers + zone channels; null for a grid-less level
   * @param {number} [opt.capacity]  entity store size (a streamed map wants a bigger one)
   * @param {number} [opt.gravity]   per-store GravitySystem override (see EntityStore)
   */
  constructor(opt = {}) {
    this.id = opt.id ?? "";
    this.grid = opt.grid ?? null;
    this.entities = new EntityStore(opt.capacity ?? 256, { gravity: opt.gravity });
  }

  /** Frees the store and the grid (which destroys its inserted layers + zone maps). */
  destroy() {
    this.entities.destroy();
    if (this.grid !== null) this.grid.destroy();
    this.grid = null;
  }
};
