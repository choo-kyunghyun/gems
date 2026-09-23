/**
 * Item component marking an item as a weapon attachment.
 *
 * Installing consumes one unit and records its itemId in the weapon instance's `mods` map under the
 * slot id. `slot` is the category it fits (matched vs a weapon slot's `accepts`, or "*"). `ops` =
 * { field: { add?, mul? } } over the composed weapon fields: final = (base + Σadd) * Πmul per
 * field. `stat` is a plain additive delta onto the wearer's derived sheet. The consumed item IS
 * the definition — no parallel registry.
 */
globalThis.WeaponMod = class WeaponMod {
  constructor(d = {}) {
    this.slot = d.slot ?? "*";
    this.ops = d.ops ?? {};
    this.stat = d.stat ?? {};
  }
};
