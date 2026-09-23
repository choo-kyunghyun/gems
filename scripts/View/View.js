/**
 * A level's view record: the derived camera frame every consumer reads — the eye basis, the
 * extent (world px; 0 until the first apply, which is how a cull tells an unsized view apart),
 * the look-at, pitch and projection — plus the native camera handle and the viewport it is
 * assigned to (-1 = none). `destroy` releases the viewport first, so a parked level's teardown
 * never tears down the live view.
 *
 * The world↔screen math is pure over the record and ORTHO ONLY: under a perspective projection
 * its answer is meaningless, not merely imprecise.
 */
globalThis.View = class View {
  constructor() {
    this.id = camera_create();
    this.viewport = -1;
    this.fromX = 0;
    this.fromY = 0;
    this.fromZ = 0;
    this.toX = 0;
    this.toY = 0;
    this.toZ = 0;
    this.upX = 0;
    this.upY = 1;
    this.upZ = 0;
    this.width = 0;
    this.height = 0;
    this.pitch = 0;
    this.projection = CAMERA_PROJECTION.ORTHO;
  }

  destroy() {
    this.release();
    if (this.id !== -1) {
      camera_destroy(this.id);
      this.id = -1;
    }
  }

  /** Show this view on `viewport` (0 by default); re-assigning moves it. */
  assign(viewport = 0) {
    this.release();
    this.viewport = viewport;
    view_enabled = true;
    view_set_visible(viewport, true);
    view_set_camera(viewport, this.id);
  }

  /** Release the viewport (a park) — the handle and the record stay for a resume. */
  release() {
    if (this.viewport === -1) return;
    view_set_camera(this.viewport, -1);
    view_set_visible(this.viewport, false);
    this.viewport = -1;
    // restore default room rendering — a view-enabled-but-none-visible state freezes the surface
    view_enabled = false;
  }

  /**
   * THE ground-plane view rect (world px): the ORTHO view centred on the look-at, with the N-S
   * half-extent stretched by 1/cos(pitch) — a tilted ortho camera reaches further north/south
   * across the ground than its `height` alone says. One owner for that rule, so every clamp and
   * cull agrees on what is on-screen.
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
   * World → surface-pixel projection under the ortho view. Uses the up vector so a pitched
   * (2.5D) camera foreshortens world-y correctly.
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
   * Surface-pixel → world on the `wz` PLANE (default the ground, wz = 0) — the exact inverse of
   * project(). Pitch-aware via the up vector (a flat camera's upY=1/upZ=0 reduces to the linear
   * mapping, and `wz` then moves nothing — a top-down view has no plane to choose).
   */
  unproject(sx, sy, wz = 0) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    // project(): s = (wy−toY)·upY + (wz−toZ)·upZ — solve for wy on the wz plane
    const s = ((sy - sh / 2) * this.height) / sh;
    return {
      x: this.toX + ((sx - sw / 2) * this.width) / sw,
      y: this.toY + (s - (wz - this.toZ) * this.upZ) / this.upY,
    };
  }

  /**
   * The mouse cursor as a world point on the `wz` plane; latch once per frame and share. It is
   * the world cursor under a pitched camera, where mouse_x/mouse_y are simply wrong; under a flat
   * camera the room cursor stays valid.
   * `wz` picks the plane the cursor means: the default ground plane is where cells and
   * footprints live, but a body stands off it, so a cursor over a visible torso unprojects to
   * the ground behind that body. Aiming at bodies reads the plane they occupy.
   */
  cursorWorld(wz = 0) {
    const m = View.mouseSurface();
    return this.unproject(m.x, m.y, wz);
  }

  /**
   * The mouse in application-surface pixels. The GUI layer runs at its own design size, so a GUI
   * coord is NOT a surface coord — one owner for that conversion.
   */
  static mouseSurface() {
    return {
      x:
        (Input.pointer.x / display_get_gui_width()) *
        surface_get_width(application_surface),
      y:
        (Input.pointer.y / display_get_gui_height()) *
        surface_get_height(application_surface),
    };
  }
};
