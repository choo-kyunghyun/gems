/**
 * A content registry is a def table keyed by string id plus the ids in registration order, and
 * the members over them. Every string-keyed registry is one, so their member sets and storage
 * can't drift apart.
 *
 * These are stateless ops over a facade, not a factory minting one: a facade declares no storage
 * (`_store` is seeded on it at first use) and its members are one-line delegations. That keeps
 * it load-order-proof: a facade never calls across scripts at load time, only from its own
 * members (docs/GMRT.md). A facade exposes only the members it has callers for, plus its own
 * domain ones; its def normalizer is the `make` handed to `register`. Nothing outside a facade
 * touches `_store`.
 *
 * Storage is a Map keyed by string, safe as long as nothing iterates it. BUG: a Map iterator
 * hangs the runtime (docs/GMRT.md), so `all` index-loops `order`. `order` is append-only:
 * re-registering an id overwrites its def and keeps its position.
 */
globalThis.Registry = {
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

  /** Registration order as a tier or sort rank; -1 when unregistered. */
  rank(facade, id) {
    return Registry._of(facade).order.indexOf(id);
  },

  all(facade) {
    const s = Registry._of(facade);
    const out = [];
    for (let i = 0; i < s.order.length; i++) out.push(s.defs.get(s.order[i]));
    return out;
  },

  /** The store's own array: read it, never reorder it. */
  ids(facade) {
    return Registry._of(facade).order;
  },
};
