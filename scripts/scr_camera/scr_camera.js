global.CAMERA_PROJECTION = Object.freeze({
  ORTHO: 0,
  PERSPECTIVE: 1,
  PERSPECTIVE_FOV: 2,
});

global.Camera = class Camera {
  /**
   * @typedef {Object} CameraOptions
   * @property {number} [from_x]
   * @property {number} [from_y]
   * @property {number} [from_z]
   * @property {number} [to_x]
   * @property {number} [to_y]
   * @property {number} [to_z]
   * @property {number} [up_x]
   * @property {number} [up_y]
   * @property {number} [up_z]
   * @property {number} [width]
   * @property {number} [height]
   * @property {number} [znear]
   * @property {number} [zfar]
   * @property {number} [fov]
   * @property {number} [projection]
   * @property {number} [viewport]
   */

  /**
   * @param {CameraOptions} cam
   */
  constructor(cam = {}) {
    this.id = camera_create();

    this.from_x = cam.from_x ?? 0;
    this.from_y = cam.from_y ?? 0;
    this.from_z = cam.from_z ?? 0;

    this.to_x = cam.to_x ?? this.from_x;
    this.to_y = cam.to_y ?? this.from_y;
    this.to_z = cam.to_z ?? this.from_z;

    this.up_x = cam.up_x ?? 0;
    this.up_y = cam.up_y ?? 1;
    this.up_z = cam.up_z ?? 0;

    this.width = cam.width ?? 1366;
    this.height = cam.height ?? 768;

    this.znear = cam.znear ?? 1;
    this.zfar = cam.zfar ?? 32000;
    this.fov = cam.fov ?? 70;

    this.projection = cam.projection ?? global.CAMERA_PROJECTION.ORTHO;
    this.viewport = cam.viewport ?? -1;
    this.assigned = false;
  }

  on_update() {}

  destroy() {
    this.unassign();

    if (this.id != -1) camera_destroy(this.id);
    this.id = -1;
  }

  update() {
    this.on_update();

    const _view = matrix_build_lookat(
      this.from_x,
      this.from_y,
      this.from_z,
      this.to_x,
      this.to_y,
      this.to_z,
      this.up_x,
      this.up_y,
      this.up_z,
    );
    let _proj = matrix_build_identity();

    switch (this.projection) {
      case global.CAMERA_PROJECTION.ORTHO:
        _proj = matrix_build_projection_ortho(
          this.width,
          this.height,
          this.znear,
          this.zfar,
        );
        break;
      case global.CAMERA_PROJECTION.PERSPECTIVE:
        _proj = matrix_build_projection_perspective(
          this.width,
          this.height,
          this.znear,
          this.zfar,
        );
        break;
      case global.CAMERA_PROJECTION.PERSPECTIVE_FOV:
        _proj = matrix_build_projection_perspective_fov(
          this.fov,
          this.width / this.height,
          this.znear,
          this.zfar,
        );
        break;
    }

    camera_set_view_mat(this.id, _view);
    camera_set_proj_mat(this.id, _proj);
    if (this.assigned) camera_apply(this.id);
  }

  assign(viewport = 0) {
    this.viewport = viewport;
    this.assigned = true;
    view_enabled = true;
    view_set_visible(this.viewport, true);
    view_set_camera(this.viewport, this.id);
  }

  unassign() {
    if (this.assigned) {
      view_set_visible(this.viewport, false);
      view_set_camera(this.viewport, -1);
      this.assigned = false;
    }
    this.viewport = -1;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  set_from(x, y, z) {
    this.from_x = x;
    this.from_y = y;
    this.from_z = z;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  set_to(x, y, z) {
    this.to_x = x;
    this.to_y = y;
    this.to_z = z;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  set_up(x, y, z) {
    this.up_x = x;
    this.up_y = y;
    this.up_z = z;
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  set_size(width, height) {
    this.width = width;
    this.height = height;
  }
};
