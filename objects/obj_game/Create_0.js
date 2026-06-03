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
this.scene = null;

this.openScene = (scene) => {
  this.scene.destroy();
  this.scene = scene;
  scene.create();
};

this.closeScene = () => {
  this.scene.destroy();
  this.scene = SceneTitle;
  SceneTitle.create((s) => this.openScene(s));
};

SceneTitle.create((s) => this.openScene(s));
this.scene = SceneTitle;
