/** @enum {number} Camera projection modes. */
globalThis.CAMERA_PROJECTION = Object.freeze({
  ORTHO: 0,
  PERSPECTIVE: 1,
  PERSPECTIVE_FOV: 2,
});

/**
 * A GameMaker camera handle driven by matrix each update(): the VIEW — eye/target/up, extent,
 * projection, ground tilt — plus the world↔screen math that view defines. It carries no movement
 * policy; a CONTROL supplies that, so one Camera serves the follow, pan, and free-fly cameras.
 *
 * Control contract — a plain object (`CameraFollow` / `CameraPan` / `CameraFly`):
 * - `update(camera)` — drive the view one frame; Camera.update() calls it before building the
 *   matrices. It writes the camera through setFrom/setTo/setUp/setSize + `projection`/`pitch` and
 *   owns every other field it needs: no control touches another control's state, and Camera reads
 *   no field a control installs (which is why `pitch` lives here, not on the follow control —
 *   groundRect/project/unproject need it).
 * - `enter(camera)` — optional one-shot seed, run by setControl() when the control takes over; also
 *   where a control pins the projection it requires.
 * - `raw` — true when the control runs on `Time.raw` and so must keep ticking while the sim is
 *   paused (the clock split — ARCHITECTURE). A scene reads this to choose where in the frame to
 *   call update(), so it never has to know WHICH control is installed.
 *
 * Owns a native handle — call destroy() at teardown.
 */
globalThis.Camera = class Camera {
  /** cam: view config — from/to/up XYZ, width/height, znear/zfar/fov, projection, pitch. */
  constructor(cam = {}) {
    this.id = camera_create();
    this.viewport = -1;
    /** The active control. READ it here; WRITE through setControl(), which runs the enter() seed. */
    this.control = undefined;

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

    /**
     * Ground tilt in RADIANS — 0 = top-down, >0 = the eye lifted out of the ground plane (2.5D).
     * THE camera-side pitch, and the one groundRect() reads. A control that tilts the view writes
     * it each update (CameraFollow authors the angle in degrees — its config and Debug unit — and
     * converts here; radians are the engine unit). A control that does not tilt leaves the last
     * value standing, so an ortho overlay keeps reading the framing it was drawn under.
     */
    this.pitch = cam.pitch ?? 0;
  }

  /** Free the native handle; unassigns from its viewport first. */
  destroy() {
    this.unassign();
    this.control = undefined;

    if (this.id !== -1) {
      camera_destroy(this.id);
      this.id = -1;
    }
  }

  /**
   * Install the control that drives this camera, seeding it through its enter() hook. THE write
   * path for `control` — a bare assignment skips the seed (a fly camera would inherit a stale pose,
   * a pan camera an unseeded center). Swapping controls is how the free-fly debug camera takes
   * over and hands back.
   */
  setControl(control) {
    this.control = control;
    if (control !== undefined && control.enter !== undefined)
      control.enter(this);
    return this;
  }

  /** Drive the control, rebuild the view + projection matrices, apply them when assigned. */
  update() {
    if (this.control !== undefined) this.control.update(this);

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
      // restore default room rendering — a view-enabled-but-none-visible state freezes the surface
      view_enabled = false;
    }
    return this;
  }

  // The four view-basis setters below earn their place by writing a VECTOR — one call, one
  // coherent value. A lone scalar (`projection`, `fov`, `pitch`, `toX` on a debug recenter) is
  // written as a plain field; a setter around it would only restate the assignment.

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

  /**
   * THE ground-plane view rect (world px): the ORTHO view centered on (toX, toY), with the N-S
   * half-extent stretched by 1/cos(pitch) — a tilted ortho camera reaches further north/south
   * across the ground than its `height` alone says. One owner for that rule, so the follow
   * clamp, the mesh light cull, and the grid/tile-map culls can't disagree about what is
   * on-screen.
   */
  groundRect() {
    const halfW = this.width / 2;
    const halfH = this.height / 2 / Math.cos(this.pitch);
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
   * ORTHO ONLY — like unproject/cursorWorld it inverts the ortho mapping directly, so under the
   * free-fly camera's perspective projection the answer is meaningless, not merely imprecise.
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
   * Surface-pixel → world on the GROUND PLANE (wz = 0) — the exact inverse of project(), and
   * ORTHO ONLY for the same reason. Pitch-aware via the up vector (a flat camera's upY=1/upZ=0
   * reduces to the linear mapping). GMRT's own mouse_x/mouse_y are wrong under a pitched
   * matrix-driven camera, so world-cursor consumers must convert through this instead.
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
   * The mouse in application-surface pixels. The GUI layer runs at its own design size, so a GUI
   * coord is NOT a surface coord — one owner for that conversion (cursorWorld and CameraPan both
   * work in surface space).
   */
  mouseSurface() {
    return {
      x:
        (device_mouse_x_to_gui(0) / display_get_gui_width()) *
        surface_get_width(application_surface),
      y:
        (device_mouse_y_to_gui(0) / display_get_gui_height()) *
        surface_get_height(application_surface),
    };
  }

  /**
   * The mouse cursor as a ground-plane world point under this camera (mouseSurface → unproject).
   * Latch ONCE per frame and share (the poll-once rule — UIPointer).
   * THE world cursor under a PITCHED camera: mouse_x/mouse_y are the flat-camera answer and are
   * simply wrong once the view tilts, so aim/build/interact all read the latched value instead
   * (sceneColony.update → scene.mouseWorld + Playable.cursorX/Y). Under a flat matrix camera
   * mouse_x/y remain valid (the editor's CameraPan uses them). The result is a GROUND-plane
   * point — an entity's FEET — so pointing at a tall billboard's upper body lands behind it.
   * ORTHO only (see project).
   */
  cursorWorld() {
    const m = this.mouseSurface();
    return this.unproject(m.x, m.y);
  }
};
