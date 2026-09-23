/**
 * Manufacturer registry.
 *
 * A def may carry a signature `ops` layer (same operator shape as WeaponMod.ops); Loadout
 * folds it into every weapon the company makes, so brand identity is mechanical, not just cosmetic.
 */
globalThis.Manufacturer = {
  register(defs) {
    Registry.register(Manufacturer, defs, Manufacturer.make);
  },

  /**
   * Manufacturer def, keyed by `id`: name/lore (i18n keys), color (colour int or "#rrggbb" hex), ops
   * (signature weapon ops layer — see the contract above).
   */
  make(def) {
    return {
      id: def.id,
      name: def.name ?? "",
      lore: def.lore ?? "",
      color:
        typeof def.color === "string"
          ? Color.parse(def.color)
          : (def.color ?? c_white),
      ops: def.ops,
    };
  },

  get(id) {
    return Registry.get(Manufacturer, id);
  },

  /** registration index, -1 when unknown — the inventory sort key. */
  rank(id) {
    return Registry.rank(Manufacturer, id);
  },
};
