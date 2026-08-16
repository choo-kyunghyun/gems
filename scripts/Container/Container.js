// Item-component: while equipped, grows the wearer's Inventory.capacity (EquipmentSystem adds/removes
// on equip/unequip). Pairs with Equippable (e.g. a backpack). Flat class queried by `instanceof`.
globalThis.Container = class Container {
  /** d: capacity — extra Inventory slots granted while equipped. */
  constructor(d) {
    this.capacity = d.capacity ?? 0;
  }
};
