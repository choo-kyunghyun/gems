/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {boolean} kinematic   infinite-mass body (walls/props): pushes dynamic
 *   bodies but is never moved itself
 */
globalThis.Collision = "Collision";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Collision] = { solid: true, kinematic: false };
