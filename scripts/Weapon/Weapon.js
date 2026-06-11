// Item-component: the attack profile a weapon confers on its wielder. Read by
// TopDownController._fire (via EquipmentSystem.weaponProfile) to drive bullet
// damage, fire cadence, and projectile speed; unset fields fall back to the
// controller's unarmed defaults. Flat, standalone class queried by `instanceof`
// (see Item.getComponent) — no inheritance (GMRT can't do it).
globalThis.Weapon = class Weapon {
  /**
   * @param {Object} d
   * @param {number} d.damage         bullet damage
   * @param {number} [d.fireCd]       ticks between shots (default: controller's)
   * @param {number} [d.bulletSpeed]  projectile speed (default: controller's)
   */
  constructor(d) {
    this.damage = d.damage ?? 1;
    this.fireCd = d.fireCd;
    this.bulletSpeed = d.bulletSpeed;
  }
};
