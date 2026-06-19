// Item-component: marks a (fungible) Item as a gun ROUND and carries the BASE projectile stats a
// gun fires when this ammo is loaded. Ammo is the base of the firing pipeline — the gun-base and its
// installed attachments are OPERATORS (+ - * /) that manipulate these numbers into the final shot
// (see EquipmentSystem.composeWeapon / _applyOps). A round is consumed from the magazine per shot
// (EquipmentSystem.reload tops the magazine up from the bag).
//
// `caliber` gates which guns can chamber it: a Gun declares its caliber, and only matching Ammo loads.
// The four base stats:
//   • mass        — heavier rounds hit harder (kinetic power ~ mass * velocity^2) but are slower.
//   • velocity    — the muzzle speed; drives BOTH the bullet's travel speed AND the kinetic power.
//   • power       — flat base power added before the kinetic term (a round's intrinsic punch).
//   • penetration — reduces the target's effective defense at the hit (Combat.mitigate), so AP rounds
//                   bite armor.
//
// A flat, standalone class queried by `instanceof` (Item.getComponent) — no inheritance (GMRT can't).
globalThis.Ammo = class Ammo {
  /**
   * @param {Object} d
   * @param {string} [d.caliber]      gun-compatibility category (default "standard")
   * @param {number} [d.mass]         round mass — kinetic power factor (default 4)
   * @param {number} [d.velocity]     muzzle velocity — travel speed + kinetic power (default 600)
   * @param {number} [d.power]        flat base power before the kinetic term (default 1)
   * @param {number} [d.penetration]  armor penetration — lowers target defense at the hit (default 0)
   */
  constructor(d = {}) {
    this.caliber = d.caliber ?? "standard";
    this.mass = d.mass ?? 4;
    this.velocity = d.velocity ?? 600;
    this.power = d.power ?? 1;
    this.penetration = d.penetration ?? 0;
  }
};
