/**
 * Registry describing the component ids a settlement's record carries.
 * TODO systems acting on "settlements that have X".
 */
globalThis.SettlementComponent = {
  register(defs) {
    Registry.register(SettlementComponent, defs, SettlementComponent.make);
  },

  /** `color` is a colour int or "#rrggbb" hex. */
  make(d) {
    return {
      id: d.id,
      name: d.name ?? "",
      color:
        typeof d.color === "string"
          ? Color.parse(d.color)
          : (d.color ?? c_white),
    };
  },
};
