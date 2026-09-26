// Uses one unit of a Consumable from an entity's Inventory, applying its instant effect.
globalThis.Consumption = {
  /**
   * Injected attribute-grant policy, keeping this module off the stat model. Returns true if the
   * attribute changed; until wired it changes nothing, so use() won't waste the item.
   */
  grantAttr(entities, id, attr, amount) {
    return false;
  },

  /**
   * Refuses, rather than waste the item, when its effect would do nothing now. Returns "" when
   * used, else the i18n key of why not.
   */
  use(entities, id, itemId) {
    const item = Item.get(itemId);
    if (item === undefined) return "INV_UNKNOWN_ITEM";
    const con = item.getComponent(Consumable);
    if (con === undefined) return "INV_NOT_USABLE";

    const inv = entities.require(id, Inventory);
    if (!Bag.has(inv, itemId, 1)) return "INV_NOT_OWNED";

    if (!Consumption._apply(entities, id, con)) return "INV_NO_EFFECT";
    Bag.remove(inv, itemId, 1);
    // a leftover container is best-effort: a full bag just loses the trash.
    if (con.yields !== "") Bag.add(inv, con.yields, 1);
    return "";
  },

  /** Returns true if anything changed. */
  _apply(entities, id, con) {
    let did = false;
    if (con.heal > 0) {
      const hp = entities.get(id, Health);
      const stats = entities.get(id, Stats);
      if (hp !== undefined) {
        const cap = stats !== undefined ? stats.maxHp : hp.hp + con.heal;
        if (hp.hp < cap) {
          hp.hp += con.heal;
          if (hp.hp > cap) hp.hp = cap;
          did = true;
        }
      }
    }
    if (
      con.attr !== "" &&
      Consumption.grantAttr(entities, id, con.attr, con.amount)
    )
      did = true;
    // a status always counts as a change; statusDuration 0 keeps the def's own duration.
    if (con.status !== "") {
      Effects.apply(
        entities,
        id,
        con.status,
        con.statusDuration > 0 ? { duration: con.statusDuration } : undefined,
      );
      did = true;
    }
    for (const token in con.needs)
      if (
        con.needs[token] > 0 &&
        Needs.restore(entities, id, token, con.needs[token])
      )
        did = true;
    return did;
  },
};
