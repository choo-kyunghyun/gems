/**
 * Item component marking an item as a buildable material.
 *
 * A built entity resolves Material.color → Visual.color. Color-only for now; no speculative fields.
 */
globalThis.Material = class Material {
  /** d: color — colour int or "#rrggbb" hex (default white, no tint). */
  constructor(d) {
    this.color =
      typeof d.color === "string" ? Color.parse(d.color) : (d.color ?? c_white);
  }
};
