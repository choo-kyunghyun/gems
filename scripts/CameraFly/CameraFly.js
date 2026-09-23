/**
 * Free-fly policy for the camera entity: a 6DOF spectator "noclip" camera (debug), under a
 * perspective projection. Mint it to take over and detach it to hand back — the pose (Position +
 * Camera's yaw/pitch/roll) is the one shared component, so neither swap jumps the view.
 * A `Time.raw` policy: it keeps flying while the sim is paused, and it overrides the sim-clock
 * policies while attached.
 * @typedef {Object} CameraFly
 * @property {number} speed  world px per second
 * @property {number} sens  BASE radians per mouse pixel, scaled live by the user's sensitivity
 * @property {boolean} looking  RMB look in progress (the first held frame only recentres the cursor)
 */
globalThis.CameraFly = "CameraFly";
