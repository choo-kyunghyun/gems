/**
 * A keyed store of RECORDS — the one write place for a layer's own data: `Level.meta` holds a
 * map's whole-map records (the sky pinned over it, the settlement it is, an indoor flag) and
 * `World.meta` the world's (the clock, the sky, the progression, the event queue). One record per
 * KEY, the key naming the consumer that owns the record's shape (`Settlement.KEY` → a Settlement
 * record, `WorldClock.KEY` → the clock); the store holds and serializes records and never reads
 * one, the way the entity store never reads a component. A record is PURE DATA — plain JSON: an
 * object, array, string, number or boolean, no handles, no cycles, no Set (ARCHITECTURE →
 * Serialization-safe data) — so export/import move it as-is and the Json codec carries it. The
 * counterpart of a component one layer up: an entity's data sits in the store under its id, a
 * level's or the world's sits here under its key. A consumer that finds no record under its key
 * seeds one (the way a component is added), so a fresh level or world starts every record blank.
 */
globalThis.Records = class Records {
  constructor() {
    this.records = {}; // key -> record. plain object — for...in is GMRT-safe, Map iteration is not
  }

  get(key) {
    return this.records[key];
  }

  has(key) {
    return this.records[key] !== undefined;
  }

  /** The record under `key`, seeded by `make()` when absent — how a consumer reads its own record. */
  of(key, make) {
    let rec = this.records[key];
    if (rec === undefined) {
      rec = make();
      this.records[key] = rec;
    }
    return rec;
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

  /** The records as one plain object — the layer's JSON half beside the store's export. */
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
