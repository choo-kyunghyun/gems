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
      return;
    }
    let w = Settings.get("resolutionW");
    let h = Settings.get("resolutionH");
    if (w <= 0 || h <= 0) {
      w = display_get_width() / 2;
      h = display_get_height() / 2;
    }
    if (window_get_fullscreen()) {
      // Leaving fullscreen: defer the resize so the runtime doesn't drop it.
      window_set_fullscreen(false);
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

  // Size the window (+ the world's application_surface) and recenter it on the monitor.
  static _resize(w, h) {
    window_set_size(w, h);
    surface_resize(application_surface, w, h);
    window_center();
  }
};
