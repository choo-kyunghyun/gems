// Item component: usable from the bag, one unit consumed for an instant effect.
globalThis.Consumable = class Consumable {
  /**
   * d fields: heal (HP, clamped to max), attr (permanent attribute key to raise), amount (how much
   * `attr` grows per use), status (status id to apply; "" = none), statusDuration (seconds; 0 = the
   * def's), needs (need token → amount a use lowers), yields (item id left behind; "" = none).
   */
  constructor(d) {
    this.heal = d.heal ?? 0;
    this.attr = d.attr ?? "";
    this.amount = d.amount ?? 1;
    this.status = d.status ?? "";
    this.statusDuration = d.statusDuration ?? 0;
    this.needs = d.needs ?? {};
    this.yields = d.yields ?? "";
  }
};
