// Item-component: marks an Item a buildable material, carrying the tint a built structure is drawn with
// ("one neutral sprite, tinted per material" — N+M sprites, not N×M). Flat class queried by `instanceof`.
/**
 * A built entity resolves Material.color → Visual.color. Color-only for now; no speculative fields.
 */
globalThis.Material = class Material {
  /** d: color — colour int or "#rrggbb" hex (default white, no tint). */
  constructor(d) {
    this.color =
      typeof d.color === "string" ? Color.parse(d.color) : (d.color ?? c_white);
  }
};
