function _cameraFollowOnUpdate() {
  if (!instance_exists(this.followTarget)) return;

  const x = lerp(this.toX, this.followTarget.x, this.followLerp);
  const y = lerp(this.toY, this.followTarget.y, this.followLerp);
  const z = lerp(this.toZ, this.followTarget.depth, this.followLerp);

  this.setFrom(x, y, z + this.followHeight);
  this.setTo(x, y, z);
}

function cameraFollow(cam = {}) {
  cam.onUpdate = _cameraFollowOnUpdate;
  cam.projection = global.CAMERA_PROJECTION.PERSPECTIVE_FOV;

  const _camera = new Camera(cam);

  _camera.followTarget = cam.followTarget ?? -1;
  _camera.followLerp = cam.followLerp ?? 0.1;
  _camera.followHeight = cam.followHeight ?? 256;

  return _camera;
};
