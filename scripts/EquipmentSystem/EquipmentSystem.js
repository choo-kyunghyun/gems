// Pure operations on an entity's Equipment + Stats + Inventory (no world tick).
// Equipment is { slots: { weapon, armor, trinket, backpack } } where each value is
// an itemId or "". Equipped items STAY in the Inventory — they keep occupying a
// slot and counting toward capacity/maxWeight; the Equipment slot only references
// the equipped itemId. On equip/unequip the wearer's derived Stats are REBUILT from
// source via StatModel.recompute (which folds every equipped item's `mods` onto the
// attribute base) — so there's no +/- delta to keep balanced (the old fragile
// "deltas must pair" invariant is gone; a re-derive can't drift). The wearer must be
// attribute-driven (carry Attributes) for mods to apply; today only the player equips.
// NOTE: unlike the old delta path, a +maxHp item raises the cap but does NOT auto-heal
// (recompute only clamps a now-over-max resource down). A Container's capacity bonus is
// still a direct Inventory.capacity delta (not a Stat, not attribute-derived). A plain
// system object (the project's System pattern).
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
    StatModel.recompute(world, id); // re-derive WITH the newly equipped item's mods folded in
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

    eq.slots[slot] = ""; // clear FIRST so the re-derive drops the removed item's mods
    StatModel.recompute(world, id);
    const item = Item.get(itemId);
    if (item !== undefined) this._applyContainer(world, id, item, -1); // capacity stays a direct delta
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
};
