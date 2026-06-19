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

  // ── Weapon composition (the equipped weapon's resolved attack profile) ─────────────────────────
  // Kinetic-power tuning (gun branch): power = ammoPower + KIN_K * mass * (velocity / KIN_REF)^2, so a
  // faster/heavier round hits harder (velocity squared rewards speed). Tuned so the blaster + a light
  // round lands ≈ its legacy flat damage; both are content-tunable.
  KIN_K: 0.75,
  KIN_REF: 600,

  // The equipped weapon's live Inventory SLOT (the instance carrying uid/mods/ammo/rounds), or null.
  // The controller needs the real slot — not a composed copy — to decrement `rounds` on a shot.
  weaponSlot(world, id) {
    const eq = world.get(Equipment, id);
    if (eq === undefined) return null;
    const uid = eq.slots.weapon;
    if (uid === undefined || uid === "") return null;
    const inv = world.get(Inventory, id);
    const slot =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    return slot ?? null;
  },

  // Composed attack profile of the equipped weapon, or null when unarmed / not a weapon → the caller
  // (controller) falls back to its own unarmed defaults. Convenience over weaponSlot + composeWeapon.
  weaponProfile(world, id) {
    const slot = this.weaponSlot(world, id);
    return slot !== null ? this.composeWeapon(slot) : null;
  },

  // Fold an instance weapon SLOT into a FRESH composed profile. Branches on whether the item is a Gun
  // (Item.hasComponent(Gun)):
  //   • gun   → the loaded Ammo's base stats run through the gun-base ops + each installed
  //             attachment's ops, then the kinetic power term → { kind:"gun", power, velocity, mass,
  //             penetration, fireCd, magazine, ammo, rounds, noAmmo }.
  //   • melee → the Weapon's damage/reach/fireCd run through the attachment ops →
  //             { kind:"melee", damage, reach, fireCd }.
  // Never mutates the item def. `slot.mods` is the named-slot map { slotId -> attachmentItemId }.
  composeWeapon(slot) {
    const item = Item.get(slot.itemId);
    if (item === undefined) return null;
    const wpn = item.getComponent(Weapon);
    if (wpn === undefined) return null;
    const gun = item.getComponent(Gun);
    if (gun !== undefined) return this._composeGun(slot, wpn, gun);
    return this._composeMelee(slot, wpn);
  },

  // Top up the EQUIPPED gun's magazine from the bag's ammo reserve (the controller's R / auto-reload).
  // Returns rounds loaded. Resolves the equipped slot + bag, then delegates to reloadSlot.
  reload(world, id) {
    const slot = this.weaponSlot(world, id);
    if (slot === null) return 0;
    const inv = world.get(Inventory, id);
    if (inv === undefined) return 0;
    return this.reloadSlot(inv, slot);
  },

  // Top up a specific gun instance's magazine from `inv`'s reserve of its loaded ammo. Pulls
  // min(magazine - rounds, owned). Returns how many were loaded (0 if not a gun / nothing loaded /
  // clip full / no reserve). The slot variant so the workbench panel can reload a SELECTED weapon
  // that isn't the equipped one.
  reloadSlot(inv, slot) {
    const item = Item.get(slot.itemId);
    const gun = item !== undefined ? item.getComponent(Gun) : undefined;
    if (gun === undefined) return 0;
    if (slot.ammo === undefined || slot.ammo === "") return 0;
    if (slot.rounds === undefined) slot.rounds = 0;
    const cap = this.composeWeapon(slot).magazine; // composed clip (extended-mag attachment)
    const need = cap - slot.rounds;
    if (need <= 0) return 0;
    const have = InventorySystem.count(inv, slot.ammo);
    const take = need < have ? need : have;
    if (take <= 0) return 0;
    InventorySystem.remove(inv, slot.ammo, take);
    slot.rounds += take;
    return take;
  },

  // Load an ammo type into the EQUIPPED gun (caliber-gated), then top up. Delegates to loadAmmoSlot.
  loadAmmo(world, id, ammoItemId) {
    const slot = this.weaponSlot(world, id);
    if (slot === null) return false;
    const inv = world.get(Inventory, id);
    if (inv === undefined) return false;
    return this.loadAmmoSlot(inv, slot, ammoItemId);
  },

  // Load an ammo type into a specific gun instance (gated by caliber match), then top up the
  // magazine. Switching to a different type refunds the currently-chambered rounds to `inv` first (so
  // a swap doesn't lose loaded rounds). Returns true if loaded. The slot variant (see reloadSlot).
  loadAmmoSlot(inv, slot, ammoItemId) {
    const item = Item.get(slot.itemId);
    const gun = item !== undefined ? item.getComponent(Gun) : undefined;
    if (gun === undefined) return false;
    const ammoItem = Item.get(ammoItemId);
    const ammo =
      ammoItem !== undefined ? ammoItem.getComponent(Ammo) : undefined;
    if (ammo === undefined || ammo.caliber !== gun.caliber) return false;
    if (slot.rounds === undefined) slot.rounds = 0;
    if (slot.ammo !== ammoItemId) {
      if (slot.ammo !== undefined && slot.ammo !== "" && slot.rounds > 0)
        InventorySystem.add(inv, slot.ammo, slot.rounds); // refund the old chambered rounds
      slot.ammo = ammoItemId;
      slot.rounds = 0;
    }
    this.reloadSlot(inv, slot);
    return true;
  },

  // The installed-attachment ops layers for an instance slot, in slot-map order (order-independent).
  _modLayers(slot) {
    const layers = [];
    const mods = slot.mods;
    if (mods === undefined) return layers;
    for (const slotId in mods) {
      const m = Item.get(mods[slotId]);
      const wm = m !== undefined ? m.getComponent(WeaponMod) : undefined;
      if (wm !== undefined) layers.push(wm.ops);
    }
    return layers;
  },

  _composeMelee(slot, wpn) {
    const base = { damage: wpn.damage, reach: wpn.reach, fireCd: wpn.fireCd };
    const c = this._applyOps(base, this._modLayers(slot), [
      "damage",
      "reach",
      "fireCd",
    ]);
    return {
      kind: "melee",
      damage: c.damage,
      reach: c.reach,
      fireCd: c.fireCd,
    };
  },

  _composeGun(slot, wpn, gun) {
    if (slot.rounds === undefined) slot.rounds = 0;
    if (slot.ammo === undefined) slot.ammo = "";
    const ammoItem = slot.ammo !== "" ? Item.get(slot.ammo) : undefined;
    const ammo =
      ammoItem !== undefined ? ammoItem.getComponent(Ammo) : undefined;

    // Base = loaded ammo's projectile stats (0 with no ammo) + the gun's fireCd/magazine. fireCd may
    // be undefined (the controller falls back to its default), so _applyOps leaves it undefined.
    const base = {
      mass: ammo !== undefined ? ammo.mass : 0,
      velocity: ammo !== undefined ? ammo.velocity : 0,
      power: ammo !== undefined ? ammo.power : 0,
      penetration: ammo !== undefined ? ammo.penetration : 0,
      fireCd: wpn.fireCd,
      magazine: gun.magazine,
    };
    const layers = this._modLayers(slot);
    layers.unshift(gun.ops); // gun-base ops first (before attachments; order-independent anyway)
    const c = this._applyOps(base, layers, [
      "mass",
      "velocity",
      "power",
      "penetration",
      "fireCd",
      "magazine",
    ]);

    const magazine = Math.max(1, Math.round(c.magazine));
    const fireCd =
      c.fireCd !== undefined ? Math.max(1, Math.round(c.fireCd)) : undefined;
    const penetration = Math.max(0, Math.round(c.penetration));
    // Kinetic power: flat ammo power + k·mass·(velocity/REF)². 0 with no ammo loaded.
    let power = 0;
    if (ammo !== undefined) {
      const v = c.velocity / EquipmentSystem.KIN_REF;
      power = c.power + EquipmentSystem.KIN_K * c.mass * v * v;
    }
    return {
      kind: "gun",
      noAmmo: ammo === undefined,
      power,
      velocity: c.velocity,
      mass: c.mass,
      penetration,
      fireCd,
      magazine,
      ammo: slot.ammo,
      rounds: slot.rounds,
    };
  },

  // Apply operator layers over a base map. Each layer is { field: { add?, mul? } }; per field the
  // result is (base + Σadd) · Πmul (order-independent additive-then-multiplicative stacking). A field
  // whose base is undefined is left undefined (ops can't fabricate a value the base never declared —
  // mirrors the old "only delta declared fields" rule; the controller defaults it). for...in / index
  // loops only — GMRT-safe.
  _applyOps(base, layers, fields) {
    const out = {};
    for (let f = 0; f < fields.length; f++) {
      const key = fields[f];
      const b = base[key];
      if (b === undefined) {
        out[key] = undefined;
        continue;
      }
      let add = 0;
      let mul = 1;
      for (let i = 0; i < layers.length; i++) {
        const op = layers[i][key];
        if (op === undefined) continue;
        if (op.add !== undefined) add += op.add;
        if (op.mul !== undefined) mul *= op.mul;
      }
      out[key] = (b + add) * mul;
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
