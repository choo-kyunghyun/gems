// Item-component: the attack profile a weapon confers on its wielder. Read by
// RpgController (via EquipmentSystem.weaponProfile) to drive bullet damage, fire
// cadence, and projectile speed; unset fields fall back to the controller's
// unarmed defaults. Flat, standalone class queried by `instanceof`
// (see Item.getComponent) — no inheritance (GMRT can't do it).
//
// A `melee` weapon swings a hitbox `reach` px in the wielder's facing direction
// (MeleeSystem.swing) instead of firing a projectile; one with neither set stays
// ranged. Weapons are RPG-only — the platformer/RTS showcases carry no items.
globalThis.Weapon = class Weapon {
  /**
   * @param {Object} d
   * @param {number} d.damage         bullet/swing damage
   * @param {number} [d.fireCd]       ticks between shots/swings (default: controller's)
   * @param {number} [d.bulletSpeed]  projectile speed (ranged only; default: controller's)
   * @param {boolean} [d.melee]       true → swing a melee hitbox instead of firing
   * @param {number} [d.reach]        melee hitbox length in px (default: controller's)
   */
  constructor(d) {
    this.damage = d.damage ?? 1;
    this.fireCd = d.fireCd;
    this.bulletSpeed = d.bulletSpeed;
    this.melee = d.melee ?? false;
    this.reach = d.reach;
  }
};
