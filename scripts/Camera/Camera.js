/** @enum {number} Camera projection modes. */
globalThis.CAMERA_PROJECTION = Object.freeze({
  ORTHO: 0,
  PERSPECTIVE: 1,
  PERSPECTIVE_FOV: 2,
});

/**
 * THE view of a level: the entity carrying this (one per store) is the camera, and its
 * `Position` is the look-at point (the ground point the 2.5D framing is centred on). It holds
 * what DECIDES the projection, never the projection: the eye basis, the extent and the matrices
 * are derived from these fields every frame. A policy component beside it moves it; a camera
 * with none stands where it was put. Persistent — a level save carries the view it was left at.
 * @typedef {Object} Camera
 * @property {number} projection  a CAMERA_PROJECTION mode
 * @property {number} pitch  ground tilt in RADIANS: 0 = top-down, >0 the eye lifted out of the ground plane to the south (2.5D); past π/2 the eye looks up (a free-fly pose only)
 * @property {number} yaw  RADIANS about world z: 0 = the eye due south of the look-at, facing north — the fixed-yaw 2.5D camera never leaves it
 * @property {number} roll  RADIANS about the view axis, 0 = level
 * @property {number} dist  eye distance from the look-at (world px); under ortho it only decides what the near plane clips
 * @property {number} zoom  screen px per world px — the view extent is the application surface over it
 * @property {number} znear
 * @property {number} zfar
 * @property {number} fov  vertical degrees, PERSPECTIVE_FOV only
 */
globalThis.Camera = "Camera";
