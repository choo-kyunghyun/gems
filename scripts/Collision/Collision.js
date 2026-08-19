/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {boolean} [kinematic]  infinite-mass body (walls/props): pushes dynamic
 *   bodies but never moves — SolidSystem resolves against it, never integrates it
 */
globalThis.Collision = "Collision";
