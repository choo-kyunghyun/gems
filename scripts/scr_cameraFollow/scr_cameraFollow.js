function _cameraFollowOnUpdate() {
  const pos = Position.get(this.followTarget);
  if (pos === undefined) return;

  const x = lerp(this.toX, pos.x, this.followLerp);
  const y = lerp(this.toY, pos.y, this.followLerp);

  this.setFrom(x, y, this.followHeight);
  this.setTo(x, y, 0);
}

function cameraFollow(cam = {}) {
  cam.onUpdate = _cameraFollowOnUpdate;
  cam.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;

  const _camera = new Camera(cam);

  _camera.followTarget = cam.followTarget ?? -1;
  _camera.followLerp = cam.followLerp ?? 0.1;
  _camera.followHeight = cam.followHeight ?? 256;

  return _camera;
}
