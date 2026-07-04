// Item-component: the universal weapon profile that fully drives the action — the player brain runs
// whatever it describes (no built-in attack). Unarmed falls back to PlayerSystem's fist profile so an
// empty-handed player never fires a free bullet. Flat class queried by `instanceof` (composition over
// inheritance — GMRT can't super/subclass).
//
// Melee vs gun is decided by a sibling Gun component (Item.hasComponent(Gun) → ammo-driven ranged),
// NOT a flag here; melee uses damage/reach. fireCd (cadence) is shared by both.
//
// `slots` = named, typed attachment slots: `accepts` is the category that fits (a WeaponMod's `slot`)
// or "*" for any. An instance maps slotId → modItemId on its Inventory slot's `mods`.
// `damage` is the base melee swing — controller adds wielder's Stats.attack.
globalThis.Weapon = class Weapon {
  /**
   * @param {Object} d
   * @param {{id:string,accepts:string}[]} [d.slots]  named typed attachment slots (default [])
   * @param {number} [d.fireCd]   ticks between shots/swings (default: controller's)
   * @param {number} [d.damage]   base melee swing damage (+ wielder's Stats.attack; default 1)
   * @param {number} [d.reach]    melee hitbox length px (melee only; default: controller's)
   */
  constructor(d = {}) {
    this.slots = d.slots ?? [];
    this.fireCd = d.fireCd;
    this.damage = d.damage ?? 1;
    this.reach = d.reach;
  }
};
