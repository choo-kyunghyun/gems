const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
globalThis.DEV_MODE = !RELEASE_MODE; // global mirror so other events (Step_0's dev lobby hotkey) can gate on it

randomize();

gpu_set_ztestenable(true);
// GMRT quirk: fixed-function alpha test is INERT (see CLAUDE.md) — gpu_set_alphatestenable rounds-trips
// its getters but never discards at draw time. sh_meshlit's u_alphaRef does the cutout via
// `discard` instead. left commented as a record of the dead end:
// gpu_set_alphatestenable(true);
// only the entity passes write depth (for 2.5D z-sort); flat ground passes are coplanar
// at z=0 and must NOT write depth or they z-fight (dual-grid terrain layers flicker hard).
// default z-write off; RenderBillboard/RenderMesh/RenderWalls enable it around their loops only.
gpu_set_zwriteenable(false);

draw_set_circle_precision(64);

Log.clear();
Log.info("game start");

// last chance to record why it crashed — runner exits right after the handler
exception_unhandled_handler((ex) => Log.exception(ex));

Settings.registerDefaults({
  language: "en-US",
  fullscreen: false,
  resolutionW: 0,
  resolutionH: 0,
  fpsLimit: 60,
  vsync: false,
  antialias: 0, // fullscreen AA: 0=off / 2 / 4 / 8 (device-dependent — see display_aa)
  uiScale: 1.0,
  volMaster: 1.0,
  volMusic: 1.0,
  volSfx: 1.0,
  mouseSensitivity: 0.5,
  rawInput: false,
  // RPG inventory column visibility (toggled in inventory Settings tab)
  invColRarity: false,
  invColMaker: true,
  invColType: true,
  invColWeight: true,
  invColValue: true,
  // RPG HUD temperature unit ("K"|"C"|"F"; toggled in inventory Settings tab)
  tempUnit: "K",
  // RPG HUD directional radar (RadarArrows; toggled in inventory Settings tab)
  rpgRadar: false,
});
Settings.load();

// restore saved display state (vsync, AA, fps cap, fullscreen/resolution); GUI sized by UI.applyScale
Display.applyVideo();

// spatial falloff model + 2D listener orientation + saved volumes; after Settings.load
Audio.setup();

// load locale, adopt its base font; fixed 1080p design resolution (÷ uiScale),
// not display_set_gui_maximise — SDF fonts scale crisply at any window size
I18n.load("i18n/" + Settings.get("language") + "/manifest.json");
draw_set_font(I18n.font("default"));
UI.applyScale(Settings.get("uiScale"));

// sprite metadata manifests (kind/density/cell per sheet, emitted by the pixel-art-kit
// importers) — before any scene spawns entities, so the density bake reads declared values
SpriteMeta.load();

this.background = Color.parse("#222222");

UINav.color = Color.parse(GemsTheme.accent); // focus ring from kit theme

// Wire the World singleton's sub-modules (composition; assigned here where load order is safe).
World.sim = SimClock; // fixed-step tick clock (World.sim.advance / .alpha / .tickDuration)
// World.levels (LevelManager) owns scene/level lifecycle + the resident-level registry; obj_game
// delegates update/step/draw/destroy each event via the `this.scenes` alias.
World.levels = new LevelManager();
this.scenes = World.levels;
// lobby is the boot scene + dev launcher; F2 (Step_0) also returns here
this.scenes.start(SCENES.lobby);
SceneTransition.reveal(); // boot fades in from black

// register built-in debug panels; live bindings track the current scene across swaps
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
// sim controls relocated from SystemMenu; Pause gates scene.step()
Debug.panel("Sim", (p) => {
  p.checkbox("Pause", game.scenes, "paused");
  p.button("Step Frame", () => game.scenes.requestStep());
  p.button("Restart Scene", () => game.scenes.restart());
});
DebugRender.register(this); // per-pass overlay toggles (formerly the SystemMenu Debug tab)

// Inject the Save/Load tab into the Core SystemMenu (the injection seam keeps SystemMenu free of
// the Demo's SaveGame/SceneRpg). Save is gated on a saveable scene; Load boots a fresh RPG.
SystemMenu.addTab(I18n.textRef("SYS_TAB_SAVELOAD"), () => SaveGame.buildMenuTab());
