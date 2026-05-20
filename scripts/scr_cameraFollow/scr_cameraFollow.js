// global.CameraFollow = class CameraFollow extends Camera {
//   constructor(cam = {}) {
//     super(cam);
//     this.follow_target = cam.follow_target ?? -1;
//     this.follow_lerp = cam.follow_lerp ?? 0.1;
//     this.follow_height = cam.follow_height ?? 64;
//     this.projection = CAMERA_PROJECTION.PERSPECTIVE_FOV;
//   }

//   on_update() {
//     if (!instance_exists(this.follow_target)) return;

//     const x = lerp(this.to_x, this.follow_target.x, this.follow_lerp);
//     const y = lerp(this.to_y, this.follow_target.y, this.follow_lerp);
//     const z = lerp(this.to_z, this.follow_target.depth, this.follow_lerp);

//     this.set_from(x, y, z + this.follow_height);
//     this.set_to(x, y, z);
//   }
// };

function cameraFollow(cam = {}) {
  const _camera = new Camera(cam);

  _camera.follow_target = cam.follow_target ?? -1;
  _camera.follow_lerp = cam.follow_lerp ?? 0.1;
  _camera.follow_height = cam.follow_height ?? 64;
  _camera.projection = global.CAMERA_PROJECTION.PERSPECTIVE_FOV;

  _camera.on_update = function () {
    if (!instance_exists(this.follow_target)) return;

    const x = lerp(this.to_x, this.follow_target.x, this.follow_lerp);
    const y = lerp(this.to_y, this.follow_target.y, this.follow_lerp);
    const z = lerp(this.to_z, this.follow_target.depth, this.follow_lerp);

    this.set_from(x, y, z + this.follow_height);
    this.set_to(x, y, z);
  };

  return _camera;
}
