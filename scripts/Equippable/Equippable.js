// Item component: marks an Item wearable in an equipment slot, carrying flat stat deltas applied
// while worn.
globalThis.Equippable = class Equippable {
  /**
   * d: slot ("weapon" | "armor" | "trinket" | "backpack"), mods (flat stat deltas), worn (what the
   * wearer's doll shows: a sprite dresses the slot's default doll slot, an object maps doll slot
   * -> sprite with `null` leaving a slot bare), seal (0..1, the share of open-sky exposure the
   * wearer is spared).
   */
  constructor(d) {
    this.slot = d.slot;
    this.mods = d.mods ?? {};
    this.worn = d.worn;
    this.seal = d.seal ?? 0;
  }
};
