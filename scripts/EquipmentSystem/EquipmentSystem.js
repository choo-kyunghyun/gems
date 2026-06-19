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
  // Equip the instance with this `uid` onto entity `id` (the item stays in its Inventory).
  // Returns true on success. Fails (false) if the uid isn't owned, its item isn't equippable,
  // or it's already equipped. If the slot holds a different instance, that one is unequipped
  // first. (To equip "some instance of an itemId" — e.g. the hotbar — use equipFirst.)
  equip(world, id, uid) {
    const inv = world.get(Inventory, id);
    const eq = world.get(Equipment, id);
    if (inv === undefined || eq === undefined) return false;
    const slot = InventorySystem.findByUid(inv, uid);
    if (slot === undefined) return false; // must own this instance
    const item = Item.get(slot.itemId);
    if (item === undefined) return false;
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return false; // not equippable
    if (eq.slots[eqp.slot] === uid) return false; // already equipped

    if (eq.slots[eqp.slot] !== "") this.unequip(world, id, eqp.slot);
    eq.slots[eqp.slot] = uid;
    StatModel.recompute(world, id); // re-derive WITH the newly equipped instance's mods folded in
    this._applyContainer(world, id, item, 1);
    return true;
  },

  // Equip the FIRST owned instance of `itemId` (the itemId-keyed entry point: the starting-gear
  // seed and the hotbar, which only know an itemId). No-op-false if none is owned or it's not
  // equippable. Returns true on success.
  equipFirst(world, id, itemId) {
    const inv = world.get(Inventory, id);
    if (inv === undefined) return false;
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i].itemId === itemId && inv.slots[i].uid !== undefined)
        return this.equip(world, id, inv.slots[i].uid);
    }
    return false;
  },

  // Unequip whatever occupies `slot` — the item stays in the Inventory; only the
  // reference and its Stat mods are cleared. Returns the unequipped instance uid, or ""
  // if the slot was empty.
  unequip(world, id, slot) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return "";
    const uid = eq.slots[slot];
    if (uid === undefined || uid === "") return "";

    eq.slots[slot] = ""; // clear FIRST so the re-derive drops the removed item's mods
    StatModel.recompute(world, id);
    const inv = world.get(Inventory, id);
    const s =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    const item = s !== undefined ? Item.get(s.itemId) : undefined;
    if (item !== undefined) this._applyContainer(world, id, item, -1); // capacity stays a direct delta
    return uid;
  },

  // Attack profile of the equipped weapon — a FRESH composed object: the base Weapon's
  // numbers plus every installed mod's WeaponMod.weapon deltas (so the controller reads the
  // modded profile). null when unarmed / the equipped item has no Weapon → the caller
  // (controller) falls back to its own unarmed defaults. Never mutates the def's Weapon.
  weaponProfile(world, id) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return null;
    const uid = eq.slots.weapon;
    if (uid === undefined || uid === "") return null;
    const inv = world.get(Inventory, id);
    const slot =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    if (slot === undefined) return null;
    const item = Item.get(slot.itemId);
    if (item === undefined) return null;
    const wpn = item.getComponent(Weapon);
    if (wpn === undefined) return null;
    return this.composeWeapon(wpn, slot.mods);
  },

  // Fold a base Weapon + an instance's installed mod itemIds into a fresh attack profile.
  // `melee` is fixed by the base; mods only adjust the numeric fields (additive deltas).
  composeWeapon(wpn, mods) {
    const out = {
      damage: wpn.damage,
      fireCd: wpn.fireCd,
      bulletSpeed: wpn.bulletSpeed,
      melee: wpn.melee,
      reach: wpn.reach,
    };
    if (mods === undefined) return out;
    for (let i = 0; i < mods.length; i++) {
      const m = Item.get(mods[i]);
      const wm = m !== undefined ? m.getComponent(WeaponMod) : undefined;
      if (wm === undefined) continue;
      const d = wm.weapon;
      for (const k in d) {
        // Additive onto the base. Only deltas a field the BASE explicitly declared — an unset
        // field falls through to the controller's default (RPG_FIRE_CD/etc.), a default the kit
        // can't see, so fabricating from 0 would be wrong (e.g. a negative fireCd). Content gives
        // every moddable weapon an explicit value for the fields its mods target (see RpgContent).
        if (out[k] !== undefined) out[k] += d[k];
      }
    }
    return out;
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
