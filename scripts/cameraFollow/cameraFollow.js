// Shared follow step (assigned as Camera.onUpdate, so `this` is the camera). Tracks the
// application_surface size so a resolution change rebuilds the view extent immediately —
// the project drives the view by matrix, not GM's 2D view-size camera. followSnap rounds to
// whole pixels for the 2D ortho variant. The wheel zooms by shrinking/growing the view extent
// (the camera always re-centers on the target, so no cursor-anchored math like cameraPan);
// the reset button returns zoom to the configured default. Wheel/reset set followZoomTarget;
// followZoom eases toward it each frame (same lerp pattern as the position follow above).
/** @this {any} - a Camera augmented with the follow fields set in _cameraFollowBuild. */
function _cameraFollowOnUpdate() {
  // Read each realtime mouse query once per frame (GMRT samples them live — see GMRT-Safe Idioms).
  if (mouse_wheel_up()) {
    this.followZoomTarget = Math.min(
      this.followMaxZoom,
      this.followZoomTarget * (1 + this.followZoomStep),
    );
  }
  if (mouse_wheel_down()) {
    this.followZoomTarget = Math.max(
      this.followMinZoom,
      this.followZoomTarget * (1 - this.followZoomStep),
    );
  }
  if (mouse_check_button_pressed(this.followZoomButton)) {
    this.followZoomTarget = this.followZoomDefault;
  }
  this.followZoom = lerp(this.followZoom, this.followZoomTarget, this.followZoomLerp);

  this.setSize(
    surface_get_width(application_surface) / this.followZoom,
    surface_get_height(application_surface) / this.followZoom,
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

  camera.followZoom = cam.zoom ?? 1; // current (eased) zoom that drives the view extent
  camera.followZoomTarget = camera.followZoom; // wheel/reset destination; followZoom eases to it
  camera.followZoomDefault = camera.followZoom; // reset target (mouse-wheel reset button)
  camera.followMinZoom = cam.minZoom ?? 0.5;
  camera.followMaxZoom = cam.maxZoom ?? 4;
  camera.followZoomStep = cam.zoomStep ?? 0.1;
  camera.followZoomLerp = cam.zoomLerp ?? 0.2;
  camera.followZoomButton = cam.zoomResetButton ?? mb_middle;
  return camera;
}

/**
 * 3D perspective-FOV follow camera that eases toward followTarget's Position each update.
 * Currently unused — scenes use the 2D cameraFollow2d; kept as the 3D library variant.
 * Zoom opts apply but are visually inert here (equal-scaled width/height keeps the FOV aspect).
 * @param {object} [cam]
 * @param {World} [cam.world] - World holding the target's Position.
 * @param {number} [cam.followTarget=-1] - Entity id to follow.
 * @param {number} [cam.followLerp=0.1] - Per-update easing factor toward the target.
 * @param {number} [cam.followHeight=256] - Camera Z above the target.
 * @param {number} [cam.zoom=1] - Initial + reset zoom factor.
 * @param {number} [cam.minZoom=0.5] - Lower zoom clamp (wider view).
 * @param {number} [cam.maxZoom=4] - Upper zoom clamp (closer view).
 * @param {number} [cam.zoomStep=0.1] - Multiplicative wheel-notch step.
 * @param {number} [cam.zoomLerp=0.2] - Per-frame easing factor toward the target zoom.
 * @param {number} [cam.zoomResetButton=mb_middle] - Mouse button that resets zoom to `zoom`.
 * @returns {Camera}
 */
globalThis.cameraFollow = function cameraFollow(cam = {}) {
  return _cameraFollowBuild(cam, CAMERA_PROJECTION.PERSPECTIVE_FOV, false, 256);
};

/**
 * 2D orthographic follow camera (pixel-snapped) that eases toward followTarget's Position.
 * The mouse wheel zooms (shrinking/growing the ortho view extent) within [minZoom, maxZoom];
 * the middle mouse button resets zoom to `zoom`.
 * @param {object} [cam]
 * @param {World} [cam.world] - World holding the target's Position.
 * @param {number} [cam.followTarget=-1] - Entity id to follow.
 * @param {number} [cam.followLerp=0.1] - Per-update easing factor toward the target.
 * @param {number} [cam.followHeight=-100] - Camera Z (ortho eye offset).
 * @param {number} [cam.zoom=1] - Initial + reset zoom factor (>1 closer, <1 wider).
 * @param {number} [cam.minZoom=0.5] - Lower zoom clamp (wider view).
 * @param {number} [cam.maxZoom=4] - Upper zoom clamp (closer view).
 * @param {number} [cam.zoomStep=0.1] - Multiplicative wheel-notch step.
 * @param {number} [cam.zoomLerp=0.2] - Per-frame easing factor toward the target zoom.
 * @param {number} [cam.zoomResetButton=mb_middle] - Mouse button that resets zoom to `zoom`.
 * @returns {Camera}
 */
globalThis.cameraFollow2d = function cameraFollow2d(cam = {}) {
  return _cameraFollowBuild(cam, CAMERA_PROJECTION.ORTHO, true, -100);
};
