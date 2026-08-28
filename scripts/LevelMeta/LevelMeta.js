/**
 * A level's WHOLE-MAP records — the third of a Level's data members beside its grid and its
 * entity store: what belongs to the map as a whole rather than to a cell or an entity (the sky
 * pinned over it, the settlement it is, an indoor flag). One record per KEY, the key naming the
 * consumer that owns the record's shape (`Settlement.KEY` → a Settlement record); Core stores and
 * serializes records and never reads one, the way the store never reads a component. A record is
 * PURE DATA — plain JSON: an object, array, string, number or boolean, no handles, no cycles, no
 * Set (ARCHITECTURE → Serialization-safe data) — so export/import move it as-is and the Json codec
 * carries it. The level-scope counterpart of a component: an entity's data sits in the store
 * under its id, the level's own sits here under its key.
 */
globalThis.LevelMeta = class LevelMeta {
  constructor() {
    this.records = {}; // key -> record. plain object — for...in is GMRT-safe, Map iteration is not
  }

  get(key) {
    return this.records[key];
  }

  has(key) {
    return this.records[key] !== undefined;
  }

  /** Overwrites a record under the same key. */
  set(key, record) {
    this.records[key] = record;
    return this;
  }

  /** True when a record was there to drop. */
  remove(key) {
    if (this.records[key] === undefined) return false;
    delete this.records[key];
    return true;
  }

  keys() {
    return Object.keys(this.records);
  }

  /** The records as one plain object — the level's JSON half beside the store's export. */
  export() {
    const out = {};
    for (const k in this.records) out[k] = this.records[k];
    return out;
  }

  /** The records become exactly the exported set. */
  import(data) {
    this.records = {};
    for (const k in data) this.records[k] = data[k];
    return this;
  }
};
