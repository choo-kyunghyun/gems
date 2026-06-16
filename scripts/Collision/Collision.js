/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {boolean} [kinematic]  infinite-mass body (walls/platforms): pushes dynamic
 *   bodies but never moves — GravitySystem skips it, SolidSystem resolves against it
 * @property {Set|null} mask  collision mask; null on static colliders (walls)
 * @property {Array<number>} hits
 * @property {boolean} [oneWay]  passable from below; only resolves downward landings
 * @property {number} [passThroughTicks]  ticks remaining to ignore oneWay platforms
 */
globalThis.Collision = "Collision";
