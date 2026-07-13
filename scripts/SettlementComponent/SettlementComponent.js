// SettlementComponent — the registry of settlement CAPABILITY defs (market / depot / farm / …),
// the "just like faction" layer: a settlement carries a flat comma-joined id list in its Zone data
// (Settlement.components/hasComponent/addComponent), and this registry describes each id. Pure data
// like FactionSystem/Rarity/Status — behavior (a system acting on "settlements that have X") layers
// on later. Content registers its set from create()-time (RpgContent.register), never top level.
//
// GMRT: a plain-object store keyed by string id + an insertion-order array — for...in / index-loop
// safe (no Map-iterator for...of, which hard-crashes the runtime; see CLAUDE.md).
globalThis.SettlementComponent = {
  _defs: {}, // id -> { id, name, color }
  _order: [], // insertion order (for all())

  /** @param {{id:string,name?:string,color?:number|string}[]} defs @returns {SettlementComponent} this */
  register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (this._defs[d.id] === undefined) this._order.push(d.id);
      this._defs[d.id] = {
        id: d.id,
        name: d.name ?? "",
        color:
          typeof d.color === "string"
            ? Color.parse(d.color)
            : (d.color ?? c_white),
      };
    }
    return this;
  },

  /** @returns {Object|undefined} the def for an id. */
  get(id) {
    return this._defs[id];
  },

  /** @returns {boolean} whether `id` is registered. */
  has(id) {
    return this._defs[id] !== undefined;
  },

  /** @returns {Object[]} all defs in registration order (index-loop — no Map-iterator). */
  all() {
    const out = [];
    for (let i = 0; i < this._order.length; i++)
      out.push(this._defs[this._order[i]]);
    return out;
  },
};
