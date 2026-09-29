/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {boolean} kinematic   infinite-mass body (walls/props): pushes dynamic
 *   bodies but is never moved itself
 * @property {boolean} pushable    false: a dynamic body that moves only by its own Velocity —
 *   never shoved apart from a crowd, so a body it overlaps takes the whole push
 */
globalThis.Collision = "Collision";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Collision] = { solid: true, kinematic: false, pushable: true };
