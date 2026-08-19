/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {boolean} [kinematic]  infinite-mass body (walls/props): pushes dynamic
 *   bodies but never moves — SolidSystem resolves against it, never integrates it
 * @property {Set|null} mask  collision mask; null on static colliders (walls)
 * @property {Array<number>} hits
 */
globalThis.Collision = "Collision";
