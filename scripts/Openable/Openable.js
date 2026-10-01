// Item component: opened from the bag into a roll of its loot table, one unit spent per opening.
globalThis.Openable = class Openable {
  /** d: table, the id of the loot table it rolls. */
  constructor(d) {
    this.table = d.table;
  }
};
