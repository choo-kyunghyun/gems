/**
 * Using an item from a body's bag, the one rule every use gesture shares: gear toggles on its
 * wearer, a consumable spends one unit, anything else is refused. A refusal is stated, never folded
 * into false: "" when used, else the i18n key of why.
 */
globalThis.Use = {
  /** Gear given no `uid` resolves to its worn instance, else to the first one owned. */
  item(entities, id, itemId, uid) {
    const item = Item.get(itemId);
    if (item === undefined) return "INV_UNKNOWN_ITEM";
    const eqp = item.getComponent(Equippable);
    if (eqp !== undefined) {
      const worn =
        uid !== undefined
          ? Loadout.wears(entities.require(id, Equipment), uid)
          : Loadout.worn(entities, id, itemId);
      if (worn) {
        Loadout.unequip(entities, id, eqp.slot);
        return "";
      }
      return uid !== undefined
        ? Loadout.equip(entities, id, uid)
        : Loadout.equipFirst(entities, id, itemId);
    }
    if (item.hasComponent(Consumable))
      return Consumption.use(entities, id, itemId);
    return "INV_NOT_USABLE";
  },
};
