// Item-component: while equipped, expands the wearer's Inventory by extra slots
// (quantity capacity). Read by EquipmentSystem on equip/unequip, which adds/removes
// `capacity` from the owner's Inventory.capacity. A flat, standalone class queried
// by `instanceof` (see Item.getComponent) — no inheritance, which GMRT can't do.
// Pairs with Equippable on the same item (e.g. a backpack: Equippable + Container).
globalThis.Container = class Container {
  /**
   * @param {Object} d
   * @param {number} d.capacity extra Inventory slots granted while equipped
   */
  constructor(d) {
    this.capacity = d.capacity ?? 0;
  }
};
