/**
 * Item component marking a fungible item as a gun round.
 *
 * Gun-base + attachment ops manipulate these into the final shot (see composeWeapon/_applyOps).
 * Consumed from the magazine per shot. `caliber` gates which guns chamber it. The four base stats:
 *   • mass        — heavier hits harder (kinetic power ~ mass * velocity^2) but slower.
 *   • velocity    — muzzle speed; drives kinetic power and hitscan REACH. Shots are instant
 *                   (Combat.hitscan) — nothing travels, so this is never a speed.
 *   • power       — flat base power before the kinetic term.
 *   • penetration — lowers target defense at the hit (Combat.mitigate) — AP rounds bite armor.
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
