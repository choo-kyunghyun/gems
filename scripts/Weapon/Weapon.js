// Item-component: the UNIVERSAL weapon profile — what makes an item a weapon, its named attachment
// slots, and its melee attack numbers. It is read (via EquipmentSystem.weaponProfile/composeWeapon)
// and the controller runs whatever it describes; the controller hardcodes no built-in attack. With no
// weapon equipped it falls back to a weak melee "fist" profile (RpgController's ctrl.fist), so being
// unarmed never fires a free bullet. Flat, standalone class queried by `instanceof` (see
// Item.getComponent) — no inheritance (GMRT can't do it).
//
// MELEE vs GUN is decided by a sibling component, NOT a flag here: an item that ALSO carries a `Gun`
// component (Item.hasComponent(Gun)) is ammo-driven ranged (composeWeapon takes the gun branch +
// reads the loaded Ammo); otherwise it's melee and uses `damage`/`reach` below. `fireCd` (cadence) is
// shared by both kinds.
//
// `slots` is the UNIFIED named, typed attachment-slot list (replaces the old count-based `sockets`):
// each `{ id, accepts }` is a slot the base predefines — `accepts` is the attachment category that
// fits it (a WeaponMod's `slot`), or "*" for a generic any-attachment slot. An instance records which
// attachment is in which slot as a map `{ [slotId]: modItemId }` on its Inventory slot's `mods`.
// `damage` is the BASE melee swing — the controller adds the wielder's Stats.attack on top. Weapons
// are RPG-only — the platformer/RTS showcases carry no items.
globalThis.Weapon = class Weapon {
  /**
   * @param {Object} d
   * @param {{id:string,accepts:string}[]} [d.slots]  named typed attachment slots (default [])
   * @param {number} [d.fireCd]   ticks between shots/swings (default: controller's)
   * @param {number} [d.damage]   base MELEE swing damage (wielder's Stats.attack adds on top; default 1)
   * @param {number} [d.reach]    melee hitbox length in px (melee only; default: controller's)
   */
  constructor(d = {}) {
    this.slots = d.slots ?? [];
    this.fireCd = d.fireCd;
    this.damage = d.damage ?? 1;
    this.reach = d.reach;
  }
};
