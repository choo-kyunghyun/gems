// Display / window management — applies the saved display Settings (fullscreen + windowed resolution
// + fps cap) to the OS window + application_surface. Used at boot and on a GameOverlay display change.
globalThis.Display = {
  // frames to defer a resize after leaving fullscreen — the manual warns window_set_size right after
  // fullscreen→windowed "may not work correctly" unless ≥10 steps later. The caveat does NOT reproduce
  // on GMRT 0.20 (a same-frame resize takes effect); kept for manual compliance across platforms.
  RESIZE_DELAY: 10,

  // game speed for "Unlimited" fpsLimit (0) — effectively uncapped (sim is fixed-rate, unaffected).
  // NOT the manual's uncap TIP, display_set_timing_method(tm_systemtiming): inert on GMRT (GMRT.md).
  UNCAPPED_FPS: 1000,

  // current render-target (back buffer) size in PHYSICAL px — windowed client area, or monitor in
  // fullscreen. The back buffer resizes synchronously, but window_get_width/height() (and the app
  // surface) lag a frame, so a query on a resize frame reports the OLD size — keying the GPU scissor
  // off that overflows the freshly-shrunk target → fatal "scissor not contained" validation error.
  // Authoritative because the window isn't drag-resizable (options_windows resize_window:false).
  renderW: 0,
  renderH: 0,
  // renderW/H aged one frame (advanceFrame). The back buffer doesn't track apply() in lockstep:
  // a SHRINK shrinks it the same frame, a GROW lags ONE frame — so a scissor sized to renderW would
  // overflow the not-yet-grown target → fatal validation error.
  _prevW: 0,
  _prevH: 0,

  /**
   * crash-safe clip-target size: min of renderW and its 1-frame-lagged _prevW. The live back buffer
   * always equals one of the two mid-transition, so min() can never exceed the target (a grow just
   * under-clips one invisible frame). Used by UIElement._drawClipped + UI.draw's frame-start reset.
   */
  clipW() {
    if (Display.renderW <= 0) return window_get_width();
    return Display._prevW > 0
      ? Math.min(Display.renderW, Display._prevW)
      : Display.renderW;
  },
  clipH() {
    if (Display.renderH <= 0) return window_get_height();
    return Display._prevH > 0
      ? Math.min(Display.renderH, Display._prevH)
      : Display.renderH;
  },

  /**
   * age renderW/H into the 1-frame-lagged _prevW/H (end of UI.draw) — so a GROW only takes clip
   * effect next frame, after the back buffer catches up.
   */
  advanceFrame() {
    Display._prevW = Display.renderW;
    Display._prevH = Display.renderH;
  },

  /**
   * supported fullscreen AA levels as valid display_reset `aa` args: 0 plus each 2/4/8 bit
   * display_aa reports (bit value == level, so `display_aa & lvl` is lvl when supported). Single `&` is GMRT-safe.
   */
  aaLevels() {
    const out = [0];
    if (display_aa & 2) out.push(2);
    if (display_aa & 4) out.push(4);
    if (display_aa & 8) out.push(8);
    return out;
  },

  // forced AA level overriding the saved setting while a subsystem can't tolerate it (null = use
  // Settings). Owned here, not by the requester, so EVERY applyVideo honors it: Debug pins 0 for the
  // lifetime of the native ImGui overlay (single-sampled — an AA>0 back buffer is a fatal WebGPU
  // sampleCount mismatch), which a later GameOverlay vsync/AA change would otherwise restore under it.
  aaOverride: null,

  /**
   * apply the saved vsync + the effective AA (aaOverride, else Settings). display_reset also RESETS
   * resolution/window to startup, so re-impose window + fps via apply().
   */
  applyVideo() {
    display_reset(
      Display.aaOverride ?? Settings.get("antialias"),
      Settings.get("vsync"),
    );
    Display.apply();
  },

  /** apply the saved fps cap (fpsLimit 30/60/120, or 0 = Unlimited). */
  applyFps() {
    const fps = Settings.get("fpsLimit");
    game_set_speed(fps > 0 ? fps : Display.UNCAPPED_FPS, gamespeed_fps);
  },

  // pending leave-fullscreen resize (call_later handle), cancelled by the next apply(). A GML handle:
  // test it only for emptiness — a pointer is never ===-equal, not even to itself (see GMRT.md).
  _pendingResize: undefined,

  /**
   * apply Settings: fps cap, then fullscreen, else size to the saved windowed resolution
   * (0/unset → half the monitor). Leaving fullscreen defers the resize RESIZE_DELAY frames (manual caveat).
   */
  apply() {
    // drop any deferred resize still in flight: it carries the size of the state it was queued for,
    // so firing after a re-entered fullscreen (or a newer resolution) would impose a stale size.
    if (Display._pendingResize !== undefined) {
      call_cancel(Display._pendingResize);
      Display._pendingResize = undefined;
    }
    Display.applyFps();
    if (Settings.get("fullscreen")) {
      window_set_fullscreen(true);
      // fullscreen target is the monitor: record it (renderW) and match the app surface so the world
      // renders at full res. Use display_get_* (always known) not window_get_* (lags the switch by frames).
      Display.renderW = display_get_width();
      Display.renderH = display_get_height();
      surface_resize(application_surface, Display.renderW, Display.renderH);
      return;
    }
    let w = Settings.get("resolutionW");
    let h = Settings.get("resolutionH");
    if (w <= 0 || h <= 0) {
      // floor: an odd-width monitor would otherwise hand a fractional size to window_set_size and,
      // through renderW, to the GPU scissor extents.
      w = Math.floor(display_get_width() / 2);
      h = Math.floor(display_get_height() / 2);
    }
    if (window_get_fullscreen()) {
      // leaving fullscreen: defer the resize so the runtime doesn't drop it; record the intended
      // windowed size now so renderW tracks the target through the transition.
      window_set_fullscreen(false);
      Display.renderW = w;
      Display.renderH = h;
      Display._pendingResize = call_later(
        Display.RESIZE_DELAY,
        time_source_units_frames,
        () => {
          Display._pendingResize = undefined; // fired: nothing left to cancel
          Display._resize(w, h);
        },
        false,
      );
    } else {
      Display._resize(w, h);
    }
  },

  /**
   * size the window + app surface, recenter, and record the requested size in renderW/H
   * (the synchronous render-target size for the GUI clip scale).
   */
  _resize(w, h) {
    Display.renderW = w;
    Display.renderH = h;
    window_set_size(w, h);
    surface_resize(application_surface, w, h);
    window_center();
  },
};
