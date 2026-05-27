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
I18n.load("i18n/ko-KR/manifest.json");
draw_set_font(I18n.font("normal_36"));
// display_set_gui_maximise();
// display_set_gui_size(1366, 768);

// Input
globalThis.GAME_INPUT = Object.freeze({
  UP: "up",
  DOWN: "down",
  LEFT: "left",
  RIGHT: "right",
});

Input.register(GAME_INPUT.UP, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("W")));
Input.register(GAME_INPUT.DOWN, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("S")));
Input.register(GAME_INPUT.LEFT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("A")));
Input.register(GAME_INPUT.RIGHT, new InputAction().bind_button(INPUT_SOURCE.KEYBOARD, ord("D")));

// Entity
Entity.register(Hit);
Entity.register(Name);
Entity.register(PathRequest);
Entity.register(PathResponse);
Entity.register(Position);
Entity.register(Visual);
Entity.register(State);

// Setting
this.settings_path = "user_settings.json";
this.settings_default = {
  language: "ko-KR",
  mouse_sens: 0.5,
  raw_input: false,
  ui_scale: 1.0,
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
//     return this;
// }

// this.settings_reset = function() {
//     this.settings = {};
//     struct_merge(this.settings_default, this.settings);
//     return this;
// }

// this.settings_import();

// Entity DB
this.entities = {};

room_goto_next();
