/**
 * @typedef {Object} Position
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */
globalThis.Position = "Position";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Position] = { x: 0, y: 0, z: 0 };
