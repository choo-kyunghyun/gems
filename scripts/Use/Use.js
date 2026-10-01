/**
 * Using an item from a body's bag, the one rule every use gesture shares: gear toggles on its
 * wearer, a consumable spends one unit, a throwable readies the player's next throw, a placeable
 * readies the player's next placement, a vehicle key summons or stows its vehicle, an openable
 * opens into its loot table's roll, anything else is refused. A refusal is stated, never folded into false: "" when used, else the i18n key of why.
 */
globalThis.Use = {
  /**
   * Gear given no `uid` resolves to its worn instance, else to the first one owned; a key given
   * none to the first one owned. `got`, when given, receives an opening's `items` and `dropped`.
   */
  item(level, id, itemId, uid, got) {
    const entities = level.entities;
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
    if (item.hasComponent(Throwable)) {
      const pl = entities.get(id, Playable);
      if (pl === undefined) return "INV_NOT_USABLE";
      if (!Bag.has(entities.require(id, Inventory), itemId, 1))
        return "INV_NOT_OWNED";
      pl.toss = itemId;
      return "";
    }
    if (item.hasComponent(Placeable)) {
      const pl = entities.get(id, Playable);
      if (pl === undefined) return "INV_NOT_USABLE";
      if (!Bag.has(entities.require(id, Inventory), itemId, 1))
        return "INV_NOT_OWNED";
      pl.place = itemId;
      return "";
    }
    if (item.hasComponent(VehicleKey)) return Garage.use(level, id, itemId, uid);
    if (item.hasComponent(Openable)) {
      const r = Loot.open(entities, id, itemId);
      if (got !== undefined) {
        got.items = r.items;
        got.dropped = r.dropped;
      }
      return r.reason;
    }
    return "INV_NOT_USABLE";
  },
};
