// Item-component: marks an Item as an installable WEAPON ATTACHMENT (scope / barrel / magazine / grip /
// muzzle / edge / pommel / ...) and carries what it confers once fitted into a weapon instance's
// matching named slot. An attachment is a normal (fungible) Item carrying this component; installing it
// consumes one unit and records its itemId in the target weapon instance's `mods` map under the slot id
// (see InventorySlot + WeaponModUI). The two fold points:
//   • EquipmentSystem.composeWeapon applies `ops` as OPERATORS over the composed projectile/melee fields
//     (velocity / mass / power / penetration / fireCd / magazine, or melee damage / reach / fireCd).
//   • StatModel._foldInstanceMods adds `stat` (attack/defense/...) onto the wearer's derived sheet.
//
// `slot` is the slot CATEGORY this attachment fits — it installs only into a weapon slot whose `accepts`
// matches it (or an "*" generic slot). `ops` is `{ field: { add?, mul? } }`: composition does
// `final = (base + sum add) * prod mul` per field, so add/sub (negative add) and mul/div (mul<1) all
// compose. `stat` stays a PLAIN additive delta (like Equippable.mods).
//
// Attachments are items (not a parallel registry): the consumed item IS the definition, so
// composeWeapon/StatModel resolve a modItemId via Item.get(modItemId).getComponent(WeaponMod).
// A flat, standalone class queried by `instanceof` (Item.getComponent) — no inheritance (GMRT can't).
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
