const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);

randomize();

gpu_set_ztestenable(true);
gpu_set_alphatestenable(true);

const w = display_get_width() / 2;
const h = display_get_height() / 2;
window_set_size(w, h);
surface_resize(application_surface, w, h);
window_center();

game_set_speed(display_get_frequency(), gamespeed_fps);

draw_set_circle_precision(64);

Log.clear();
Log.info("game start");

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
});
Settings.load();

// Load localization for the saved language, then adopt its base font as the
// default draw font (Korean needs Noto; en-US declares none and falls back).
I18n.load("i18n/" + Settings.get("language") + "/manifest.json");
draw_set_font(I18n.font("default"));
display_set_gui_maximise();

this.background = Color.parse("#222222");
this.scenes = SCENES;
this.scene = null;
this._pendingScene = null;

// Queue a scene transition — applied after UI.update() to avoid destroying
// the UI tree while it is still being traversed. Ignored while a fade is already
// running: during the fade-out the outgoing scene's buttons are still live, so
// without this guard spamming one re-queues _pendingScene and a second fade fires
// once the first finishes.
this.openScene = (factory) => {
  if (SceneTransition.isBusy()) return;
  this._pendingScene = factory;
};

this._applyScene = (factory) => {
  if (this.scene !== null) this.scene.destroy();
  UINav.reset(); // drop focus held on the outgoing scene's UI
  this.scene = factory();
  this.scene.create((s) => this.openScene(s));
};

UINav.color = Color.parse(GemsTheme.accent); // focus-ring color from the kit theme

this._applyScene(this.scenes.title);
SceneTransition.reveal(); // boot fades the title in from black instead of popping
