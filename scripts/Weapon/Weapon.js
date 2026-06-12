// Item-component: the attack profile a weapon confers on its wielder. Read by
// TopDownController._fire (via EquipmentSystem.weaponProfile) to drive bullet
// damage, fire cadence, and projectile speed; unset fields fall back to the
// controller's unarmed defaults. Flat, standalone class queried by `instanceof`
// (see Item.getComponent) — no inheritance (GMRT can't do it).
//
// `melee`/`reach` are read by the platformer: a melee weapon swings a hitbox of
// width `reach` px in the wielder's facing direction (MeleeSystem.swing) instead
// of firing a projectile. Top-down weapons set neither → they stay ranged.
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
