/** @enum {number} Camera projection modes. */
globalThis.CAMERA_PROJECTION = Object.freeze({
  ORTHO: 0,
  PERSPECTIVE: 1,
  PERSPECTIVE_FOV: 2,
});

/** Wraps a GameMaker camera handle, driven by matrix each update(). Owns a native handle — call destroy() at teardown. */
globalThis.Camera = class Camera {
  /** @param {any} [cam] - config bag: onUpdate, from/to/up XYZ, width/height, znear/zfar/fov, projection. */
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

  /** Free the native handle; unassigns from its viewport first. */
  destroy() {
    this.unassign();

    if (this.id !== -1) {
      camera_destroy(this.id);
      this.id = -1;
    }
  }

  /** Rebuild view + projection matrices and apply if assigned to a viewport. */
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

  /** @returns {boolean} */
  isAssigned() {
    return this.viewport !== -1;
  }

  /** @param {number} [viewport=0] @returns {Camera} this */
  assign(viewport = 0) {
    if (this.isAssigned()) this.unassign();
    this.viewport = viewport;
    view_enabled = true;
    view_set_visible(this.viewport, true);
    view_set_camera(this.viewport, this.id);
    return this;
  }

  /** Detach from its viewport and restore default room rendering. @returns {Camera} this */
  unassign() {
    if (this.isAssigned()) {
      view_set_camera(this.viewport, -1);
      view_set_visible(this.viewport, false);
      this.viewport = -1;
      // restore default room rendering — a view-enabled-but-none-visible state freezes the surface
      view_enabled = false;
    }
    return this;
  }

  /** @param {number} x @param {number} y @param {number} z @returns {Camera} this */
  setFrom(x, y, z) {
    this.fromX = x;
    this.fromY = y;
    this.fromZ = z;
    return this;
  }

  /** @param {number} x @param {number} y @param {number} z @returns {Camera} this */
  setTo(x, y, z) {
    this.toX = x;
    this.toY = y;
    this.toZ = z;
    return this;
  }

  /** @param {number} x @param {number} y @param {number} z @returns {Camera} this */
  setUp(x, y, z) {
    this.upX = x;
    this.upY = y;
    this.upZ = z;
    return this;
  }

  /** @param {number} width @param {number} height @returns {Camera} this */
  setSize(width, height) {
    this.width = width;
    this.height = height;
    return this;
  }

  /** @param {number} projection - A CAMERA_PROJECTION value. @returns {Camera} this */
  setProjection(projection) {
    this.projection = projection;
    return this;
  }

  /**
   * THE ground-plane view rect (world px): the ORTHO view centered on (toX, toY), with the N-S
   * half-extent stretched by 1/cos(pitch) — a tilted ortho camera reaches further north/south
   * across the ground than its `height` alone says. One owner for that rule, so the follow
   * clamp, the mesh light cull, and the grid/tile-map culls can't disagree about what is
   * on-screen. Pitch comes from the follow camera's live `followPitch` radians (CameraFollow);
   * a flat or non-follow camera reads 0 and the rect is plain width × height.
   * @returns {{x1:number, y1:number, x2:number, y2:number}}
   */
  groundRect() {
    const halfW = this.width / 2;
    const halfH = this.height / 2 / Math.cos(this.followPitch ?? 0);
    return {
      x1: this.toX - halfW,
      y1: this.toY - halfH,
      x2: this.toX + halfW,
      y2: this.toY + halfH,
    };
  }

  /**
   * World → surface-pixel projection under the current ortho view. Uses the up vector so a
   * pitched (2.5D) camera foreshortens world-y correctly. Used by screen-space overlays (e.g.
   * RenderLighting) to land in the right place in both flat and pitched views.
   * @param {number} wx @param {number} wy @param {number} [wz=0] @returns {{x:number, y:number}}
   */
  project(wx, wy, wz = 0) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    const up = (wy - this.toY) * this.upY + (wz - this.toZ) * this.upZ;
    return {
      x: sw / 2 + ((wx - this.toX) * sw) / this.width,
      y: sh / 2 + (up * sh) / this.height,
    };
  }

  /**
   * Surface-pixel → world on the GROUND PLANE (wz = 0) — the exact inverse of project().
   * Pitch-aware via the up vector (a flat camera's upY=1/upZ=0 reduces to the linear mapping).
   * GMRT's own mouse_x/mouse_y are wrong under a pitched matrix-driven camera,
   * so world-cursor consumers must convert through this instead.
   * @param {number} sx @param {number} sy @returns {{x:number, y:number}}
   */
  unproject(sx, sy) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    // project(): s = (wy−toY)·upY + (wz−toZ)·upZ — solve for wy at wz = 0
    const s = ((sy - sh / 2) * this.height) / sh;
    return {
      x: this.toX + ((sx - sw / 2) * this.width) / sw,
      y: this.toY + (s + this.toZ * this.upZ) / this.upY,
    };
  }

  /**
   * The mouse cursor as a ground-plane world point under this camera: GUI mouse → surface px
   * (the GUI layer is scaled to the window/back buffer) → unproject(). Latch ONCE per frame
   * and share (the poll-once rule — UIPointer).
   * THE world cursor under a PITCHED camera: mouse_x/mouse_y are the flat-camera answer and are
   * simply wrong once the view tilts, so aim/build/interact all read the latched value instead
   * (sceneRpg.step → level.mouseWorld + Playable.cursorX/Y). Under a flat matrix camera
   * mouse_x/y remain valid (the editor's CameraPan uses them). The result is a GROUND-plane
   * point — an entity's FEET — so pointing at a tall billboard's upper body lands behind it.
   * @returns {{x:number, y:number}}
   */
  cursorWorld() {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    const sx = (device_mouse_x_to_gui(0) / display_get_gui_width()) * sw;
    const sy = (device_mouse_y_to_gui(0) / display_get_gui_height()) * sh;
    return this.unproject(sx, sy);
  }
};
