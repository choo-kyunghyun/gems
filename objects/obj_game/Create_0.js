const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);

randomize();

gpu_set_ztestenable(true);
gpu_set_alphatestenable(true);

game_set_speed(display_get_frequency(), gamespeed_fps);

draw_set_circle_precision(64);

Log.clear();
Log.info("game start");

// Route uncaught runtime exceptions to game.log (and exit non-zero). The runner closes the
// game right after the handler, so this is the last chance to record why it crashed.
exception_unhandled_handler((ex) => Log.exception(ex));

Settings.registerDefaults({
  language: "en-US",
  fullscreen: false,
  resolutionW: 0,
  resolutionH: 0,
  fpsLimit: 60,
  uiScale: 1.0,
  volMaster: 1.0,
  volMusic: 1.0,
  volSfx: 1.0,
  mouseSensitivity: 0.5,
  rawInput: false,
  // RPG inventory — Items-table column visibility (toggled in the inventory Settings tab).
  invColRarity: false,
  invColType: true,
  invColWeight: true,
  invColValue: true,
  // RPG HUD — ambient-temperature display unit ("K"|"C"|"F"; toggled in the inventory Settings tab).
  tempUnit: "K",
});
Settings.load();

// Restore the saved window state (fullscreen / windowed resolution) — sizes the OS window
// + the world's application_surface. The GUI layer is sized separately by UI.applyScale.
Display.apply();

// Load localization for the saved language, then adopt its base font as the
// default draw font (both locales now ship Noto; an undeclared key falls back).
I18n.load("i18n/" + Settings.get("language") + "/manifest.json");
draw_set_font(I18n.font("default"));
// Fixed 1080p design resolution for the GUI layer (÷ uiScale), not display_set_gui_maximise:
// UI lays out the same on every monitor and the SDF fonts scale crisply to the window.
UI.applyScale(Settings.get("uiScale"));

this.background = Color.parse("#222222");

UINav.color = Color.parse(GemsTheme.accent); // focus-ring color from the kit theme

// All scene lifecycle (the live scene, a queued swap, the fade-coordinated transition)
// lives in SceneManager; obj_game just delegates update/step/draw/destroy to `this.scenes`
// each event. SystemMenu reads the live scene + restarts/quits through this.scenes rather
// than reaching into obj_game's fields.
this.scenes = new SceneManager();
this.scenes.start(SCENES.lobby);
SceneTransition.reveal(); // boot fades the title in from black instead of popping

// Debug back-end: register the global built-in panels once. Bindings are live,
// so these track the current scene across swaps. The text port (debug.txt) is
// the agent-readable view; the ImGui port (Phase 2) renders the same registry.
const game = this;
Debug.panel("Time", (p) => {
  p.slider("Scale", Time, "scale", 0, 3, 0.1);
  p.watch("Delta", () => Time.delta);
  p.watch("Raw", () => Time.raw);
});
Debug.panel("Perf", (p) => {
  p.watch("FPS", () => fps);
  p.watch("FPS Real", () => fps_real);
  p.watch("Scene", () => game.scenes.label());
  p.watch("Entities", () => {
    const s = game.scenes.current;
    const w =
      s !== null && s !== undefined && s.world !== undefined ? s.world : null;
    return w !== null ? w.ids.next - w.ids.freeIndices.length : "-";
  });
});
Debug.panel("Log", (p) => {
  p.watch("Lines", () => Log._lines.length);
  p.button("Clear", () => Log.clear());
});
DebugRender.register(this); // "Render" panel: per-pass overlay toggles (was the SystemMenu Debug tab)
