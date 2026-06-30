// Display / window management: applies the saved display Settings (fullscreen + windowed
// resolution + fps cap) to the OS window + the application_surface. Used at boot and on a
// SystemMenu display change. The GUI layer is sized separately by UI.applyScale.
globalThis.Display = class Display {
  // frames to defer a resize after leaving fullscreen — GM manual warns window_set_size right
  // after fullscreen→windowed "may not work correctly" unless ≥10 steps later (via call_later).
  static RESIZE_DELAY = 10;

  // game speed for "Unlimited" fpsLimit (0) — effectively uncapped (sim is fixed-rate, unaffected).
  static UNCAPPED_FPS = 1000;

  // current render-target (back buffer) size in PHYSICAL px — windowed client area, or monitor in
  // fullscreen. The back buffer resizes synchronously, but window_get_width/height() (and the app
  // surface) lag a frame, so a query on a resize frame reports the OLD size — keying the GPU scissor
  // off that overflows the freshly-shrunk target → fatal "scissor not contained" validation error.
  // Authoritative because the window isn't drag-resizable (options_windows resize_window:false).
  static renderW = 0;
  static renderH = 0;
  // renderW/H aged one frame (advanceFrame). The back buffer doesn't track apply() in lockstep:
  // a SHRINK shrinks it the same frame, a GROW lags ONE frame — so a scissor sized to renderW would
  // overflow the not-yet-grown target → fatal validation error.
  static _prevW = 0;
  static _prevH = 0;

  // crash-safe clip-target size: min of renderW and its 1-frame-lagged _prevW. The live back buffer
  // always equals one of the two mid-transition, so min() can never exceed the target (a grow just
  // under-clips one invisible frame). Used by UIElement._drawClipped + UI.draw's frame-start reset.
  static clipW() {
    if (Display.renderW <= 0) return window_get_width();
    return Display._prevW > 0
      ? Math.min(Display.renderW, Display._prevW)
      : Display.renderW;
  }
  static clipH() {
    if (Display.renderH <= 0) return window_get_height();
    return Display._prevH > 0
      ? Math.min(Display.renderH, Display._prevH)
      : Display.renderH;
  }

  // age renderW/H into the 1-frame-lagged _prevW/H (end of UI.draw) — so a GROW only takes clip
  // effect next frame, after the back buffer catches up.
  static advanceFrame() {
    Display._prevW = Display.renderW;
    Display._prevH = Display.renderH;
  }

  // supported fullscreen AA levels as valid display_reset `aa` args: 0 plus each 2/4/8 bit
  // display_aa reports (bit value == level, so `display_aa & lvl` is lvl when supported). Single `&` is GMRT-safe.
  static aaLevels() {
    const out = [0];
    if (display_aa & 2) out.push(2);
    if (display_aa & 4) out.push(4);
    if (display_aa & 8) out.push(8);
    return out;
  }

  // apply the saved vsync + fullscreen-AA. See applyVideoWith.
  static applyVideo() {
    Display.applyVideoWith(Settings.get("antialias"), Settings.get("vsync"));
  }

  // display_reset(aa, vsync) also RESETS resolution/window to startup, so re-impose window + fps via
  // apply(). DebugImGui calls it with aa=0 to drop MSAA while the native ImGui overlay is open —
  // that overlay is single-sampled, so an AA>0 back buffer fails with a fatal WebGPU sampleCount mismatch.
  static applyVideoWith(aa, vsync) {
    display_reset(aa, vsync);
    Display.apply();
  }

  // apply the saved fps cap (fpsLimit 30/60/120, or 0 = Unlimited).
  static applyFps() {
    const fps = Settings.get("fpsLimit");
    game_set_speed(fps > 0 ? fps : Display.UNCAPPED_FPS, gamespeed_fps);
  }

  // apply Settings: fps cap, then fullscreen, else size to the saved windowed resolution
  // (0/unset → half the monitor). Leaving fullscreen defers the resize RESIZE_DELAY frames (manual caveat).
  static apply() {
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
      w = display_get_width() / 2;
      h = display_get_height() / 2;
    }
    if (window_get_fullscreen()) {
      // leaving fullscreen: defer the resize so the runtime doesn't drop it; record the intended
      // windowed size now so renderW tracks the target through the transition.
      window_set_fullscreen(false);
      Display.renderW = w;
      Display.renderH = h;
      call_later(
        Display.RESIZE_DELAY,
        time_source_units_frames,
        () => Display._resize(w, h),
        false,
      );
    } else {
      Display._resize(w, h);
    }
  }

  // size the window + app surface, recenter, and record the requested size in renderW/H
  // (the synchronous render-target size for the GUI clip scale).
  static _resize(w, h) {
    Display.renderW = w;
    Display.renderH = h;
    window_set_size(w, h);
    surface_resize(application_surface, w, h);
    window_center();
  }
};
