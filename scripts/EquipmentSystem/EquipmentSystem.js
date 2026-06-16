// Pure operations on an entity's Equipment + Stats + Inventory (no world tick).
// Equipment is { slots: { weapon, armor, trinket, backpack } } where each value is
// an itemId or "". Equipped items STAY in the Inventory — they keep occupying a
// slot and counting toward capacity/maxWeight; the Equipment slot only
// references the equipped itemId and ADDS its `mods` to the live Stats sheet (and
// any Container capacity bonus to the Inventory). Unequipping reverses the exact
// same deltas. Because Item defs are static, equip/unequip always pair, so no
// recompute-from-base pass is needed (deltas stay balanced). A plain system object
// (the project's System pattern).
globalThis.EquipmentSystem = {
  // Equip itemId onto entity `id` (the item stays in its Inventory). Returns true
  // on success. Fails (false) if the item isn't equippable, isn't owned, or is
  // already equipped in its slot. If the slot holds a different item, that one is
  // unequipped first.
  equip(world, id, itemId) {
    const item = Item.get(itemId);
    if (item === undefined) return false;
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return false; // not equippable

    const inv = world.get(Inventory, id);
    const eq = world.get(Equipment, id);
    if (inv === undefined || eq === undefined) return false;
    if (!InventorySystem.has(inv, itemId, 1)) return false; // must own it
    if (eq.slots[eqp.slot] === itemId) return false; // already equipped

    if (eq.slots[eqp.slot] !== "") this.unequip(world, id, eqp.slot);
    eq.slots[eqp.slot] = itemId;
    this._applyMods(world, id, eqp.mods, 1);
    this._applyContainer(world, id, item, 1);
    return true;
  },

  // Unequip whatever occupies `slot` — the item stays in the Inventory; only the
  // reference and its Stat mods are cleared. Returns the unequipped itemId, or ""
  // if the slot was empty.
  unequip(world, id, slot) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return "";
    const itemId = eq.slots[slot];
    if (itemId === undefined || itemId === "") return "";

    const item = Item.get(itemId);
    if (item !== undefined) {
      const eqp = item.getComponent(Equippable);
      if (eqp !== undefined) this._applyMods(world, id, eqp.mods, -1);
      this._applyContainer(world, id, item, -1);
    }
    eq.slots[slot] = "";
    return itemId;
  },

  // Attack profile of the equipped weapon (its Weapon component), or null when
  // unarmed / the equipped item has none. The caller (controller) falls back to
  // its own unarmed defaults on null.
  weaponProfile(world, id) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return null;
    const wid = eq.slots.weapon;
    if (wid === undefined || wid === "") return null;
    const item = Item.get(wid);
    if (item === undefined) return null;
    const wpn = item.getComponent(Weapon);
    return wpn !== undefined ? wpn : null;
  },

  // Add (sign +1) or remove (sign -1) an item's Container capacity bonus to/from
  // the owner's Inventory.capacity. No-op if the item has no Container. Like mods,
  // equip/unequip always pair, so the delta stays balanced. Items already held
  // beyond a reduced capacity simply stay — add() just refuses new ones until
  // the count drops back under it.
  _applyContainer(world, id, item, sign) {
    const con = item.getComponent(Container);
    if (con === undefined) return;
    const inv = world.get(Inventory, id);
    if (inv === undefined) return;
    inv.capacity += con.capacity * sign;
    if (inv.capacity < 0) inv.capacity = 0;
  },

  // Add (sign +1) or remove (sign -1) a flat { stat: delta } block to/from Stats.
  // for...in over a plain object is GMRT-safe (no Map iterator). A maxHp change
  // shifts current Health too: gains heal, losses clamp.
  _applyMods(world, id, mods, sign) {
    if (mods === undefined) return;
    const stats = world.get(Stats, id);
    if (stats === undefined) return;
    for (const key in mods) {
      if (stats[key] !== undefined) stats[key] += mods[key] * sign;
    }
    if (mods.maxHp !== undefined) {
      const hp = world.get(Health, id);
      if (hp !== undefined) {
        if (sign > 0) hp.hp += mods.maxHp;
        if (hp.hp > stats.maxHp) hp.hp = stats.maxHp;
        if (hp.hp < 1) hp.hp = 1;
      }
    }
  },
};
