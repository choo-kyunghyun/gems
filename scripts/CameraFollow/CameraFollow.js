// Shared follow onUpdate (assigned as Camera.onUpdate, `this` = camera). Tracks surface size
// so resolution changes rebuild the view extent immediately — view is driven by matrix, not GM's
// 2D view-size API. Zoom shrinks/grows the ortho extent; followZoom eases toward followZoomTarget.
/** @this {any} - a Camera augmented with the follow fields set in _cameraFollowBuild. */
function _cameraFollowOnUpdate() {
  // read each mouse query once per frame and share (the poll-once rule — see docs/architecture/ui.md)
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
  // cap zoom-out to the renderable world width — derived live from the current surface so a
  // stale build-time size can't let the view zoom past the streamed region into dark unloaded area
  if (this.followViewCap !== undefined) {
    const minZ = surface_get_width(application_surface) / this.followViewCap;
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
  // optional pitch-by-zoom curve (upright-sprite 2.5D: zoomed out = shallower, zoomed in =
  // steeper). Overwrites pitchDeg each frame, so the Debug pitch slider is inert while a
  // curve is installed (clear followPitchCurve to hand-tune).
  if (this.followPitchCurve !== undefined)
    this.pitchDeg = this.followPitchCurve(this.followZoom);
  // pitchDeg is live-tunable (Debug Camera section); re-derive radians each frame so overlays track it
  this.followPitch = ((this.pitchDeg ?? 0) * Math.PI) / 180;

  if (this.freeCam) {
    CameraFly.update(this);
    return;
  }
  // restore ortho projection (fly switches to perspective) and reset seed for next fly entry
  this.projection = this._baseProjection;
  this._flyInit = false;

  if (this.world === undefined) return;
  // Resolve the target LIVE each update: an entity carrying CameraFocus wins (so the camera
  // never dangles a stored id — a portal transfer re-mints the player's entity id, but the
  // marker rides the EntitySnapshot into the new world and the query just finds it);
  // followTarget is the raw-id fallback for worlds that don't use the marker.
  let target = this.followTarget;
  const foci = this.world.query(CameraFocus);
  if (foci.length > 0) target = foci[0];
  const pos = this.world.get(Position, target);
  if (pos === undefined) return;

  let x = lerp(this.toX, pos.x, this.followLerp);
  let y = lerp(this.toY, pos.y, this.followLerp);

  // clamp look-at to world bounds so the view never shows past a map edge; vertical half-extent
  // is divided by cos(pitch) because a tilted ortho stretches the N-S ground reach; center if
  // the world is smaller than the view
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

  // 2.5D: pitch tilts the ortho eye out of the ground plane for billboard rendering; 0 = top-down
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
 * Shared follow-camera builder; create/create2d differ only in projection, snap, and default height.
 * @param {any} cam @param {number} projection @param {boolean} snap @param {number} defaultHeight
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
  camera.pitchDeg = cam.pitch ?? 0; // degrees — live-tunable via Debug Camera section
  camera.followPitch = (camera.pitchDeg * Math.PI) / 180; // derived radians, recomputed each onUpdate
  // debug 6DOF fly mode (toggled via Debug Camera section); delegates to CameraFly.update while on
  CameraFly.install(camera, {
    flySpeed: cam.flySpeed,
    mouseSens: cam.mouseSens,
  });
  camera.followClamp = cam.clamp; // optional { x1, y1, x2, y2 } look-at bounds
  camera.followViewCap = cam.viewCap; // optional max view width (world px) — live zoom-out cap
  camera.followPitchCurve = cam.pitchCurve; // optional (zoom) => pitch°, applied each update

  camera.followZoom = cam.zoom ?? 1; // current eased zoom
  camera.followZoomTarget = camera.followZoom; // wheel/reset destination
  camera.followZoomDefault = camera.followZoom; // reset target
  camera.followMinZoom = cam.minZoom ?? 0.5;
  camera.followMaxZoom = cam.maxZoom ?? 4;
  camera.followZoomStep = cam.zoomStep ?? 0.1;
  camera.followZoomLerp = cam.zoomLerp ?? 0.2;
  camera.followZoomButton = cam.zoomResetButton ?? mb_middle;
  return camera;
}

// namespace over the shared follow builder: `create` = 3D perspective, `create2d` = 2D ortho
globalThis.CameraFollow = {
  /**
   * 3D perspective-FOV follow camera. Currently unused (scenes use create2d); kept as library variant.
   * @param {object} [cam] - world, followTarget, followLerp, followHeight, zoom/min/max/step/lerp/zoomResetButton
   * @returns {Camera}
   */
  create(cam = {}) {
    return _cameraFollowBuild(
      cam,
      CAMERA_PROJECTION.PERSPECTIVE_FOV,
      false,
      256,
    );
  },

  /**
   * 2D pixel-snapped orthographic follow camera with wheel zoom. Middle-mouse resets zoom.
   * @param {object} [cam] - world, followTarget, followLerp, followHeight, zoom/min/max/step/lerp/zoomResetButton,
   *   clamp { x1, y1, x2, y2 } world-px look-at bounds (pitch-aware; centers when world < view), viewCap
   * @returns {Camera}
   */
  create2d(cam = {}) {
    return _cameraFollowBuild(cam, CAMERA_PROJECTION.ORTHO, true, -100);
  },
};
