// Item-component: marks an Item wearable in an Equipment slot, carrying flat stat deltas applied while
// worn. Flat class queried by `instanceof` (composition over inheritance).
globalThis.Equippable = class Equippable {
  /**
   * d: slot ("weapon" | "armor" | "trinket" | "backpack"), mods (flat stat deltas, e.g. { attack,
   * defense, maxHp, speed }), worn (sprite NAME attached to the wearer's doll slot while equipped,
   * "" = the slot stays bare, though a WEAPON then falls back to the item's own icon — see
   * AppearanceSystem; resolved via asset_get_index at rebuild time).
   */
  constructor(d) {
    this.slot = d.slot;
    this.mods = d.mods ?? {};
    this.worn = d.worn ?? "";
  }
};
