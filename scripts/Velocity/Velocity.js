/**
 * @typedef {Object} Velocity
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */
globalThis.Velocity = "Velocity";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Velocity] = { x: 0, y: 0, z: 0 };
