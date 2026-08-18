/**
 * 2D pan + zoom inspector camera — a Camera CONTROL (the contract is Camera's JSDoc). Drag
 * `button` to pan, wheel zooms toward the cursor. At zoom 1 with the default center, world coords
 * equal screen pixels, which is what lets the editor keep working in plain mouse_x/mouse_y.
 *
 * Unlike CameraFollow's eased, screen-centred zoom, this one is instant and CURSOR-anchored: the
 * world point under the pointer stays put. That anchor is the whole difference between the two —
 * an inspector zooms into what you are pointing at, a game camera into what you are watching.
 *
 * opt: `x`/`y` (center — defaults to the surface center), `zoom`/`zoomMin`/`zoomMax`/`zoomStep`,
 * `button`.
 */
globalThis.CameraPan = class CameraPan {
  constructor(opt = {}) {
    this.raw = false; // sim-clock control (Camera contract)

    this.x = opt.x; // undefined → seeded to the surface center by enter()
    this.y = opt.y;
    this.zoom = opt.zoom ?? 1;
    this.zoomMin = opt.zoomMin ?? 0.25;
    this.zoomMax = opt.zoomMax ?? 8;
    this.zoomStep = opt.zoomStep ?? 0.15;
    this.button = opt.button ?? mb_middle;

    this.dragging = false;
    this.mx = 0;
    this.my = 0;
  }

  /** Seed center + extent so frame 0 already frames the world; pin the ortho projection. */
  enter(camera) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    if (this.x === undefined) this.x = sw * 0.5;
    if (this.y === undefined) this.y = sh * 0.5;

    camera.projection = CAMERA_PROJECTION.ORTHO;
    camera
      .setFrom(this.x, this.y, -100)
      .setTo(this.x, this.y, 0)
      .setSize(sw, sh);
  }

  update(camera) {
    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    // pan/zoom work in the camera's own pixel space, so read the pointer in surface px
    // (Camera.mouseSurface owns the GUI→surface conversion)
    const m = camera.mouseSurface();

    this._drag(m.x, m.y);
    this._wheel(m.x, m.y, sw, sh);

    camera
      .setFrom(this.x, this.y, camera.fromZ)
      .setTo(this.x, this.y, 0)
      .setSize(sw / this.zoom, sh / this.zoom);
  }

  /** Hold `button` to drag the world: the center moves opposite the pointer (delta / zoom). */
  _drag(mx, my) {
    if (mouse_check_button_pressed(this.button)) {
      this.dragging = true;
      this.mx = mx;
      this.my = my;
    }
    if (!this.dragging) return;

    if (mouse_check_button(this.button)) {
      this.x -= (mx - this.mx) / this.zoom;
      this.y -= (my - this.my) / this.zoom;
      this.mx = mx;
      this.my = my;
    } else {
      this.dragging = false;
    }
  }

  _wheel(mx, my, sw, sh) {
    if (mouse_wheel_up())
      this._zoomTo(
        Math.min(this.zoomMax, this.zoom * (1 + this.zoomStep)),
        mx,
        my,
        sw,
        sh,
      );
    if (mouse_wheel_down())
      this._zoomTo(
        Math.max(this.zoomMin, this.zoom * (1 - this.zoomStep)),
        mx,
        my,
        sw,
        sh,
      );
  }

  /** Zoom to `next` keeping the world point under the cursor fixed (world delta = screen / zoom). */
  _zoomTo(next, mx, my, sw, sh) {
    this.x += (mx - sw * 0.5) * (1 / this.zoom - 1 / next);
    this.y += (my - sh * 0.5) * (1 / this.zoom - 1 / next);
    this.zoom = next;
  }
};
