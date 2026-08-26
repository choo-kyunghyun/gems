const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
globalThis.DEV_MODE = !RELEASE_MODE; // global mirror so other events (Step_0's dev lobby hotkey) can gate on it

// release: clock-seed the global stream so uuid() mints run-unique ids; dev keeps the fixed
// default seed so runs stay reproducible. randomize() takes NO seed arg (docs/GMRT.md).
if (RELEASE_MODE) randomize();

gpu_set_ztestenable(true);
// GMRT quirk: fixed-function alpha test is INERT (see CLAUDE.md) — gpu_set_alphatestenable rounds-trips
// its getters but never discards at draw time. shMeshlit's u_alphaRef does the cutout via
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

Settings.register({
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
  // inventory column visibility (toggled in inventory Settings tab)
  invColRarity: false,
  invColMaker: true,
  invColType: true,
  invColWeight: true,
  invColValue: true,
  // HUD temperature unit ("K"|"C"|"F"; toggled in inventory Settings tab)
  tempUnit: "K",
  // colony HUD directional radar (RadarArrows; toggled in inventory Settings tab)
  hudRadar: false,
  // GemsUI color theme ("dark"|"light"; switched live in the Settings tab)
  theme: "dark",
});
globalThis.SETTINGS_FILE = "settings.json"; // the app-owned settings filename — Settings stores none; every load/save passes it
Settings.load(SETTINGS_FILE);

// apply the saved GemsUI color theme before any UI (or the backdrop) reads GemsTheme colors
GemsTheme.setMode(Settings.get("theme"));

// restore saved display state (vsync, AA, fps cap, fullscreen/resolution); GUI sized by UI.applyScale
Display.applyVideo();

// spatial falloff model + 2D listener orientation + saved volumes; after Settings.load
Audio.init();

// seed the gamepad slots with the configured stick deadzone; no pad is connected this early, so
// Other_75's "gamepad discovered" is what reaches a real one (contract at Input.applyDeadzone)
Input.applyDeadzone();

// load locale, adopt its base font; fixed 1080p design resolution (÷ uiScale),
// not display_set_gui_maximise — SDF fonts scale crisply at any window size
I18n.load("i18n/" + Settings.get("language") + "/manifest.json");
draw_set_font(I18n.font("default"));
UI.applyScale(Settings.get("uiScale"));

// sprite metadata manifests (kind/density/cell per sheet, emitted by the pixel-art-kit
// importers) — before any level spawns entities, so the density bake reads declared values
SpriteMeta.load();

this.background = Color.parse(GemsTheme.bg); // scene backdrop; re-read on a theme swap (Draw_0)

UINav.color = Color.parse(GemsTheme.accent); // focus ring from kit theme

// ─────────────────────────────────────────────────────────────────────────────
// THE SCENE. Game owns the active Scene outright — there is no scene manager: this pointer IS
// the lifecycle. Step_0 flushes a queued swap then calls update(), Draw_0 calls draw(), CleanUp
// destroys. switchTo() below is the only transition, and the closures are defined here because
// instance state (the pointer, the queue) lives on the instance.
//
// Exactly ONE scene is live: a switch DESTROYS it and resets the cross-scene singletons before the
// target builds, so nothing of a scene survives the swap — no stack, no frozen scene.
// ─────────────────────────────────────────────────────────────────────────────
this.scene = null; // the live Scene — stepped + drawn
this._factory = null; // its factory (restart re-opens it)
this._label = null; // its resolved display label (localized), or null
this._pending = null; // queued switch factory, applied next Step_0
// Sim pause + frame-step, driven by the Debug overlay's "Sim" section.
this.paused = false;
this._stepRequested = false; // one-shot: lets exactly one frame through

/**
 * THE transition: queue a scene switch, applied next Step (after UI.update, so the UI tree isn't
 * torn down mid-traversal) at full fade cover, DESTROYING the live scene. Ignored mid-fade so a
 * spammed button can't stack swaps. This is the `openScene` callback handed to every create().
 */
this.switchTo = (factory) => {
  if (SceneTransition.isBusy()) return;
  this._pending = factory;
};

/** Re-open the active scene from scratch (Debug "Restart Scene"). */
this.restart = () => {
  if (this._factory !== null) this.switchTo(this._factory);
};

/**
 * Live theme swap: rebuild the active scene's UI in place (colors are baked at build, so a
 * palette change only shows after a rebuild). Delegates to the scene's optional retheme() — a
 * UI-only rebuild that never regenerates world/gameplay state, unlike restart(). A scene that
 * doesn't implement it keeps its old-palette UI until its next natural rebuild.
 */
this.retheme = () => {
  if (this.scene !== null && this.scene.retheme !== undefined)
    this.scene.retheme();
};

/** Display label of the active scene: the registered (localized) one, else its instance label. */
this.label = () => {
  const lbl = this._label;
  if (lbl != null) return typeof lbl === "function" ? lbl() : lbl;
  const s = this.scene;
  return s !== null && s.label != null && s.label !== "" ? s.label : "-";
};

/** Request a one-frame sim advance while paused (Debug "Step Frame"). */
this.requestStep = () => {
  this._stepRequested = true;
};

this._takeStep = () => {
  if (!this._stepRequested) return false;
  this._stepRequested = false;
  return true;
};

/**
 * Apply a switch NOW (Step_0 calls it at full fade cover): destroy the live scene, reset the
 * cross-scene singletons, then build the target.
 */
this._apply = (factory) => {
  this._destroyScene();
  UINav.reset(); // drop focus held on the outgoing scene's UI
  GameOverlay.reset(); // close the pause overlay + restore time scale
  Dialogue.clear();
  FloatingText.clear(); // world coords are map-local
  ParticleFx.clear(); // world coords are map-local
  Audio.restart(); // one scene's BGM/SFX must not bleed into the next
  // A class scene's `label` field never sets (GMRT skips subclass field inits — #15067), so the
  // registered label (localized) is the reliable source; built-ins fall back to their instance one.
  this.scene = factory();
  this._factory = factory;
  this._label = SceneRegistry.labelOf(factory);
  this.scene.create((f) => this.switchTo(f));
};

this._destroyScene = () => {
  if (this.scene !== null) this.scene.destroy();
  InstanceSystem.update(); // the outgoing scene's stores are gone — its puppets reap here
  Debug.clearScoped(); // whatever sections it registered (the colony's Camera/Achievements)
  this.scene = null;
  this._factory = null;
  this._label = null;
};

GameOverlay.quitTo = SCENES.lobby;
GameOverlay.settingsFile = SETTINGS_FILE;
// lobby is the boot scene + dev launcher; F2 (Step_0) also returns here. Applied immediately —
// nothing to fade out from, so the boot fades IN from black instead.
this._apply(SCENES.lobby);
SceneTransition.reveal();

// register built-in debug sections; they read this.scene live, so bindings track it across swaps
DebugGeneral.register(this);
DebugRender.register(this); // per-pass overlay toggles (formerly the GameOverlay Debug tab)
DebugInspector.register(this); // the click-to-pick "Entity" section (Step_0 drives the picking)

// Inject the Save/Load tab into the Core GameOverlay (the injection seam keeps GameOverlay free of
// the Demo's SaveGame/SceneColony). Save is gated on a saveable scene; Load boots a fresh colony.
GameOverlay.addTab(I18n.textRef("SYS_TAB_SAVELOAD"), () =>
  SaveGame.buildMenuTab(this),
);
