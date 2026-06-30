// Reusable mini-layout (walls + spawns in prefab-local coords) a generator stamps into a chunk.
// Generator translates local→absolute coords at placement. Pure data — OverworldGen stamps,
// RpgSpawn.spawnEntity builds entities. Registry uses index-loops (no Map-iterator for-of — crashes GMRT).
globalThis.Prefab = class Prefab {
  /**
   * @param {Object} def
   * @param {string} def.id
   * @param {string[]} [def.tags]   scope tags for generator filtering
   * @param {number} [def.weight]   weighted-pick weight (default 1)
   * @param {number} def.cols       footprint width in cells
   * @param {number} def.rows       footprint height in cells
   * @param {Array} [def.walls]     [[lx,ly,w,h]...] local-coord wall rects
   * @param {Array} [def.spawns]    [{preset, lx, ly, ...}] local-coord spawn descriptors
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
  static order = []; // stable registration order

  /** register defs; later same-id defs overwrite */
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

  /** all prefabs in registration order. index-loops `order` — no Map-iterator for-of (crashes GMRT) */
  static all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.registry.get(this.order[i]));
    }
    return out;
  }

  /** prefabs with this scope tag, in registration order */
  static byTag(tag) {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      const p = this.registry.get(this.order[i]);
      if (p.hasTag(tag)) out.push(p);
    }
    return out;
  }
};
