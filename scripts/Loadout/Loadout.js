/**
 * Pure equipment operations; an equipped item stays in the Inventory. The wearer must carry
 * Inventory and Equipment, or an entry point fails at once. A refusal is stated, never folded into
 * false: `equip` returns "" when equipped, else the i18n key of why.
 *
 * Equip/unequip rebuild the derived Stats from source rather than applying a delta, so they can't
 * drift; mods apply only to a wearer with Attributes, and a raised max HP does not heal. A
 * Container's capacity bonus is the one direct delta.
 */
globalThis.Loadout = {
  /** A different occupant of the slot is unequipped first. */
  equip(entities, id, uid) {
    const inv = entities.require(id, Inventory);
    const eq = entities.require(id, Equipment);
    const slot = Bag.findByUid(inv, uid);
    if (slot === undefined) return "INV_NOT_OWNED";
    const item = Item.get(slot.itemId);
    if (item === undefined) return "INV_UNKNOWN_ITEM";
    const eqp = item.getComponent(Equippable);
    if (eqp === undefined) return "INV_NOT_EQUIPPABLE";
    if (eq.slots[eqp.slot] === uid) return "INV_ALREADY_WORN";

    if (eq.slots[eqp.slot] !== "")
      Loadout.unequip(entities, id, eqp.slot);
    eq.slots[eqp.slot] = uid;
    StatModel.recompute(entities, id);
    AppearanceSystem.rebuild(entities, id);
    Loadout._applyContainer(entities, id, item, 1);
    return "";
  },

  /** Equips the first owned instance of `itemId`; returns as `equip`. */
  equipFirst(entities, id, itemId) {
    const inv = entities.require(id, Inventory);
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i].itemId === itemId && inv.slots[i].uid !== undefined)
        return Loadout.equip(entities, id, inv.slots[i].uid);
    }
    return "INV_NOT_OWNED";
  },

  /** Returns the unequipped uid, or "" if the slot was empty. */
  unequip(entities, id, slot) {
    const eq = entities.require(id, Equipment);
    const uid = eq.slots[slot];
    if (uid === undefined || uid === "") return "";

    eq.slots[slot] = ""; // cleared first so the re-derive drops the removed item's mods
    StatModel.recompute(entities, id);
    AppearanceSystem.rebuild(entities, id);
    const s = Bag.findByUid(entities.require(id, Inventory), uid);
    const item = s !== undefined ? Item.get(s.itemId) : undefined;
    if (item !== undefined)
      Loadout._applyContainer(entities, id, item, -1);
    return uid;
  },

  /**
   * Unequips every slot whose instance left the bag, so no slot or folded-in mod dangles; run it
   * after any bag mutation that can take a worn instance out. Returns the number cleared.
   */
  reconcile(entities, id) {
    const eq = entities.require(id, Equipment);
    const inv = entities.require(id, Inventory);
    let n = 0;
    for (const slot in eq.slots) {
      const uid = eq.slots[slot];
      if (uid === undefined || uid === "") continue;
      if (Bag.findByUid(inv, uid) !== undefined) continue;
      Loadout.unequip(entities, id, slot);
      n++;
    }
    return n;
  },

  // gun kinetic power: velocity squared rewards speed.
  KIN_K: 0.75,
  KIN_REF: 1200, // scaled with ammo velocities so damage is scale-independent

  /** The equipped weapon's live Inventory slot — not a copy, so a shot can spend its rounds. */
  weaponSlot(entities, id) {
    const eq = entities.require(id, Equipment);
    const uid = eq.slots.weapon;
    if (uid === undefined || uid === "") return null;
    const slot = Bag.findByUid(entities.require(id, Inventory), uid);
    return slot ?? null;
  },

  /** Null when unarmed. */
  weaponProfile(entities, id) {
    const slot = Loadout.weaponSlot(entities, id);
    return slot !== null ? Loadout.composeWeapon(slot) : null;
  },

  /** A fresh profile each call; the item def is never mutated. */
  composeWeapon(slot) {
    const item = Item.get(slot.itemId);
    if (item === undefined) return null;
    const wpn = item.getComponent(Weapon);
    if (wpn === undefined) return null;
    const gun = item.getComponent(Gun);
    if (gun !== undefined) return Loadout._composeGun(slot, wpn, gun);
    return Loadout._composeMelee(slot, wpn);
  },

  /** Returns the rounds loaded. */
  reload(entities, id) {
    const slot = Loadout.weaponSlot(entities, id);
    if (slot === null) return 0;
    return Loadout.reloadSlot(entities.require(id, Inventory), slot);
  },

  /** Reloads any gun instance, equipped or not, from `inv`'s ammo. Returns the rounds loaded. */
  reloadSlot(inv, slot) {
    const item = Item.get(slot.itemId);
    const gun = item !== undefined ? item.getComponent(Gun) : undefined;
    if (gun === undefined) return 0;
    // a gun with no ammo type chosen takes the first compatible one, so a new gun fires at once.
    if (slot.ammo === undefined || slot.ammo === "")
      slot.ammo = Loadout._firstAmmo(inv, gun.caliber);
    if (slot.ammo === "") return 0;
    if (slot.rounds === undefined) slot.rounds = 0;
    const cap = Loadout.composeWeapon(slot).magazine;
    const need = cap - slot.rounds;
    if (need <= 0) return 0;
    const have = Bag.count(inv, slot.ammo);
    const take = need < have ? need : have;
    if (take <= 0) return 0;
    Bag.remove(inv, slot.ammo, take);
    slot.rounds += take;
    return take;
  },

  /** Caliber-gated, then tops up. */
  loadAmmo(entities, id, ammoItemId) {
    const slot = Loadout.weaponSlot(entities, id);
    if (slot === null) return false;
    return Loadout.loadAmmoSlot(entities.require(id, Inventory), slot, ammoItemId);
  },

  /**
   * Caliber-gated, then tops up. Switching type refunds the chambered rounds first; a refund that
   * doesn't fit refuses the swap rather than destroy them.
   */
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
        const unfit = Bag.add(inv, slot.ammo, slot.rounds);
        if (unfit > 0) {
          Bag.remove(inv, slot.ammo, slot.rounds - unfit);
          return false;
        }
      }
      slot.ammo = ammoItemId;
      slot.rounds = 0;
    }
    Loadout.reloadSlot(inv, slot);
    return true;
  },

  _firstAmmo(inv, caliber) {
    for (let i = 0; i < inv.slots.length; i++) {
      const it = Item.get(inv.slots[i].itemId);
      const am = it !== undefined ? it.getComponent(Ammo) : undefined;
      if (am !== undefined && am.caliber === caliber)
        return inv.slots[i].itemId;
    }
    return "";
  },

  /** The maker's signature ops compose like an attachment. */
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
    const base = { damage: wpn.damage, fireCd: wpn.fireCd };
    const c = Loadout._applyOps(
      base,
      Loadout._modLayers(slot),
      ["damage", "fireCd"],
    );
    return {
      kind: "melee",
      damage: c.damage,
      hitbox: wpn.hitbox,
      fireCd: c.fireCd,
    };
  },

  _composeGun(slot, wpn, gun) {
    if (slot.rounds === undefined) slot.rounds = 0;
    if (slot.ammo === undefined) slot.ammo = "";
    const ammoItem = slot.ammo !== "" ? Item.get(slot.ammo) : undefined;
    const ammo =
      ammoItem !== undefined ? ammoItem.getComponent(Ammo) : undefined;

    // fireCd may be undefined, and stays so for the wielder's default.
    const base = {
      mass: ammo !== undefined ? ammo.mass : 0,
      velocity: ammo !== undefined ? ammo.velocity : 0,
      power: ammo !== undefined ? ammo.power : 0,
      penetration: ammo !== undefined ? ammo.penetration : 0,
      fireCd: wpn.fireCd,
      magazine: gun.magazine,
    };
    const layers = Loadout._modLayers(slot);
    layers.unshift(gun.ops);
    const c = Loadout._applyOps(base, layers, [
      "mass",
      "velocity",
      "power",
      "penetration",
      "fireCd",
      "magazine",
    ]);

    const magazine = Math.max(1, Math.round(c.magazine));
    const fireCd =
      c.fireCd !== undefined ? Math.max(0, c.fireCd) : undefined;
    const penetration = Math.max(0, Math.round(c.penetration));
    let power = 0;
    if (ammo !== undefined) {
      const v = c.velocity / Loadout.KIN_REF;
      power = c.power + Loadout.KIN_K * c.mass * v * v;
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

  /**
   * Order-independent per field. A field whose base is undefined stays undefined: ops can't
   * fabricate a value the base never declared.
   */
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

  /** `sign` ±1. Items over a reduced capacity just stay. */
  _applyContainer(entities, id, item, sign) {
    const con = item.getComponent(Container);
    if (con === undefined) return;
    const inv = entities.require(id, Inventory);
    inv.capacity += con.capacity * sign;
    if (inv.capacity < 0) inv.capacity = 0;
  },
};
