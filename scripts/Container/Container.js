// Item-component: while equipped, grows the wearer's Inventory.capacity (EquipmentSystem adds/removes
// it on equip/unequip). Pairs with Equippable (e.g. a backpack). Flat class queried by `instanceof`
// (composition over inheritance — GMRT can't super/subclass).
globalThis.Container = class Container {
  /**
   * @param {Object} d
   * @param {number} d.capacity extra Inventory slots granted while equipped
   */
  constructor(d) {
    this.capacity = d.capacity ?? 0;
  }
};
