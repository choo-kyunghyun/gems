/**
 * Item component marking a fungible item as a gun round, the base a weapon's ops compose the shot
 * from. `caliber` gates which guns chamber it. The four base stats:
 *   • mass        — heavier hits harder (kinetic power ~ mass * velocity^2).
 *   • velocity    — muzzle speed; drives kinetic power and reach. Shots are instant, so this is
 *                   never a travel speed.
 *   • power       — flat base power before the kinetic term.
 *   • penetration — lowers target defense at the hit.
 */
globalThis.Ammo = class Ammo {
  constructor(d = {}) {
    this.caliber = d.caliber ?? "standard";
    this.mass = d.mass ?? 4;
    this.velocity = d.velocity ?? 600;
    this.power = d.power ?? 1;
    this.penetration = d.penetration ?? 0;
  }
};
