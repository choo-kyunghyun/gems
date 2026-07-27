// Pure operations on an entity's Equipment + Stats + Inventory (no world tick). Equipped items STAY in
// the Inventory (still counting toward capacity/maxWeight); the slot only references their uid.
/**
 * On equip/unequip the derived Stats are REBUILT from source via StatModel.recompute (folds every
 * equipped item's mods onto the attribute base) — no +/- delta to keep balanced, so it can't drift.
 * Wearer must carry Attributes for mods to apply (today only the player). A +maxHp item raises the cap
 * but does NOT auto-heal (recompute only clamps over-max down). A Container's capacity bonus stays a
 * direct Inventory.capacity delta.
 */
globalThis.EquipmentSystem = {
  // Equip the instance `uid` onto `id` (item stays in Inventory). Fails if not owned, not equippable,
  // or already equipped; a different occupant is unequipped first. (For "some instance of an itemId"
  // — e.g. the hotbar — use equipFirst.)
  equip(entities, id, uid) {
    const inv = entities.get(Inventory, id);
    const eq = entities.get(Equipment, id);
    if (inv === undefined || eq === undefined) return false;
    const slot = InventorySystem.findByUid(inv, uid);
    if (slot === undefined) return false; // must own this instance
    const item = Item.get(slot.itemId);
    if (item === undefined) return false;
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return false; // not equippable
    if (eq.slots[eqp.slot] === uid) return false; // already equipped

    if (eq.slots[eqp.slot] !== "") this.unequip(entities, id, eqp.slot);
    eq.slots[eqp.slot] = uid;
    StatModel.recompute(entities, id); // re-derive with the equipped mods folded in
    AppearanceSystem.rebuild(entities, id); // worn gear shows on the paper-doll (no-op sans Appearance)
    this._applyContainer(entities, id, item, 1);
    return true;
  },

  // Equip the FIRST owned instance of `itemId` (the itemId-keyed entry point: starting-gear seed +
  // hotbar, which only know an itemId). False if none owned / not equippable.
  equipFirst(entities, id, itemId) {
    const inv = entities.get(Inventory, id);
    if (inv === undefined) return false;
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i].itemId === itemId && inv.slots[i].uid !== undefined)
        return this.equip(entities, id, inv.slots[i].uid);
    }
    return false;
  },

  // Unequip whatever occupies `slot` — item stays in Inventory; only the reference + Stat mods clear.
  // Returns the unequipped uid, or "" if empty.
  unequip(entities, id, slot) {
    const eq = entities.get(Equipment, id);
    if (eq === undefined) return "";
    const uid = eq.slots[slot];
    if (uid === undefined || uid === "") return "";

    eq.slots[slot] = ""; // clear FIRST so the re-derive drops the removed item's mods
    StatModel.recompute(entities, id);
    AppearanceSystem.rebuild(entities, id); // drop the removed item's paper-doll layer
    const inv = entities.get(Inventory, id);
    const s =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    const item = s !== undefined ? Item.get(s.itemId) : undefined;
    if (item !== undefined) this._applyContainer(entities, id, item, -1); // capacity stays a direct delta
    return uid;
  },

  // Weapon composition. Kinetic-power tuning (gun): power = ammoPower + KIN_K * mass *
  // (velocity/KIN_REF)^2 — velocity squared rewards speed. Content-tunable.
  KIN_K: 0.75,
  KIN_REF: 1200, // doubled with the 32px-cell ammo velocities so (v/KIN_REF)² — and damage — is unchanged

  // The equipped weapon's live Inventory slot (carrying uid/mods/ammo/rounds), or null. The
  // controller needs the real slot — not a copy — to decrement `rounds` on a shot.
  weaponSlot(entities, id) {
    const eq = entities.get(Equipment, id);
    if (eq === undefined) return null;
    const uid = eq.slots.weapon;
    if (uid === undefined || uid === "") return null;
    const inv = entities.get(Inventory, id);
    const slot =
      inv !== undefined ? InventorySystem.findByUid(inv, uid) : undefined;
    return slot ?? null;
  },

  // Composed profile of the equipped weapon, or null when unarmed → the controller falls back to its
  // unarmed defaults. Convenience over weaponSlot + composeWeapon.
  weaponProfile(entities, id) {
    const slot = this.weaponSlot(entities, id);
    return slot !== null ? this.composeWeapon(slot) : null;
  },

  // Fold a weapon slot into a FRESH composed profile (never mutates the item def). Gun branch:
  // ammo base → gun ops → attachment ops → kinetic power → { kind:"gun", ... }. Melee branch:
  // damage/reach/fireCd → attachment ops → { kind:"melee", ... }.
  composeWeapon(slot) {
    const item = Item.get(slot.itemId);
    if (item === undefined) return null;
    const wpn = item.getComponent(Weapon);
    if (wpn === undefined) return null;
    const gun = item.getComponent(Gun);
    if (gun !== undefined) return this._composeGun(slot, wpn, gun);
    return this._composeMelee(slot, wpn);
  },

  // Top up the equipped gun's magazine from the bag (R / auto-reload). Returns rounds loaded.
  reload(entities, id) {
    const slot = this.weaponSlot(entities, id);
    if (slot === null) return 0;
    const inv = entities.get(Inventory, id);
    if (inv === undefined) return 0;
    return this.reloadSlot(inv, slot);
  },

  // Top up a specific gun instance's magazine from `inv`'s ammo reserve (min(need, owned)). The slot
  // variant so the workbench panel can reload a SELECTED weapon that isn't equipped.
  reloadSlot(inv, slot) {
    const item = Item.get(slot.itemId);
    const gun = item !== undefined ? item.getComponent(Gun) : undefined;
    if (gun === undefined) return 0;
    // fresh gun (no ammo TYPE chosen yet): auto-load the first caliber-compatible ammo in the
    // bag, so R fires a new gun without the Toolkit panel (deliberate type switching stays there).
    if (slot.ammo === undefined || slot.ammo === "")
      slot.ammo = this._firstAmmo(inv, gun.caliber);
    if (slot.ammo === "") return 0;
    if (slot.rounds === undefined) slot.rounds = 0;
    const cap = this.composeWeapon(slot).magazine; // composed clip (incl. extended-mag attachment)
    const need = cap - slot.rounds;
    if (need <= 0) return 0;
    const have = InventorySystem.count(inv, slot.ammo);
    const take = need < have ? need : have;
    if (take <= 0) return 0;
    InventorySystem.remove(inv, slot.ammo, take);
    slot.rounds += take;
    return take;
  },

  // Load an ammo type into the equipped gun (caliber-gated), then top up.
  loadAmmo(entities, id, ammoItemId) {
    const slot = this.weaponSlot(entities, id);
    if (slot === null) return false;
    const inv = entities.get(Inventory, id);
    if (inv === undefined) return false;
    return this.loadAmmoSlot(inv, slot, ammoItemId);
  },

  // Load an ammo type into a specific gun instance (caliber-gated), then top up. Switching type
  // refunds the chambered rounds to `inv` first so a swap doesn't lose them. The slot variant.
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
      if (slot.ammo !== undefined && slot.ammo !== "" && slot.rounds > 0) {
        // refund the old chambered rounds — all-or-nothing: an unfit refund refuses the swap
        // rather than silently destroying the rounds (make room, then switch).
        const unfit = InventorySystem.add(inv, slot.ammo, slot.rounds);
        if (unfit > 0) {
          InventorySystem.remove(inv, slot.ammo, slot.rounds - unfit); // take back the partial refund
          return false;
        }
      }
      slot.ammo = ammoItemId;
      slot.rounds = 0;
    }
    this.reloadSlot(inv, slot);
    return true;
  },

  // First caliber-compatible Ammo itemId in `inv` (slot order), or "" when none owned.
  _firstAmmo(inv, caliber) {
    for (let i = 0; i < inv.slots.length; i++) {
      const it = Item.get(inv.slots[i].itemId);
      const am = it !== undefined ? it.getComponent(Ammo) : undefined;
      if (am !== undefined && am.caliber === caliber)
        return inv.slots[i].itemId;
    }
    return "";
  },

  // Installed-attachment ops layers for an instance slot (order-independent), plus the item
  // maker's signature ops layer (Manufacturer.ops) — brand identity composes like an attachment.
  _modLayers(slot) {
    const layers = [];
    const item = Item.get(slot.itemId);
    const maker = item !== undefined ? Manufacturer.get(item.maker) : undefined;
    if (maker !== undefined && maker.ops !== undefined) layers.push(maker.ops);
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

    // Base = loaded ammo stats (0 with no ammo) + gun fireCd/magazine. fireCd may be undefined
    // (controller defaults it), so _applyOps leaves it undefined.
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

  // Apply operator layers over a base map: per field, (base + Σadd) · Πmul (order-independent). A
  // field whose base is undefined stays undefined — ops can't fabricate a value the base never
  // declared (the controller defaults it). Index loops only — GMRT-safe.
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

  // Add (+1) / remove (-1) an item's Container capacity bonus to Inventory.capacity. No-op without a
  // Container. equip/unequip pair, so the delta stays balanced; items over a reduced cap just stay.
  _applyContainer(entities, id, item, sign) {
    const con = item.getComponent(Container);
    if (con === undefined) return;
    const inv = entities.get(Inventory, id);
    if (inv === undefined) return;
    inv.capacity += con.capacity * sign;
    if (inv.capacity < 0) inv.capacity = 0;
  },
};
