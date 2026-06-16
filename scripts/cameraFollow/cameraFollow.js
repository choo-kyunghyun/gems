function _cameraFollowOnUpdate() {
  // Track the application_surface so a resolution change (surface_resize) keeps the
  // perspective aspect correct — the proj matrix is rebuilt from width/height each update
  // (the project drives the view by matrix, like cameraPan, not GM's 2D view-size camera).
  this.setSize(
    surface_get_width(application_surface),
    surface_get_height(application_surface),
  );
  if (this.world === undefined) return;
  const pos = this.world.get(Position, this.followTarget);
  if (pos === undefined) return;

  const x = lerp(this.toX, pos.x, this.followLerp);
  const y = lerp(this.toY, pos.y, this.followLerp);

  this.setFrom(x, y, this.followHeight);
  this.setTo(x, y, 0);
}

globalThis.cameraFollow = function cameraFollow(cam = {}) {
  cam.onUpdate = _cameraFollowOnUpdate;
  cam.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;

  const camera = new Camera(cam);

  camera.world = cam.world;
  camera.followTarget = cam.followTarget ?? -1;
  camera.followLerp = cam.followLerp ?? 0.1;
  camera.followHeight = cam.followHeight ?? 256;

  return camera;
};

function _cameraFollow2dOnUpdate() {
  // Track the application_surface so a resolution change (surface_resize) updates the ortho
  // view extent immediately (1:1 world px) — the proj matrix is rebuilt from width/height
  // each update; the project drives the view by matrix, not GM's 2D view-size camera.
  this.setSize(
    surface_get_width(application_surface),
    surface_get_height(application_surface),
  );
  if (this.world === undefined) return;
  const pos = this.world.get(Position, this.followTarget);
  if (pos === undefined) return;

  const x = Math.round(lerp(this.toX, pos.x, this.followLerp));
  const y = Math.round(lerp(this.toY, pos.y, this.followLerp));

  this.setFrom(x, y, this.followHeight);
  this.setTo(x, y, 0);
}

globalThis.cameraFollow2d = function cameraFollow2d(cam = {}) {
  cam.onUpdate = _cameraFollow2dOnUpdate;
  cam.projection = CAMERA_PROJECTION.ORTHO;

  const camera = new Camera(cam);

  camera.world = cam.world;
  camera.followTarget = cam.followTarget ?? -1;
  camera.followLerp = cam.followLerp ?? 0.1;
  camera.followHeight = cam.followHeight ?? -100;

  return camera;
};
