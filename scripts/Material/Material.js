// Item-component: marks an Item a buildable material, carrying the tint a structure built from it is
// drawn with ("one neutral sprite, tinted per material" — N+M sprites instead of N×M). A built entity
// resolves Material.color → Visual.color. Flat class queried by `instanceof` (composition over
// inheritance). Color-only for now; no speculative fields.
globalThis.Material = class Material {
  /**
   * @param {Object} d
   * @param {number|string} [d.color] tint — colour int or "#rrggbb" hex. Default white (no tint).
   */
  constructor(d) {
    this.color =
      typeof d.color === "string"
        ? Color.parse(d.color)
        : (d.color ?? c_white);
  }
};
