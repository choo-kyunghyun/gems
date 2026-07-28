// SettlementComponent — the registry of settlement CAPABILITY defs (market / depot / farm / …). Pure
// data like FactionSystem/Rarity/Status; content registers its set from create()-time. Contract below.
/**
 * The "just like faction" layer: a settlement carries a SettlementComponent id array in its Zone data
 * (Settlement.components/hasComponent/addComponent), and this registry describes each id. Behavior (a
 * system acting on "settlements that have X") layers on later.
 */
globalThis.SettlementComponent = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(), // id -> { id, name, color }
  _order: [],

  /** @param {{id:string,name?:string,color?:number|string}[]} defs @returns {SettlementComponent} this */
  register(defs) {
    Registry.register(SettlementComponent, defs, (d) => ({
      id: d.id,
      name: d.name ?? "",
      color:
        typeof d.color === "string"
          ? Color.parse(d.color)
          : (d.color ?? c_white),
    }));
    return this;
  },

  get(id) {
    return Registry.get(SettlementComponent, id);
  },

  has(id) {
    return Registry.has(SettlementComponent, id);
  },

  all() {
    return Registry.all(SettlementComponent);
  },
};
