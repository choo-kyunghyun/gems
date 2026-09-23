// Rarity-tier registry: the item quality ladder. Tiers register low tier first, so registration
// order is the tier order.
globalThis.Rarity = {
  register(defs) {
    Registry.register(Rarity, defs, Rarity.make);
  },

  /** def: id, name (i18n key), color (colour int or "#rrggbb"), valueMod (value multiplier). */
  make(def) {
    return {
      id: def.id,
      name: def.name ?? "",
      color:
        typeof def.color === "string"
          ? Color.parse(def.color)
          : (def.color ?? c_white),
      valueMod: def.valueMod ?? 1,
    };
  },

  get(id) {
    return Registry.get(Rarity, id);
  },

  /** Tier index, -1 when unknown. */
  rank(id) {
    return Registry.rank(Rarity, id);
  },

  /** An unknown id returns the value as-is. */
  modify(id, value) {
    const r = Rarity.get(id);
    return r === undefined ? value : value * r.valueMod;
  },
};
