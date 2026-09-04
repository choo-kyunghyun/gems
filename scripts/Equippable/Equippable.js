// Item-component: marks an Item wearable in an Equipment slot, carrying flat stat deltas applied while
// worn. Flat class queried by `instanceof` (composition over inheritance).
globalThis.Equippable = class Equippable {
  /**
   * d: slot ("weapon" | "armor" | "trinket" | "backpack"), mods (flat stat deltas, e.g. { attack,
   * defense, maxHp, speed }), worn (what the wearer's doll shows while this is equipped — a sprite
   * NAME dresses the gear slot's default doll slot (AppearanceSystem.SLOT), an OBJECT claims doll
   * slots itself, spine slot -> sprite name with `null` occupying a slot bare (a one-piece:
   * { shirt: "...", pants: null }); "" claims nothing, though a WEAPON then falls back to the
   * item's own icon — see AppearanceSystem; names resolve via asset_get_index at rebuild time),
   * seal (0..1 — the share of the open sky's exposure the wearer is spared while it is worn;
   * ExposureSystem takes the best worn).
   */
  constructor(d) {
    this.slot = d.slot;
    this.mods = d.mods ?? {};
    this.worn = d.worn ?? "";
    this.seal = d.seal ?? 0;
  }
};
