// Item-component: marks a fungible Item as an installable weapon attachment. Installing consumes one
// unit and records its itemId in the weapon instance's `mods` map under the slot id. Two fold points:
//   • composeWeapon applies `ops` as operators over the composed fields (gun: velocity/mass/power/
//     penetration/fireCd/magazine; melee: damage/reach/fireCd).
//   • StatModel._foldInstanceMods adds `stat` onto the wearer's derived sheet.
//
// `slot` is the category it fits (matched vs a weapon slot's `accepts`, or "*"). `ops` =
// { field: { add?, mul? } }: final = (base + Σadd) * Πmul per field. `stat` is a plain additive delta.
//
// The consumed item IS the definition (no parallel registry) — resolved via
// Item.get(modItemId).getComponent(WeaponMod). Flat class queried by `instanceof` (composition over
// inheritance — GMRT can't super/subclass).
globalThis.WeaponMod = class WeaponMod {
  /**
   * @param {Object} d
   * @param {string} [d.slot]  slot category this fits (matched vs a weapon slot's `accepts`; default "*")
   * @param {Object} [d.ops]   per-field operators { field: { add?, mul? } } over the composed profile
   * @param {Object} [d.stat]  derived-Stats deltas, e.g. { attack, defense, maxHp, speed } (additive)
   */
  constructor(d = {}) {
    this.slot = d.slot ?? "*";
    this.ops = d.ops ?? {};
    this.stat = d.stat ?? {};
  }
};
