/**
 * A content registry is a def table keyed by string id plus the ids in registration order, and
 * the members over them (`register`/`get`/`has`/`rank`/`all`). Every registry in the project is
 * one — `Item`/`Rarity`/`Manufacturer`/`Recipe` (class statics), `Status`/`FactionSystem`/
 * `QuestLog`/`SettlementComponent`/`InteractAction`/`Achievement` (singletons) — so their member
 * sets and their storage can't drift apart.
 *
 * These are STATELESS ops, not a factory: the store is the facade itself, holding `_defs`
 * (Map id -> def) and `_order` (string[]) as ordinary fields it declares inline. That is what
 * keeps this load-order-proof — a facade never calls across scripts at script-load time, only
 * from its own members (GMRT runs each script's top level at startup in no defined order).
 *
 * A facade delegates and exposes only the members it has callers for, plus its own domain ones
 * (`Rarity.modify`, `Recipe.forStation`); nothing outside a facade touches `_defs`/`_order`.
 *
 * Storage is a Map keyed by string: exact lookups, no prototype keys leaking in, and safe on
 * GMRT as long as nothing iterates it — a Map ITERATOR hangs the runtime (docs/GMRT.md), so
 * `all` index-loops `_order` instead. `_order` is append-only: re-registering an id overwrites
 * its def and keeps its original position.
 */
globalThis.Registry = {
  /**
   * `make` normalizes a raw def before storage (construct a class, apply field defaults);
   * omit to store the def as authored. The result must carry `id`.
   */
  register(store, list, make) {
    for (let i = 0; i < list.length; i++) {
      const def = make === undefined ? list[i] : make(list[i]);
      if (!store._defs.has(def.id)) store._order.push(def.id);
      store._defs.set(def.id, def);
    }
  },

  get(store, id) {
    return store._defs.get(id);
  },

  has(store, id) {
    return store._defs.has(id);
  },

  /** The tier/sort rank of an ordered registry (Rarity's tiers run low → high); -1 when unregistered. */
  rank(store, id) {
    return store._order.indexOf(id);
  },

  all(store) {
    const out = [];
    for (let i = 0; i < store._order.length; i++)
      out.push(store._defs.get(store._order[i]));
    return out;
  },
};
