/**
 * Item component marking a weapon as a gun.
 *
 * The loaded round's stats pass through this gun's `ops` layer before each attachment's, so a gun
 * can pre-bias a round.
 *   • caliber   — which ammo chambers.
 *   • magazine  — base clip size.
 *   • ops       — operators { field: { add?, mul? } }; {} is inert.
 */
globalThis.Gun = class Gun {
  constructor(d = {}) {
    this.caliber = d.caliber ?? "standard";
    this.magazine = d.magazine ?? 6;
    this.ops = d.ops ?? {};
  }
};
