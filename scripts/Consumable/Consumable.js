// Item-component: marks an Item usable from the bag (one unit consumed for an instant effect).
// Flat class queried by `instanceof` (composition over inheritance).
globalThis.Consumable = class Consumable {
  /**
   * d fields: heal (HP restored, clamped to max-HP), attr (permanent attribute key to raise, e.g.
   * "pow" — generic, applied via the injected Consumption.grantAttr hook in Game), amount (how
   * much `attr` grows per use), status (Status def id to apply, e.g. "regen"; def + effects are Game
   * content; "" = none), statusDuration (override seconds; 0 = the def's duration), needs (survival:
   * the needs a use lowers, keyed by need token → amount, e.g. `{ [Thirst]: 45 }` — a drink/food),
   * yields (item id left behind after use, e.g. an empty can; "" = none).
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
