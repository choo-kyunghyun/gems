const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
globalThis.DEV_MODE = !RELEASE_MODE; // global mirror so other events (Step_0's dev lobby hotkey) can gate on it
// `GEMS_TEST=1 gm-cli run gems.yyp` boots straight into the tests (sceneTest), which run every
// case, log, and end the game — the agent's one-command verification; `GEMS_TEST=<id prefix>`
// runs the cases under that prefix only (`GEMS_TEST=collision.`). "" is off. Dev only.
globalThis.TEST_AUTORUN = DEV_MODE ? environment_get_variable("GEMS_TEST") : "";

// release: clock-seed the global stream so uuid() mints run-unique ids; dev keeps the fixed
// default seed so runs stay reproducible. randomize() takes NO seed arg (docs/GMRT.md).
if (RELEASE_MODE) randomize();

gpu_set_ztestenable(true);
// GMRT quirk: fixed-function alpha test is INERT (docs/GMRT.md) — gpu_set_alphatestenable rounds-trips
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
  // inventory column visibility (toggled in the Gameplay settings)
  invColRarity: false,
  invColType: true,
  invColWeight: true,
  invColValue: true,
  // HUD temperature unit ("K"|"C"|"F"; toggled in the Gameplay settings)
  tempUnit: "K",
  // colony HUD radar: markers on screen, edge arrows off it (toggled in the Gameplay settings)
  hudRadar: false,
  // Facet color theme ("dark"|"light"; switched live in the Settings tab)
  theme: "dark",
  // strength of the world's atmospheric desaturation (ColonyView.chroma): 0 = the authored
  // colours at every hour, 1 = the full hour/season/sky schedule
  worldChroma: 1.0,
  // lime BBox outlines over the world (RenderDebugEntity) — dev toggle in the overlay's
  // Settings tab, read live by the pass the colony mounts
  debugBBox: false,
});
globalThis.SETTINGS_FILE = "settings.json"; // the app-owned settings filename — Settings stores none; every load/save passes it
Settings.load(SETTINGS_FILE);

// apply the saved Facet color theme before any UI (or the backdrop) reads FacetTheme colors
FacetTheme.setMode(Settings.get("theme"));

// restore saved display state (vsync, AA, fps cap, fullscreen/resolution); GUI sized by UI.applyScale
Display.applyVideo();

// spatial falloff model + 2D listener orientation + the group loads + saved volumes; after Settings.load
Audio.init();

// the colony keymap is the app's control scheme, registered once for the run (no scene binds or
// drops it); the saved input profile (rebinds + deadzone) then lands over its defaults
ColonyKeymap.bind();
InputPreset.load();

// seed the gamepad slots with the configured stick deadzone; no pad is connected this early, so
// Other_75's "gamepad discovered" is what reaches a real one (contract at Input.applyDeadzone)
Input.applyDeadzone();

// load locale, adopt its base font; fixed 1080p design resolution (÷ uiScale),
// not display_set_gui_maximise — SDF fonts scale crisply at any window size
I18n.load("i18n/" + Settings.get("language") + "/manifest.json");
draw_set_font(I18n.font("default"));
UI.applyScale(Settings.get("uiScale"));

contentSprites.register(); // sprite metadata (density per sheet) before any level spawns entities
contentSounds.register(); // sound metadata (tempo per track) — the sim tempo reads it
contentParticles.register(); // particle metadata (density per system) before any burst or stream
contentMeshes.register(); // model metadata (density per model) before any level draws or sizes one

App.background = Color.parse(FacetTheme.bg); // re-read on a theme swap

UINav.color = Color.parse(FacetTheme.accent); // focus ring from kit theme
UINav.back = GameOverlay.back; // the pause menu backs out on the cancel the UI left
// the global F1 pause menu, driven inside the GUI pass
UI.menu = () => GameOverlay.update();
UI.sounds.click = sndButtonClick; // widget cues from the game's own SFX
UI.sounds.tick = sndButtonMuted;

// the app members a scene can dirty, reset between two scenes (contract at App)
App.sweep = () => {
  // input + GUI
  UINav.reset(); // drop focus held on the outgoing scene's UI
  InputContext.reset(); // back to the "default" base context
  GameOverlay.close(); // close the pause menu + restore time scale
  Toast.clear();
  Tooltip.clear();
  // clocks: a scene starts at full speed
  Time.scale = 1;
  Time.tempo = 1;
  Audio.restart(); // one scene's BGM/SFX must not bleed into the next
};

GameOverlay.quitTo = sceneLobby;
GameOverlay.settingsFile = SETTINGS_FILE;
GameOverlay.keymap = ColonyKeymap.rows(); // the Settings tab's key-binding list
// Inject the Save/Load tab into the GameOverlay (the injection seam keeps GameOverlay free of
// SaveGame/sceneColony). Save is gated on a saveable scene; Load boots a fresh colony.
GameOverlay.addTab(
  I18n.textRef("SYS_TAB_SAVELOAD"),
  I18n.textRef("SYS_TAB_SAVELOAD_ABBR"),
  () => SaveGame.buildMenuTab(),
);

// lobby is the boot scene + dev launcher; F2 (Step_0) also returns here
App.start(TEST_AUTORUN !== "" ? sceneTest : sceneLobby);
