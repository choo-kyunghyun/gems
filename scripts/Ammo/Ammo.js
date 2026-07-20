// Item-component: marks a fungible Item as a gun round, carrying the BASE projectile stats the firing
// pipeline operates on (gun-base + attachment ops manipulate these into the final shot; see
// composeWeapon/_applyOps). Consumed from the magazine per shot.
//
// `caliber` gates which guns chamber it. The four base stats:
//   • mass        — heavier hits harder (kinetic power ~ mass * velocity^2) but slower.
//   • velocity    — muzzle speed; drives kinetic power and hitscan REACH. Shots are instant
//                   (Combat.hitscan) — nothing travels, so this is never a speed.
//   • power       — flat base power before the kinetic term.
//   • penetration — lowers target defense at the hit (Combat.mitigate) — AP rounds bite armor.
//
// Flat class queried by `instanceof` (composition over inheritance — GMRT can't super/subclass).
globalThis.Ammo = class Ammo {
  /**
   * @param {Object} d
   * @param {string} [d.caliber]      gun-compatibility category (default "standard")
   * @param {number} [d.mass]         round mass — kinetic power factor (default 4)
   * @param {number} [d.velocity]     muzzle velocity — kinetic power + hitscan reach (default 600)
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
