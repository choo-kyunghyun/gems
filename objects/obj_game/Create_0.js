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
draw_set_font(I18n.font("normal_36"));

I18n.load("i18n/ko-KR/manifest.json");
display_set_gui_maximise();

Log.clear();
Log.info("game start");

Settings.registerDefaults({
  language: "ko-KR",
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

this.background = Color.parse("#222222");
this.scenes = SCENES;
this.scene = null;
this._pendingScene = null;

// Queue a scene transition — applied after UI.update() to avoid destroying
// the UI tree while it is still being traversed.
this.openScene = (factory) => {
  this._pendingScene = factory;
};

this._applyScene = (factory) => {
  if (this.scene !== null) this.scene.destroy();
  this.scene = factory();
  this.scene.create((s) => this.openScene(s));
};

this._applyScene(this.scenes.title);
