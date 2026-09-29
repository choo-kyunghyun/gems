/**
 * Rides a seat of a carrier's Mount. `solid` and `visible` keep what a hidden seat overrode, so
 * stepping off restores them.
 *
 * @typedef {Object} Rider
 * @property {number} carrier  the carrier's id, validated before every use
 * @property {number} seat     index into the carrier's `Mount.seats`
 * @property {boolean} solid   the rider's own `Collision.solid`
 * @property {boolean} visible the rider's own `Sprite.visible`
 */
globalThis.Rider = "Rider";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Rider] = { carrier: -1, seat: 0, solid: true, visible: true };
