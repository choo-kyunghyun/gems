// Pure operation: use one unit of a Consumable item from an entity's Inventory,
// applying its instant effect. A plain system object (the project's System pattern).
globalThis.ConsumableSystem = {
  // Injected policy for a PERMANENT attribute grant (a *_shard consumable). The kit can't reach the
  // game's stat model (Attributes/StatModel are Demo), so — like Combat.mitigate — the Demo wires
  // this in sceneRpg.create to raise the attribute + recompute derived Stats. Default no-op returns
  // false, so a shard does nothing (and use() won't waste it) in a consumer that hasn't wired it.
  // Returns true if the attribute actually changed.
  grantAttr(world, id, attr, amount) {
    return false;
  },

  // Use one unit of itemId from entity `id`. Returns true if it was used (and one
  // unit removed). Fails (false) if the item isn't consumable, isn't owned, or
  // the effect would do nothing right now (e.g. healing at full HP — no waste).
  use(world, id, itemId) {
    const item = Item.get(itemId);
    if (item === undefined) return false;
    const con = item.getComponent(Consumable);
    if (con === undefined) return false; // not consumable

    const inv = world.get(Inventory, id);
    if (inv === undefined || !InventorySystem.has(inv, itemId, 1)) return false;

    if (!this._apply(world, id, con)) return false; // nothing to do — don't waste it
    InventorySystem.remove(inv, itemId, 1);
    return true;
  },

  // Apply the consumable's effects to the entity. Returns true if anything actually changed (so
  // use() can refuse a no-op). Two effects, independent: heal HP (clamped to Stats.maxHp) and a
  // permanent attribute grant (via the injected grantAttr hook). A shard always changes the
  // attribute, so it's never refused; a potion at full HP does nothing and IS refused.
  _apply(world, id, con) {
    let did = false;
    if (con.heal > 0) {
      const hp = world.get(Health, id);
      const stats = world.get(Stats, id);
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
      ConsumableSystem.grantAttr(world, id, con.attr, con.amount)
    )
      did = true;
    return did;
  },
};
