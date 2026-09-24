/**
 * @typedef {Object} BBox
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */
globalThis.BBox = "BBox";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[BBox] = { x: 0, y: 0 };
