// Release mode
const RELEASE_MODE = false;
gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);

// Game
this.persistent = true;

// Window
let w = display_get_width() / 2;
let h = display_get_height() / 2;
window_set_size(w, h);
surface_resize(application_surface, w, h);
window_center();

// Framerate
game_set_speed(display_get_frequency(), gamespeed_fps);

// Draw
draw_set_circle_precision(64);
// draw_enable_svg_aa(true);
// draw_set_svg_aa_level(1);

// UI
// I18n.load("i18n/ko-KR/manifest.json");
// draw_set_font(I18n.get_font("normal_36"));
// display_set_gui_maximise();
// display_set_gui_size(1366, 768);

// this.show_fps = false;

// Input
const INPUT_ACTIONS = Object.freeze({
  UP: 0,
  DOWN: 1,
  LEFT: 2,
  RIGHT: 3,
});

// Input.register(INPUT_ACTIONS.UP, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("W")));
// Input.register(INPUT_ACTIONS.DOWN, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("S")));
// Input.register(INPUT_ACTIONS.LEFT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("A")));
// Input.register(INPUT_ACTIONS.RIGHT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("D")));

// Setting
this.settings_path = "user_settings.json";
this.settings_default = {
  language: "ko-KR",
  mouse_sens: 0.5,
  raw_input: false,
  ui_scale: 1.0,
  show_fps: false,
  vol_master: 1.0,
  fullscreen: false,
  fps_limit: 60,
  resolution_w: 0,
  resolution_h: 0,
};
this.settings = {};
// struct_merge(this.settings_default, this.settings);

// this.settings_is_modified = function(_key) {
//     return (this.settings[$ _key] ?? this.settings_default[$ _key]) != this.settings_default[$ _key];
// }

// this.settings_export = function() {
//     return struct_export(this.settings, this.settings_path);
// }

// this.settings_import = function() {
//     var _loaded = struct_import(this.settings_path);
//     if (is_struct(_loaded)) struct_merge(_loaded, this.settings);
//     this.show_fps = this.settings[$ "show_fps"] ?? this.show_fps;
//     return this;
// }

// this.settings_reset = function() {
//     this.settings = {};
//     struct_merge(this.settings_default, this.settings);
//     this.show_fps = this.settings[$ "show_fps"] ?? false;
//     return this;
// }

// this.settings_import();

// Screenshot
this.screenshot_counter = 0;

// Entity DB
this.entities = {};
this.entities["slime"] = { hit: 100 };

room_goto_next();
