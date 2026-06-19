// Item-component: marks an Item as an installable WEAPON MOD and carries the deltas it confers
// once socketed into a weapon instance. A mod is a normal (fungible) Item carrying this component;
// installing it consumes one unit and records its itemId in the target weapon instance's slot
// `mods` array (see InventorySlot). The deltas are read live at the two fold points:
//   • EquipmentSystem.weaponProfile adds `weapon` (damage/fireCd/bulletSpeed/reach) onto the
//     composed attack profile.
//   • StatModel._foldEquipment adds `stat` (attack/defense/...) onto the wearer's derived sheet.
// Both are PLAIN additive deltas, exactly like Equippable.mods — so a mod composes with the base
// weapon and with every other installed mod by summation.
//
// Mods are items (not a parallel registry): the consumed stone IS the definition, so weaponProfile/
// StatModel resolve a modItemId via Item.get(modItemId).getComponent(WeaponMod) — no second lifetime.
// A flat, standalone class queried by `instanceof` (Item.getComponent) — no inheritance (GMRT can't).
globalThis.WeaponMod = class WeaponMod {
  /**
   * @param {Object} d
   * @param {Object} [d.weapon] weapon-profile deltas, e.g. { damage, fireCd, bulletSpeed, reach }
   * @param {Object} [d.stat]   derived-Stats deltas, e.g. { attack, defense, maxHp, speed }
   */
  constructor(d) {
    this.weapon = d.weapon ?? {};
    this.stat = d.stat ?? {};
  }
};
