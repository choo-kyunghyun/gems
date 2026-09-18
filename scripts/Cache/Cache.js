/**
 * A keyed bag of what a layer DERIVES from its data and keeps between frames — `Level.cache`
 * and `World.cache` are each one of these. The counterpart of Records: a record is data a save
 * holds, a cache entry is rebuilt from that data and never serialized. One entry per owner,
 * keyed by the owner's `KEY`, and `of` is the one write: the owner reaches its entry through it,
 * seeding on a miss (a miss is never an error), and a second module reaching the same key
 * throws — one owner per fact, checked here rather than remembered. `get` is the read for a
 * consumer that tolerates a miss (a Core system on a level whose builder mounted no grid).
 *
 * An entry is a plain object or a class instance; one with a `destroy()` is freed with the bag
 * (`drop` frees one, `destroy` all — the layer's teardown), so a handle it holds never outlives
 * its layer. Plain objects, not Maps — for...in is GMRT-safe and an owner is compared by
 * identity under a string key (docs/GMRT.md: no object-keyed Map).
 */
globalThis.Cache = class Cache {
  constructor() {
    this._entries = {}; // key -> entry
    this._owners = {}; // key -> the owner object that seeded it
  }

  /** The owner's entry, seeded by `make()` when absent. Throws when another owner holds the key. */
  of(owner, make) {
    const key = owner.KEY;
    if (key === undefined) throw new Error("Cache: the owner names no KEY");
    const held = this._owners[key];
    if (held !== undefined) {
      if (held !== owner) throw new Error(`Cache: "${key}" is owned by another module`);
    }
    let entry = this._entries[key];
    if (entry === undefined) {
      entry = make();
      this._entries[key] = entry;
      this._owners[key] = owner;
    }
    return entry;
  }

  /** The owner's entry, or undefined on a miss. */
  get(owner) {
    return this._entries[owner.KEY];
  }

  /** Free the owner's entry (its `destroy`, when it has one); the next `of` reseeds. True when one was there. */
  drop(owner) {
    const key = owner.KEY;
    const entry = this._entries[key];
    if (entry === undefined) return false;
    Cache._free(entry);
    delete this._entries[key];
    delete this._owners[key];
    return true;
  }

  /** Free every entry — the layer's teardown. The bag is empty and reusable after. */
  destroy() {
    for (const k in this._entries) Cache._free(this._entries[k]);
    this._entries = {};
    this._owners = {};
  }

  static _free(entry) {
    if (entry === null) return;
    if (typeof entry !== "object") return;
    if (typeof entry.destroy === "function") entry.destroy();
  }
};
