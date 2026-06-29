// Zoom toward the cursor: set _panZoom to `next` while keeping the world point under the
// cursor fixed (world delta = screen delta / zoom). Shared by both wheel directions.
/** @param {any} cam @param {number} next @param {number} mx @param {number} my @param {number} sw @param {number} sh */
function _cameraPanZoom(cam, next, mx, my, sw, sh) {
  cam._panX += (mx - sw * 0.5) * (1 / cam._panZoom - 1 / next);
  cam._panY += (my - sh * 0.5) * (1 / cam._panZoom - 1 / next);
  cam._panZoom = next;
}

/** @this {any} - a Camera augmented with the _pan* fields set in CameraPan.create. */
function _cameraPanOnUpdate() {
  const sw = surface_get_width(application_surface);
  const sh = surface_get_height(application_surface);

  // Screen-space mouse coords (camera-independent) in application_surface pixels.
  // device_mouse_*_to_gui returns GUI-layer coords on a fixed design size (≠ the surface),
  // so scale GUI→surface to keep pan/zoom in the camera's pixel space.
  const mx = (device_mouse_x_to_gui(0) * sw) / display_get_gui_width();
  const my = (device_mouse_y_to_gui(0) * sh) / display_get_gui_height();

  // Drag to pan: move the camera opposite the mouse screen delta (world delta = screen / zoom).
  if (mouse_check_button_pressed(this._panButton)) {
    this._panDragging = true;
    this._panMx = mx;
    this._panMy = my;
  }
  if (this._panDragging) {
    if (mouse_check_button(this._panButton)) {
      this._panX -= (mx - this._panMx) / this._panZoom;
      this._panY -= (my - this._panMy) / this._panZoom;
      this._panMx = mx;
      this._panMy = my;
    } else {
      this._panDragging = false;
    }
  }

  // Wheel to zoom toward the cursor (clamped to the zoom range).
  if (mouse_wheel_up()) {
    const next = Math.min(this._panMaxZoom, this._panZoom * (1 + this._panZoomStep));
    _cameraPanZoom(this, next, mx, my, sw, sh);
  }
  if (mouse_wheel_down()) {
    const next = Math.max(this._panMinZoom, this._panZoom * (1 - this._panZoomStep));
    _cameraPanZoom(this, next, mx, my, sw, sh);
  }

  this.setFrom(this._panX, this._panY, this.fromZ);
  this.setTo(this._panX, this._panY, 0);
  this.setSize(sw / this._panZoom, sh / this._panZoom);
}

// Namespace object (PascalCase, like CameraFly) over the pan/zoom build — `create` returns the
// configured Camera. (Still a plain factory internally; the object grouping makes the name correct.)
globalThis.CameraPan = {
  /**
   * 2D pan + zoom inspector camera. Drag `button` (default mb_middle) to pan; the wheel zooms
   * toward the cursor. At zoom 1 with the default center, world coords equal screen pixels.
   * @param {any} [cam] - Config bag: x/y (initial center, default surface center), zoom (=1),
   *   minZoom (=0.25), maxZoom (=8), zoomStep (=0.15 per notch), button (=mb_middle).
   * @returns {Camera}
   */
  create(cam = {}) {
    cam.onUpdate = _cameraPanOnUpdate;
    cam.projection = CAMERA_PROJECTION.ORTHO;

    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);

    const ix = cam.x ?? sw * 0.5;
    const iy = cam.y ?? sh * 0.5;

    cam.fromX = ix;
    cam.fromY = iy;
    cam.fromZ = -100;
    cam.toX = ix;
    cam.toY = iy;
    cam.width = sw;
    cam.height = sh;

    const camera = /** @type {any} */ (new Camera(cam));

    camera._panX = ix;
    camera._panY = iy;
    camera._panZoom = cam.zoom ?? 1;
    camera._panMinZoom = cam.minZoom ?? 0.25;
    camera._panMaxZoom = cam.maxZoom ?? 8;
    camera._panZoomStep = cam.zoomStep ?? 0.15;
    camera._panButton = cam.button ?? mb_middle;
    camera._panDragging = false;
    camera._panMx = 0;
    camera._panMy = 0;

    return camera;
  },
};
