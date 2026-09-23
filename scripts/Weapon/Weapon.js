/**
 * Item component: the weapon profile that drives an attack.
 *
 * Unarmed falls back to a fist profile so an empty-handed player never fires a free bullet.
 * Melee vs gun is decided by a sibling Gun component (ammo-driven ranged), NOT a flag here; melee uses damage/hitbox, and fireCd (cadence) is shared by both. `slots` =
 * named, typed attachment slots: `accepts` is the category that fits (a WeaponMod's `slot`) or "*" for
 * any; an instance maps slotId → modItemId on its Inventory slot's `mods`. `damage` is the base melee
 * swing — the controller adds the wielder's Stats.attack.
 */
globalThis.Weapon = class Weapon {
  /**
   * d: slots ({id,accepts}[]), fireCd (seconds between shots/swings; undefined = the default
   * cadence), damage, hitbox (a MeleeHitbox; melee only).
   */
  constructor(d = {}) {
    this.slots = d.slots ?? [];
    this.fireCd = d.fireCd;
    this.damage = d.damage ?? 1;
    this.hitbox = d.hitbox;
  }
};
