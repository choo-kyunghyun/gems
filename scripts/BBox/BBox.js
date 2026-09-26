/**
 * An axis-aligned box in world px, anchored off the entity's Position.
 * @typedef {Object} BBox
 * @property {number} x       the left edge off Position.x
 * @property {number} y       the top edge off Position.y
 * @property {number} width
 * @property {number} height
 */
globalThis.BBox = "BBox";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[BBox] = { x: 0, y: 0 };
