// Display / window management: applies the saved display Settings (fullscreen + windowed
// resolution + frame-rate cap) to the actual OS game window + the world's application_surface.
// Used at boot (obj_game Create) and whenever the SystemMenu changes a display setting. The
// GUI layer is sized separately by UI.applyScale (fixed design resolution); this owns the
// window + the game frame rate.
globalThis.Display = class Display {
  // Frames to defer a window resize after leaving fullscreen. The GM manual warns that a
  // window_set_size right after switching fullscreen→windowed "may not work correctly"
  // unless it happens at least 10 steps later, so that one path goes through call_later.
  static RESIZE_DELAY = 10;

  // Game speed used for the "Unlimited" fpsLimit (0) — high enough to be effectively
  // uncapped (the fixed-rate sim is unaffected; only render/Step frequency rises).
  static UNCAPPED_FPS = 1000;

  // The current GUI render-target (window back buffer) size in PHYSICAL pixels — windowed client
  // area, or the monitor in fullscreen. The back buffer resizes SYNCHRONOUSLY to whatever size we
  // request here, but window_get_width/height() (and the application surface) lag it by a frame
  // (the OS resize arrives async via an SDL event), so on a resolution-change frame a query reports
  // the OLD size. UIElement._drawClipped scales its GPU scissor by this instead — keying it off a
  // lagged query sets a scissor bigger than the freshly-shrunk back buffer → a fatal "scissor not
  // contained in the render target" validation error. Authoritative because the window is not
  // drag-resizable (options_windows resize_window:false), so Display is the only thing that sets it.
  static renderW = 0;
  static renderH = 0;
  // renderW/H aged by one frame (advanceFrame, end of UI.draw). The GUI back buffer doesn't resize in
  // lockstep with apply(): a SHRINK shrinks it the same frame, but a GROW lags it ONE frame (it's
  // still the old, smaller size while renderW already holds the new bigger one). So a scissor sized
  // to renderW would overflow the not-yet-grown target for a frame → fatal validation error.
  static _prevW = 0;
  static _prevH = 0;

  // Crash-safe GUI clip-target size: the SMALLER of the intended size (renderW) and its 1-frame-lagged
  // value (_prevW). The live back buffer always equals one of the two mid-transition — a shrink makes
  // renderW the smaller (and the target matches it immediately), a grow keeps _prevW the smaller (and
  // the target stays there one frame while it catches up) — so min() can never exceed the target (a
  // grow briefly under-clips by a frame, invisible, instead of overflowing it). Used for the GPU
  // scissor in UIElement._drawClipped + the frame-start reset in UI.draw.
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

  // Age renderW/H into the 1-frame-lagged _prevW/H. Called once per frame at the end of UI.draw, so a
  // GROW's bigger size only takes clip effect on the NEXT frame (after the back buffer has caught up).
  static advanceFrame() {
    Display._prevW = Display.renderW;
    Display._prevH = Display.renderH;
  }

  // The fullscreen anti-aliasing levels this device can actually do, as an array of valid
  // display_reset `aa` arguments: always 0 (off), plus 2/4/8 for each bit display_aa reports
  // set. The bit value equals the level — 2x→bit 2, 4x→bit 4, 8x→bit 8 — so `display_aa & lvl`
  // is `lvl` when supported, else 0 (see the display_aa manual). Used to build the AA setting's
  // options so it only offers levels the GPU supports (a single `&` is GMRT-safe).
  static aaLevels() {
    const out = [0];
    if (display_aa & 2) out.push(2);
    if (display_aa & 4) out.push(4);
    if (display_aa & 8) out.push(8);
    return out;
  }

  // Apply the saved vsync + fullscreen-AA settings via display_reset(aa, vsync). That call also
  // RESETS the display to its startup state (resolution/window), so re-impose our window + fps
  // afterwards with apply(). Called at boot and whenever the SystemMenu flips vsync/AA — not on a
  // plain resolution/fullscreen change, since display_reset state sticks until the next call.
  static applyVideo() {
    display_reset(Settings.get("antialias"), Settings.get("vsync"));
    Display.apply();
  }

  // Apply the saved frame-rate cap (Settings "fpsLimit": 30/60/120, or 0 = Unlimited).
  static applyFps() {
    const fps = Settings.get("fpsLimit");
    game_set_speed(fps > 0 ? fps : Display.UNCAPPED_FPS, gamespeed_fps);
  }

  // Apply the current Settings: the fps cap, then go fullscreen, else size the window to the
  // saved windowed resolution (0/unset → half the monitor). Coming OUT of fullscreen the
  // resize is deferred RESIZE_DELAY frames (manual caveat); boot + a plain resolution change
  // resize inline.
  static apply() {
    Display.applyFps();
    if (Settings.get("fullscreen")) {
      window_set_fullscreen(true);
      // The fullscreen render target is the monitor. Record it for the clip scale (see renderW) and
      // match the application surface to it so the world renders at full resolution instead of
      // upscaling from the windowed size. Use display_get_* (the monitor, always known) not
      // window_get_* (it can lag the fullscreen switch by frames).
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
      // Leaving fullscreen: defer the resize so the runtime doesn't drop it. Record the intended
      // windowed size now so the clip scale (renderW) tracks the target through the transition.
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

  // Size the window (+ the world's application_surface) and recenter it on the monitor. Records the
  // requested size in renderW/renderH (the synchronous render-target size for the GUI clip scale).
  static _resize(w, h) {
    Display.renderW = w;
    Display.renderH = h;
    window_set_size(w, h);
    surface_resize(application_surface, w, h);
    window_center();
  }
};
