// Use one unit of a Consumable from an entity's Inventory, applying its instant effect.
globalThis.ConsumableSystem = {
  // Injected attribute-grant policy (a *_shard). Kit can't reach the Demo stat model, so — like
  // Combat.mitigate — the Demo wires this in sceneRpg.create. Default no-op returns false (a shard
  // does nothing, and use() won't waste it, until wired). Returns true if the attribute changed.
  grantAttr(world, id, attr, amount) {
    return false;
  },

  // Use one unit of itemId from entity `id`. Fails if not consumable, not owned, or the effect would
  // do nothing now (e.g. healing at full HP — no waste).
  use(world, id, itemId) {
    const item = Item.get(itemId);
    if (item === undefined) return false;
    const con = item.getComponent(Consumable);
    if (con === undefined) return false;

    const inv = world.get(Inventory, id);
    if (inv === undefined || !InventorySystem.has(inv, itemId, 1)) return false;

    if (!this._apply(world, id, con)) return false; // nothing to do — don't waste it
    InventorySystem.remove(inv, itemId, 1);
    // leftover container (an empty can) — best-effort: a full bag just loses the trash
    if (con.yields !== "") InventorySystem.add(inv, con.yields, 1);
    return true;
  },

  // Apply the consumable's effects. Returns true if anything changed (so use() can refuse a no-op:
  // a potion at full HP does nothing and IS refused; a shard always changes the attribute).
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
    // Status grant via the StatusSystem kit. A status-only consumable still counts as "did
    // something". statusDuration 0 → the def's own duration.
    if (con.status !== "") {
      StatusSystem.apply(
        world,
        id,
        con.status,
        con.statusDuration > 0 ? { duration: con.statusDuration } : undefined,
      );
      did = true;
    }
    // Survival restores (drink/eat) via the Survival kit. restore() returns false when the need is
    // already satisfied, so a no-op drink/food isn't wasted (same rule as healing at full HP).
    if (con.thirst > 0 && ThirstSystem.restore(world, id, con.thirst))
      did = true;
    if (con.hunger > 0 && HungerSystem.restore(world, id, con.hunger))
      did = true;
    return did;
  },
};
