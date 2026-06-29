// Item-component: marks an Item wearable in an Equipment slot, carrying flat stat deltas applied while
// worn. Flat class queried by `instanceof` (composition over inheritance — GMRT can't super/subclass).
globalThis.Equippable = class Equippable {
  /**
   * @param {Object} d
   * @param {string} d.slot   "weapon" | "armor" | "trinket" | "backpack"
   * @param {Object} [d.mods] flat stat deltas, e.g. { attack, defense, maxHp, speed }
   */
  constructor(d) {
    this.slot = d.slot;
    this.mods = d.mods ?? {};
  }
};
