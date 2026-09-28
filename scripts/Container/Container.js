// Item component: while equipped, grows the wearer's inventory maxWeight. Pairs with Equippable
// (e.g. a backpack).
globalThis.Container = class Container {
  /** d: bonusWeight, the extra maxWeight granted while equipped. */
  constructor(d) {
    this.bonusWeight = d.bonusWeight ?? 0;
  }
};
