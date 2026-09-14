/**
 * The "just like faction" layer: a settlement carries a SettlementComponent id array in its record
 * (Settlement.components/hasComponent/addComponent), and this registry describes each id. Behavior (a
 * system acting on "settlements that have X") layers on later.
 */
globalThis.SettlementComponent = {
  register(defs) {
    Registry.register(SettlementComponent, defs, SettlementComponent.make);
  },

  /** { id, name, color } — color a colour int or "#rrggbb" hex. */
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
