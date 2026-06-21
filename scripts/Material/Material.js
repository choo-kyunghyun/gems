// Item-component: marks an Item as a buildable MATERIAL ("stuff"), carrying the
// render tint a structure/floor/furniture built from it is drawn with — the
// RimWorld-style "one neutral sprite, tinted per material" path the overworld
// terrain already uses (TerrainStream tints spr_tiledual per material). A built
// entity resolves its tint via Item.get(mat).getComponent(Material).color and
// sets Visual.color, so N materials × M structures needs N colors + M sprites,
// not N×M sprites. A flat, standalone class queried by `instanceof` (see
// Item.getComponent) — no inheritance, which GMRT can't do.
//
// Color-only by design for now; add hardness/value/beauty-style fields the day a
// system reads them (no speculative fields).
globalThis.Material = class Material {
  /**
   * @param {Object} d
   * @param {number|string} [d.color] tint for things built from this material —
   *   a GameMaker colour int, or "#rrggbb" hex (parsed once). Default white (no tint).
   */
  constructor(d) {
    this.color =
      typeof d.color === "string"
        ? Color.parse(d.color)
        : (d.color ?? c_white);
  }
};
