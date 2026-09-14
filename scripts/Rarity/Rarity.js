// Rarity-tier registry — the item quality ladder, in ascending tier order (see `rank`). Each genre
// registers its own tiers (the colony's via content.register), low tier first.
globalThis.Rarity = {
  register(defs) {
    Registry.register(Rarity, defs, Rarity.make);
  },

  /**
   * Rarity def, keyed by `id`: name (i18n key), color (colour int or "#rrggbb" hex), valueMod
   * (item-value multiplier).
   */
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

  /** tier index (registration order), -1 when unknown — the inventory sort key. */
  rank(id) {
    return Registry.rank(Rarity, id);
  },

  /** scale a value by a rarity's modifier; unknown id returns value as-is. */
  modify(id, value) {
    const r = Rarity.get(id);
    return r === undefined ? value : value * r.valueMod;
  },
};
