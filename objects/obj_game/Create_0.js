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
  // GemsUI color theme ("dark"|"light"; switched live in the Settings tab)
  theme: "dark",
});
Settings.load();

// apply the saved GemsUI color theme before any UI (or the backdrop) reads GemsTheme colors
GemsTheme.setMode(Settings.get("theme"));

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

this.background = Color.parse(GemsTheme.bg); // scene backdrop; re-read on a theme swap (Draw_0)

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

// register built-in debug panels (sections of the shared "General" window);
// update() closures track the current scene across swaps
const game = this;
Debug.add({
  name: "Time",
  data: { scale: 1, delta: 0, raw: 0 },
  _last: 1,
  build() {
    const d = this.data;
    d.scale = Time.scale;
    this._last = d.scale;
    dbg_slider(ref_create(d, "scale"), 0, 3, "Scale", 0.1);
    dbg_watch(ref_create(d, "delta"), "Delta");
    dbg_watch(ref_create(d, "raw"), "Raw");
  },
  update() {
    // Time.* are class statics — staged through data (contract: Debug)
    const d = this.data;
    if (d.scale !== this._last) Time.scale = d.scale;
    else d.scale = Time.scale;
    this._last = d.scale;
    d.delta = Time.delta;
    d.raw = Time.raw;
  },
});
Debug.add({
  name: "Perf",
  data: { fps: 0, fpsReal: 0, scene: "", entities: 0 },
  build() {
    const d = this.data;
    dbg_watch(ref_create(d, "fps"), "FPS");
    dbg_watch(ref_create(d, "fpsReal"), "FPS Real");
    dbg_watch(ref_create(d, "scene"), "Scene");
    dbg_watch(ref_create(d, "entities"), "Entities");
  },
  update() {
    const d = this.data;
    d.fps = fps;
    d.fpsReal = fps_real;
    d.scene = game.scenes.label();
    const s = game.scenes.current;
    const w =
      s !== null && s !== undefined && s.world !== undefined ? s.world : null;
    d.entities = w !== null ? w.ids.next - w.ids.freeIndices.length : "-";
  },
});
Debug.add({
  name: "Log",
  data: { lines: 0 },
  build() {
    dbg_watch(ref_create(this.data, "lines"), "Lines");
    dbg_button("Clear", () => Log.clear());
  },
  update() {
    this.data.lines = Log._lines.length;
  },
});
// sim controls relocated from SystemMenu; Pause gates scene.step()
Debug.add({
  name: "Sim",
  build() {
    // game.scenes is a plain object — the ref binds it live, two-way
    dbg_checkbox(ref_create(game.scenes, "paused"), "Pause");
    dbg_button("Step Frame", () => game.scenes.requestStep());
    dbg_button("Restart Scene", () => game.scenes.restart());
  },
});
DebugRender.register(this); // per-pass overlay toggles (formerly the SystemMenu Debug tab)

// Inject the Save/Load tab into the Core SystemMenu (the injection seam keeps SystemMenu free of
// the Demo's SaveGame/SceneRpg). Save is gated on a saveable scene; Load boots a fresh RPG.
SystemMenu.addTab(I18n.textRef("SYS_TAB_SAVELOAD"), () =>
  SaveGame.buildMenuTab(),
);
