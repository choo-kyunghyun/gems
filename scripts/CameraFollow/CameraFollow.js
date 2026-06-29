// Shared follow step (assigned as Camera.onUpdate, so `this` is the camera). Tracks the
// application_surface size so a resolution change rebuilds the view extent immediately —
// the project drives the view by matrix, not GM's 2D view-size camera. followSnap rounds to
// whole pixels for the 2D ortho variant. The wheel zooms by shrinking/growing the view extent
// (the camera always re-centers on the target, so no cursor-anchored math like CameraPan);
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
  // Cap zoom-OUT so the view never exceeds the renderable world width (followViewCap, world px) —
  // derived LIVE from the current surface (the build-time surface size can be stale/smaller, which
  // would let the view zoom out past the streamed region into the dark unloaded area). Clamps the
  // target so the wheel stops at the cap.
  if (this.followViewCap !== undefined) {
    const minZ =
      surface_get_width(application_surface) / this.followViewCap;
    if (this.followZoomTarget < minZ) this.followZoomTarget = minZ;
  }
  this.followZoom = lerp(
    this.followZoom,
    this.followZoomTarget,
    this.followZoomLerp,
  );

  this.setSize(
    surface_get_width(application_surface) / this.followZoom,
    surface_get_height(application_surface) / this.followZoom,
  );
  // Pitch is LIVE-tunable (the Debug Camera panel writes pitchDeg): derive the radians each frame so
  // a runtime change applies. pitchDeg is the source of truth; followPitch is read below by the
  // edge-clamp + the pitch block, and elsewhere by FloatingText + the projected overlays (via the
  // up vector), so they all track a live change.
  this.followPitch = ((this.pitchDeg ?? 0) * Math.PI) / 180;

  if (this.freeCam) {
    CameraFly.update(this); // 6DOF spectator: WASD/Space/Shift move, RMB+mouse look, Q/E roll
    return;
  }
  // Following: restore the base (ortho) projection — the fly mode switches to perspective — and
  // reset the fly seed so re-entering fly re-initializes from the live view.
  this.projection = this._baseProjection;
  this._flyInit = false;

  if (this.world === undefined) return;
  const pos = this.world.get(Position, this.followTarget);
  if (pos === undefined) return;

  let x = lerp(this.toX, pos.x, this.followLerp);
  let y = lerp(this.toY, pos.y, this.followLerp);

  // Edge-clamp the look-at to the world bounds so the pitched view never shows past a map edge
  // (the dead space at the hub spawn, which sits in the world's top-left corner). Horizontal maps
  // 1:1 to ground x; the pitch stretches the visible N-S ground reach by 1/cos(pitch) (derived: a
  // tilted ortho's ground half-extent is (height/2)/cos(p), symmetric about the look-at), so the
  // vertical half-extent accounts for it — flat (pitch 0 → cos 1) reduces to height/2, unchanged.
  // If the world is narrower/shorter than the view, center on it instead of clamping to an edge.
  const cb = this.followClamp;
  if (cb !== undefined) {
    const halfW = this.width / 2;
    const halfH = this.height / 2 / Math.cos(this.followPitch ?? 0);
    x =
      cb.x2 - cb.x1 > this.width
        ? clamp(x, cb.x1 + halfW, cb.x2 - halfW)
        : (cb.x1 + cb.x2) / 2;
    y =
      cb.y2 - cb.y1 > 2 * halfH
        ? clamp(y, cb.y1 + halfH, cb.y2 - halfH)
        : (cb.y1 + cb.y2) / 2;
  }

  if (this.followSnap) {
    x = Math.round(x);
    y = Math.round(y);
  }

  // 2.5D: an optional pitch tilts the ortho eye up out of the ground plane (rotating the eye + up
  // vector about the X axis), so the view looks down at an angle for standing billboards. pitch 0
  // (default) is the unchanged top-down look; followPitch is radians.
  const p = this.followPitch ?? 0;
  if (p === 0) {
    this.setFrom(x, y, this.followHeight);
    this.setTo(x, y, 0);
  } else {
    const ad = Math.abs(this.followHeight);
    this.setFrom(x, y + Math.sin(p) * ad, -Math.cos(p) * ad);
    this.setTo(x, y, 0);
    this.setUp(0, Math.cos(p), Math.sin(p));
  }
}

/**
 * Build a follow camera over the shared onUpdate; projection/snap/defaultHeight are the only
 * differences between the 3D and 2D variants.
 * @param {any} cam - Camera config bag (see CameraFollow.create/create2d).
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
  camera.pitchDeg = cam.pitch ?? 0; // 2.5D pitch in DEGREES — live-tunable (Debug Camera panel)
  camera.followPitch = (camera.pitchDeg * Math.PI) / 180; // derived radians (recomputed each onUpdate)
  // Debug 6DOF free-fly camera (toggled via the Debug Camera panel). When freeCam is on, the
  // follow onUpdate delegates to CameraFly.update — WASD/Space/Shift move + RMB-mouse look + Q/E
  // roll, in a PERSPECTIVE projection. CameraFly.install adds the fly state fields here.
  CameraFly.install(camera, {
    flySpeed: cam.flySpeed,
    mouseSens: cam.mouseSens,
  });
  camera.followClamp = cam.clamp; // optional { x1, y1, x2, y2 } world-px look-at bounds (edge-clamp)
  camera.followViewCap = cam.viewCap; // optional max view width (world px) → live zoom-out cap

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

// Namespace object (PascalCase, like CameraFly) over the shared follow build — `create` is the 3D
// perspective variant, `create2d` the 2D ortho one. (Both are still plain factories internally; the
// object grouping is what makes the PascalCase name correct.)
globalThis.CameraFollow = {
  /**
   * 3D perspective-FOV follow camera that eases toward followTarget's Position each update.
   * Currently unused — scenes use the 2D create2d; kept as the 3D library variant.
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
  create(cam = {}) {
    return _cameraFollowBuild(cam, CAMERA_PROJECTION.PERSPECTIVE_FOV, false, 256);
  },

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
   * @param {object} [cam.clamp] - Optional world-px look-at bounds { x1, y1, x2, y2 }. The eased
   *   look-at is clamped inside them each frame so the view never shows past a map edge (the pitch
   *   stretches the N-S reach, accounted for); a world smaller than the view is centered instead.
   * @returns {Camera}
   */
  create2d(cam = {}) {
    return _cameraFollowBuild(cam, CAMERA_PROJECTION.ORTHO, true, -100);
  },
};
