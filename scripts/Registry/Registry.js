/**
 * A content registry is a def table keyed by string id plus the ids in registration order, and
 * the members over them (`register`/`get`/`has`/`rank`/`all`/`ids`). Every registry in the
 * project is one — `Item` (class statics, since a def is an instance with methods), `Rarity`/
 * `Manufacturer`/`Recipe`/`Prefab`/`Status`/`Need`/`Diplomacy`/`QuestLog`/`SettlementComponent`/
 * `InteractAction`/`Achievement`/`EntityPreset`/`StateSystem` (plain objects) — so their member
 * sets and their storage can't drift apart.
 *
 * These are STATELESS ops over a facade, not a factory minting one: a facade declares no
 * storage — `_of` seeds `_store` (`defs` a Map id -> def, `order` a string[]) on the facade at
 * first use — and its own members are one-line delegations. That is what keeps this
 * load-order-proof: a facade never calls across scripts at script-load time, only from its own
 * members (GMRT runs each script's top level at startup in resource order — docs/GMRT.md — and
 * most facades sort before this script, so `globalThis.X = Registry.make(…)` would read an
 * undefined global at load).
 *
 * A facade delegates and exposes only the members it has callers for, plus its own domain ones
 * (`Rarity.modify`, `Recipe.forStation`); a def normalizer is the facade's `make` (construct a
 * class, apply field defaults, validate), handed to `register`. Nothing outside a facade touches
 * `_store`.
 *
 * Storage is a Map keyed by string: exact lookups, no prototype keys leaking in, and safe on
 * GMRT as long as nothing iterates it — a Map ITERATOR hangs the runtime (docs/GMRT.md), so
 * `all` index-loops `order` instead. `order` is append-only: re-registering an id overwrites
 * its def and keeps its original position.
 */
globalThis.Registry = {
  /** The facade's store, seeded on the first touch. */
  _of(facade) {
    let s = facade._store;
    if (s === undefined) {
      s = { defs: new Map(), order: [] };
      facade._store = s;
    }
    return s;
  },

  /**
   * `make` normalizes a raw def before storage; omit to store the def as authored. The result
   * must carry `id`.
   */
  register(facade, list, make) {
    const s = Registry._of(facade);
    for (let i = 0; i < list.length; i++) {
      const def = make === undefined ? list[i] : make(list[i]);
      if (!s.defs.has(def.id)) s.order.push(def.id);
      s.defs.set(def.id, def);
    }
  },

  get(facade, id) {
    return Registry._of(facade).defs.get(id);
  },

  has(facade, id) {
    return Registry._of(facade).defs.has(id);
  },

  /** The tier/sort rank of an ordered registry (Rarity's tiers run low → high); -1 when unregistered. */
  rank(facade, id) {
    return Registry._of(facade).order.indexOf(id);
  },

  all(facade) {
    const s = Registry._of(facade);
    const out = [];
    for (let i = 0; i < s.order.length; i++) out.push(s.defs.get(s.order[i]));
    return out;
  },

  /** The registered ids in order — the store's own array, so read it, never reorder it. */
  ids(facade) {
    return Registry._of(facade).order;
  },
};
