/**
 * Manufacturer registry. A def may carry a signature weapon `ops` layer folded into every weapon
 * the company makes, so brand identity is mechanical, not just cosmetic.
 */
globalThis.Manufacturer = {
  register(defs) {
    Registry.register(Manufacturer, defs, Manufacturer.make);
  },

  /** `name`/`lore` are i18n keys; `color` a colour int or "#rrggbb" hex. */
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

  /** Registration index, -1 when unknown. */
  rank(id) {
    return Registry.rank(Manufacturer, id);
  },
};
