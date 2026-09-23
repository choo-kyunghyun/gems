// Item component: while equipped, grows the wearer's inventory capacity. Pairs with Equippable
// (e.g. a backpack).
globalThis.Container = class Container {
  /** d: capacity, the extra slots granted while equipped. */
  constructor(d) {
    this.capacity = d.capacity ?? 0;
  }
};
