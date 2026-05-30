globalThis.CAMERA_PROJECTION = Object.freeze({
  ORTHO: 0,
  PERSPECTIVE: 1,
  PERSPECTIVE_FOV: 2,
});

globalThis.Camera = class Camera {
  constructor(cam = {}) {
    this.id = camera_create();
    this.viewport = -1;
    this.onUpdate = cam.onUpdate ?? noop;

    this.fromX = cam.fromX ?? 0;
    this.fromY = cam.fromY ?? 0;
    this.fromZ = cam.fromZ ?? 0;

    this.toX = cam.toX ?? this.fromX;
    this.toY = cam.toY ?? this.fromY;
    this.toZ = cam.toZ ?? this.fromZ;

    this.upX = cam.upX ?? 0;
    this.upY = cam.upY ?? 1;
    this.upZ = cam.upZ ?? 0;

    this.width = cam.width ?? 1366;
    this.height = cam.height ?? 768;

    this.znear = cam.znear ?? 1;
    this.zfar = cam.zfar ?? 32000;
    this.fov = cam.fov ?? 70;
    this.projection = cam.projection ?? CAMERA_PROJECTION.ORTHO;
  }

  destroy() {
    this.unassign();

    if (this.id !== -1) {
      camera_destroy(this.id);
      this.id = -1;
    }
  }

  update() {
    this.onUpdate();

    const view = matrix_build_lookat(
      this.fromX,
      this.fromY,
      this.fromZ,
      this.toX,
      this.toY,
      this.toZ,
      this.upX,
      this.upY,
      this.upZ,
    );

    let proj = null;
    switch (this.projection) {
      case CAMERA_PROJECTION.ORTHO:
        proj = matrix_build_projection_ortho(
          this.width,
          this.height,
          this.znear,
          this.zfar,
        );
        break;
      case CAMERA_PROJECTION.PERSPECTIVE:
        proj = matrix_build_projection_perspective(
          this.width,
          this.height,
          this.znear,
          this.zfar,
        );
        break;
      case CAMERA_PROJECTION.PERSPECTIVE_FOV:
        proj = matrix_build_projection_perspective_fov(
          this.fov,
          this.width / this.height,
          this.znear,
          this.zfar,
        );
        break;
    }

    camera_set_view_mat(this.id, view);
    if (proj !== null) camera_set_proj_mat(this.id, proj);
    if (this.isAssigned()) camera_apply(this.id);
  }

  isAssigned() {
    return this.viewport !== -1;
  }

  assign(viewport = 0) {
    if (this.isAssigned()) this.unassign();
    this.viewport = viewport;
    view_enabled = true;
    view_set_visible(this.viewport, true);
    view_set_camera(this.viewport, this.id);
    return this;
  }

  unassign() {
    if (this.isAssigned()) {
      view_set_camera(this.viewport, -1);
      view_set_visible(this.viewport, false);
      this.viewport = -1;
    }
    return this;
  }

  setFrom(x, y, z) {
    this.fromX = x;
    this.fromY = y;
    this.fromZ = z;
    return this;
  }

  setTo(x, y, z) {
    this.toX = x;
    this.toY = y;
    this.toZ = z;
    return this;
  }

  setUp(x, y, z) {
    this.upX = x;
    this.upY = y;
    this.upZ = z;
    return this;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    return this;
  }

  setProjection(projection) {
    this.projection = projection;
    return this;
  }
};
