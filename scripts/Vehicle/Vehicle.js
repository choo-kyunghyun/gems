/**
 * A carrier its driver steers. The driver writes the frame's steer, and the vehicle's Velocity
 * closes on it at `accel`, so with nobody steering it coasts to a stop.
 *
 * @typedef {Object} Vehicle
 * @property {number} speed   px/s at full steer
 * @property {number} accel   px/s²
 * @property {number} steerX  this frame's steer, a vector of length ≤ 1; taken each frame
 * @property {number} steerY
 */
globalThis.Vehicle = "Vehicle";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Vehicle] = { speed: 0, accel: 0, steerX: 0, steerY: 0 };
