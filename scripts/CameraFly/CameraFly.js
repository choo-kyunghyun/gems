/**
 * Free-fly policy for the camera entity (CameraSystem): a 6DOF spectator "noclip" camera (debug).
 * WASD/Space/Shift move, Q/E roll, RMB yaw/pitch, under a perspective projection. Attach it with
 * `entities.mint(camId, CameraFly, CameraSystem.fly(opt))` to take over and detach it to hand
 * back — the pose (Position + Camera's yaw/pitch/roll) is the one shared component, so neither
 * swap jumps the view, and the follow policy eases home from wherever the fly left it.
 * A `Time.raw` policy: CameraSystem.apply runs it from the scene's draw so it keeps flying while
 * the sim is paused, and it overrides the sim-clock policies while attached.
 * @typedef {Object} CameraFly
 * @property {number} speed  world px per second
 * @property {number} sens  BASE radians per mouse pixel, scaled live by Input.sensitivity (the FPS split: engine base × user multiplier)
 * @property {boolean} looking  RMB look in progress (the first held frame only recentres the cursor)
 */
globalThis.CameraFly = "CameraFly";
