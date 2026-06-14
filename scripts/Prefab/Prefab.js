// A PREFAB is a reusable, hand-authored mini-layout a procedural generator can stamp into a
// chunk: a cluster of walls + entity spawns in PREFAB-LOCAL grid coords (origin 0,0 at the
// footprint's top-left). The generator picks one (weighted) and translates its local coords to
// absolute grid coords at a placement offset, so the same template reads identically wherever
// it lands. Definitions are pure data (no entities are built here) — OverworldGen stamps them
// and RpgSpawn.spawnEntity constructs the spawns, so prefabs add structured content to an
// otherwise-uniform random scatter without touching the streaming engine.
//
// A def: { id, tags?:string[], weight?, cols, rows,
//          walls?:  [[lx,ly,wCells,hCells]...],            // local grid rects (kinematic-solid)
//          spawns?: [{ preset, lx, ly, ...descriptorFields }...] }  // local grid coords
//
// `tags` scopes a prefab to a generator (e.g. "overworld" vs a future "cave"); `cols`/`rows`
// are the footprint the generator keeps inside the chunk interior so a prefab can't straddle a
// chunk seam. Registry mirrors Rarity/Item (Map + insertion-order array, index-loops — no
// Map-iterator for-of, which crashes GMRT).
globalThis.Prefab = class Prefab {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string[]} [def.tags]   generator scope tags (default [])
   * @param {number} [def.weight]   weighted-pick weight (default 1)
   * @param {number} def.cols       footprint width in cells
   * @param {number} def.rows       footprint height in cells
   * @param {Array} [def.walls]     [[lx,ly,w,h]...] local wall rects
   * @param {Array} [def.spawns]    [{preset, lx, ly, ...}] local spawn descriptors
   */
  constructor(def) {
    this.id = def.id;
    this.tags = def.tags ?? [];
    this.weight = def.weight ?? 1;
    this.cols = def.cols;
    this.rows = def.rows;
    this.walls = def.walls ?? [];
    this.spawns = def.spawns ?? [];
  }

  hasTag(t) {
    return this.tags.indexOf(t) !== -1;
  }

  static registry = new Map();
  static order = []; // insertion order of ids

  /** Register an array of prefab defs (later defs with the same id overwrite). */
  static register(defs) {
    for (const def of defs) {
      const p = new Prefab(def);
      if (!this.registry.has(p.id)) this.order.push(p.id);
      this.registry.set(p.id, p);
    }
    return this;
  }

  static get(id) {
    return this.registry.get(id);
  }

  static has(id) {
    return this.registry.has(id);
  }

  /** All prefabs in registration order. Index-loops `order` (no Map-iterator for-of). */
  static all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.registry.get(this.order[i]));
    }
    return out;
  }

  /** Prefabs carrying `tag` (a generator's scope), in registration order. */
  static byTag(tag) {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      const p = this.registry.get(this.order[i]);
      if (p.hasTag(tag)) out.push(p);
    }
    return out;
  }
};
