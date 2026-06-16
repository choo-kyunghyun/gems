// Shared follow step (assigned as Camera.onUpdate, so `this` is the camera). Tracks the
// application_surface size so a resolution change rebuilds the view extent immediately —
// the project drives the view by matrix, not GM's 2D view-size camera. followSnap rounds to
// whole pixels for the 2D ortho variant.
/** @this {any} - a Camera augmented with the follow fields set in _cameraFollowBuild. */
function _cameraFollowOnUpdate() {
  this.setSize(
    surface_get_width(application_surface),
    surface_get_height(application_surface),
  );
  if (this.world === undefined) return;
  const pos = this.world.get(Position, this.followTarget);
  if (pos === undefined) return;

  let x = lerp(this.toX, pos.x, this.followLerp);
  let y = lerp(this.toY, pos.y, this.followLerp);
  if (this.followSnap) {
    x = Math.round(x);
    y = Math.round(y);
  }

  this.setFrom(x, y, this.followHeight);
  this.setTo(x, y, 0);
}

/**
 * Build a follow camera over the shared onUpdate; projection/snap/defaultHeight are the only
 * differences between the 3D and 2D variants.
 * @param {any} cam - Camera config bag (see cameraFollow/cameraFollow2d).
 * @param {number} projection - A CAMERA_PROJECTION value.
 * @param {boolean} snap - Pixel-snap the followed position (2D ortho).
 * @param {number} defaultHeight - followHeight fallback.
 * @returns {Camera}
 */
function _cameraFollowBuild(cam, projection, snap, defaultHeight) {
  cam.onUpdate = _cameraFollowOnUpdate;
  cam.projection = projection;

  const camera = /** @type {any} */ (new Camera(cam));
  camera.world = cam.world;
  camera.followTarget = cam.followTarget ?? -1;
  camera.followLerp = cam.followLerp ?? 0.1;
  camera.followHeight = cam.followHeight ?? defaultHeight;
  camera.followSnap = snap;
  return camera;
}

/**
 * 3D perspective-FOV follow camera that eases toward followTarget's Position each update.
 * Currently unused — scenes use the 2D cameraFollow2d; kept as the 3D library variant.
 * @param {object} [cam]
 * @param {World} [cam.world] - World holding the target's Position.
 * @param {number} [cam.followTarget=-1] - Entity id to follow.
 * @param {number} [cam.followLerp=0.1] - Per-update easing factor toward the target.
 * @param {number} [cam.followHeight=256] - Camera Z above the target.
 * @returns {Camera}
 */
globalThis.cameraFollow = function cameraFollow(cam = {}) {
  return _cameraFollowBuild(cam, CAMERA_PROJECTION.PERSPECTIVE_FOV, false, 256);
};

/**
 * 2D orthographic follow camera (pixel-snapped) that eases toward followTarget's Position.
 * @param {object} [cam]
 * @param {World} [cam.world] - World holding the target's Position.
 * @param {number} [cam.followTarget=-1] - Entity id to follow.
 * @param {number} [cam.followLerp=0.1] - Per-update easing factor toward the target.
 * @param {number} [cam.followHeight=-100] - Camera Z (ortho eye offset).
 * @returns {Camera}
 */
globalThis.cameraFollow2d = function cameraFollow2d(cam = {}) {
  return _cameraFollowBuild(cam, CAMERA_PROJECTION.ORTHO, true, -100);
};
