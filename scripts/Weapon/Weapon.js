// Item-component: the attack profile a weapon confers on its wielder, and the SOLE driver of
// the action — RpgController reads it (via EquipmentSystem.weaponProfile) and runs whatever it
// describes; the controller hardcodes no built-in attack. With no weapon equipped it falls back
// to a weak melee "fist" profile (RpgController's ctrl.fist), so being unarmed never fires a free
// bullet. Flat, standalone class queried by `instanceof` (see Item.getComponent) — no inheritance
// (GMRT can't do it).
//
// A `melee` weapon swings a hitbox `reach` px in the wielder's facing direction (MeleeSystem.swing)
// instead of firing a projectile; one with neither set stays ranged. `damage` is the BASE — the
// controller adds the wielder's Stats.attack (level-ups + equipment mods) on top. Unset fireCd/
// bulletSpeed/reach fall back to the controller's defaults. Weapons are RPG-only — the
// platformer/RTS showcases carry no items.
globalThis.Weapon = class Weapon {
  /**
   * @param {Object} d
   * @param {number} d.damage         base bullet/swing damage (the wielder's Stats.attack adds on top)
   * @param {number} [d.fireCd]       ticks between shots/swings (default: controller's)
   * @param {number} [d.bulletSpeed]  projectile speed (ranged only; default: controller's)
   * @param {boolean} [d.melee]       true → swing a melee hitbox instead of firing
   * @param {number} [d.reach]        melee hitbox length in px (default: controller's)
   * @param {number} [d.sockets]      installable weapon-mod slots (0 = unmoddable; default 0).
   *                                  A weapon whose mods target fireCd/bulletSpeed/reach should
   *                                  declare those fields explicitly so the deltas have a base
   *                                  (EquipmentSystem.composeWeapon only deltas declared fields).
   */
  constructor(d) {
    this.damage = d.damage ?? 1;
    this.fireCd = d.fireCd;
    this.bulletSpeed = d.bulletSpeed;
    this.melee = d.melee ?? false;
    this.reach = d.reach;
    this.sockets = d.sockets ?? 0;
  }
};
