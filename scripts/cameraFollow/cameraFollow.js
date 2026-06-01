function _cameraFollowOnUpdate() {
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
