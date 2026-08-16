// zoom to `next` keeping the world point under the cursor fixed (world delta = screen delta / zoom)
function _cameraPanZoom(cam, next, mx, my, sw, sh) {
  cam._panX += (mx - sw * 0.5) * (1 / cam._panZoom - 1 / next);
  cam._panY += (my - sh * 0.5) * (1 / cam._panZoom - 1 / next);
  cam._panZoom = next;
}

/** `this` = a Camera augmented with the _pan* fields set in CameraPan.create. */
function _cameraPanOnUpdate() {
  const sw = surface_get_width(application_surface);
  const sh = surface_get_height(application_surface);

  // device_mouse_*_to_gui returns GUI coords on a fixed design size (≠ surface), so scale
  // GUI→surface to keep pan/zoom in the camera's pixel space
  const mx = (device_mouse_x_to_gui(0) * sw) / display_get_gui_width();
  const my = (device_mouse_y_to_gui(0) * sh) / display_get_gui_height();

  // drag to pan: move camera opposite the mouse delta (world delta = screen / zoom)
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

  // wheel to zoom toward the cursor (clamped to range)
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

globalThis.CameraPan = {
  /**
   * 2D pan + zoom inspector camera. Drag `button` to pan, wheel zooms toward the cursor.
   * At zoom 1 with the default center, world coords equal screen pixels.
   * cam: x/y (center), zoom, minZoom, maxZoom, zoomStep, button.
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

    const camera = new Camera(cam);

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
