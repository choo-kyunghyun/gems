/**
 * ONE map, and everything of it: its DATA and the runtime DERIVED from that data, in two bags a
 * consumer reaches by its own KEY. PURE DATA — a Level never updates or draws; the Scene does
 * that, and the World pools Levels by map id.
 *
 * The data is three members — the grid it is laid out on, the entities standing on it
 * (CONCEPT.md — a Level is grid-based and owns its entities), and `meta`, its whole-map records
 * (Records — what is the map's as a whole, keyed by the consumer that owns each) — and a save
 * holds exactly these three.
 *
 * `cache` (Cache) is the one place for what a consumer DERIVES from that data and keeps between
 * frames — a nav grid, a collider snapshot, a room mirror, a render pass stack, a camera's native
 * view — each entry reached by its owner through `cache.of(Owner, make)`. Never serialized, never
 * a source of truth: the owner seeds its entry on a miss (a miss is never an error), and an
 * entry with a `destroy()` is freed with the level. A per-tick scratch buffer that holds no data
 * between ticks stays module-scope (ARCHITECTURE → Hot-path idioms); anything a level's frame
 * reads back the next frame lives here, so a map switch is a pointer swap and nothing of one
 * level survives in a singleton.
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
    this.meta = new Records();
    this.cache = new Cache(); // owner KEY -> derived runtime
  }

  /** Frees the cache (each entry's `destroy`, when it has one), the store and the grid. */
  destroy() {
    this.cache.destroy();
    this.entities.destroy();
    if (this.grid !== null) this.grid.destroy();
    this.grid = null;
  }
};
