// Applies the saved display settings (fullscreen, windowed resolution, fps cap) to the OS window
// and the application surface, and owns the render-target size the UI clips against.
globalThis.Display = {
  // frames to defer a resize after leaving fullscreen, per the manual's caveat
  RESIZE_DELAY: 10,

  // game speed for an unlimited fpsLimit (0); the sim is rate-independent. BUG: the manual's
  // timing-method uncap is inert (docs/GMRT.md).
  UNCAPPED_FPS: 1000,

  // render-target size in physical px. BUG: window size queries lag a resize (docs/GMRT.md), so
  // the size is tracked here; authoritative because the window isn't drag-resizable.
  renderW: 0,
  renderH: 0,

  /** The clip target size; the window's until a size is applied. */
  clipW() {
    return Display.renderW > 0 ? Display.renderW : window_get_width();
  },
  clipH() {
    return Display.renderH > 0 ? Display.renderH : window_get_height();
  },

  /**
   * Supported fullscreen AA levels as valid display_reset `aa` args; each level is its own bit.
   */
  aaLevels() {
    const out = [0];
    if (display_aa & 2) out.push(2);
    if (display_aa & 4) out.push(4);
    if (display_aa & 8) out.push(8);
    return out;
  },

  /**
   * display_reset also resets the window to its startup state, so the rest is re-imposed.
   */
  applyVideo() {
    display_reset(Settings.get("antialias"), Settings.get("vsync"));
    Display.apply();
  },

  /** fpsLimit 0 = unlimited. */
  applyFps() {
    const fps = Settings.get("fpsLimit");
    game_set_speed(fps > 0 ? fps : Display.UNCAPPED_FPS, gamespeed_fps);
  },

  // the pending leave-fullscreen resize. BUG: a GML handle, so test it only for emptiness
  // (docs/GMRT.md).
  _pendingResize: undefined,

  /**
   * An unset windowed resolution means half the monitor. Leaving fullscreen defers the resize
   * RESIZE_DELAY frames.
   */
  apply() {
    // a deferred resize still in flight carries a stale size
    if (Display._pendingResize !== undefined) {
      call_cancel(Display._pendingResize);
      Display._pendingResize = undefined;
    }
    Display.applyFps();
    if (Settings.get("fullscreen")) {
      window_set_fullscreen(true);
      // the fullscreen target is the monitor; the window size lags the switch
      Display.renderW = display_get_width();
      Display.renderH = display_get_height();
      surface_resize(application_surface, Display.renderW, Display.renderH);
      return;
    }
    let w = Settings.get("resolutionW");
    let h = Settings.get("resolutionH");
    if (w <= 0 || h <= 0) {
      // floored: a fractional size would reach the scissor extents
      w = Math.floor(display_get_width() / 2);
      h = Math.floor(display_get_height() / 2);
    }
    if (window_get_fullscreen()) {
      // record the intended size now, so renderW tracks the target through the transition
      window_set_fullscreen(false);
      Display.renderW = w;
      Display.renderH = h;
      Display._pendingResize = call_later(
        Display.RESIZE_DELAY,
        time_source_units_frames,
        () => {
          Display._pendingResize = undefined;
          Display._resize(w, h);
        },
        false,
      );
    } else {
      Display._resize(w, h);
    }
  },

  _resize(w, h) {
    Display.renderW = w;
    Display.renderH = h;
    window_set_size(w, h);
    surface_resize(application_surface, w, h);
    window_center();
  },
};
