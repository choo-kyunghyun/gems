// Item-component: marks a Weapon item as a gun (ammo-driven, magazine-fed) — its presence
// (Item.hasComponent(Gun)) makes composeWeapon take the gun branch. Firing pipeline on the class below.
/**
 * Firing pipeline: loaded Ammo base → this gun-base `ops` layer → each attachment's ops, so a gun-base
 * can pre-bias a round before attachments.
 *   • caliber   — which Ammo chambers (must match Ammo.caliber).
 *   • magazine  — base clip size; attachments scale it via ops.
 *   • ops       — gun-base operators { field: { add?, mul? } } over velocity/mass/power/penetration/
 *                 fireCd/magazine. Default {} = inert.
 * Flat class queried by `instanceof` (composition over inheritance).
 */
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
