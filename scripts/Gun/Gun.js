// Item-component: marks a Weapon item as a GUN — an ammo-driven, magazine-fed ranged weapon. Its
// PRESENCE (Item.hasComponent(Gun)) is what makes EquipmentSystem.composeWeapon take the gun branch
// instead of the melee one; the universal Weapon component still carries the named attachment `slots`
// + cadence (fireCd) shared by all weapons.
//
// A gun fires the loaded Ammo's BASE stats run through the operator pipeline: the ammo base, then this
// gun-base `ops` layer, then each installed attachment's ops (EquipmentSystem._applyOps). So a gun-base
// can pre-bias a round (a long rifle boosting velocity, a heavy frame adding mass) before attachments.
//   • caliber   — which Ammo chambers here (must match Ammo.caliber); only matching ammo loads.
//   • magazine  — base clip size (rounds held); attachments (an extended mag) scale it via ops.
//   • ops       — gun-base operator layer { field: { add?, mul? } } over the projectile/handling fields
//                 (velocity / mass / power / penetration / fireCd / magazine). Default {} = inert.
//
// A flat, standalone class queried by `instanceof` (Item.getComponent) — no inheritance (GMRT can't).
globalThis.Gun = class Gun {
  /**
   * @param {Object} d
   * @param {string} [d.caliber]   accepted Ammo caliber (default "standard")
   * @param {number} [d.magazine]  base clip size (default 6)
   * @param {Object} [d.ops]       gun-base operators over the composed fields (default {} = inert)
   */
  constructor(d = {}) {
    this.caliber = d.caliber ?? "standard";
    this.magazine = d.magazine ?? 6;
    this.ops = d.ops ?? {};
  }
};
