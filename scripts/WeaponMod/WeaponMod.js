// Item-component: marks a fungible Item as an installable weapon attachment. Flat class queried by
// `instanceof` (composition over inheritance). Fold points + schema on the class below.
/**
 * Installing consumes one unit and records its itemId in the weapon instance's `mods` map under the
 * slot id. Two fold points:
 *   • composeWeapon applies `ops` as operators over the composed fields (gun: velocity/mass/power/
 *     penetration/fireCd/magazine; melee: damage/reach/fireCd).
 *   • StatModel._foldInstanceMods adds `stat` onto the wearer's derived sheet.
 * `slot` is the category it fits (matched vs a weapon slot's `accepts`, or "*"). `ops` =
 * { field: { add?, mul? } }: final = (base + Σadd) * Πmul per field. `stat` is a plain additive delta.
 * The consumed item IS the definition (no parallel registry) — resolved via
 * Item.get(modItemId).getComponent(WeaponMod).
 */
globalThis.WeaponMod = class WeaponMod {
  /** @param {Object} d slot, ops, stat (documented on the class contract above) */
  constructor(d = {}) {
    this.slot = d.slot ?? "*";
    this.ops = d.ops ?? {};
    this.stat = d.stat ?? {};
  }
};
