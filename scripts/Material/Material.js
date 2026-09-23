/**
 * Item component marking an item as a buildable material; a built entity takes its color.
 */
globalThis.Material = class Material {
  /** d: color, a colour int or "#rrggbb" hex. */
  constructor(d) {
    this.color =
      typeof d.color === "string" ? Color.parse(d.color) : (d.color ?? c_white);
  }
};
