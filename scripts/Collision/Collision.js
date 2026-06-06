/**
 * @typedef {Object} Collision
 * @property {boolean} solid
 * @property {Set} mask
 * @property {Array<number>} hits
 * @property {boolean} [oneWay] — passable from below; only resolves downward landings
 * @property {number} [passThroughTicks] — ticks remaining to ignore oneWay platforms
 */
globalThis.Collision = "Collision";
