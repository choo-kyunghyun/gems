#macro RELEASE_MODE false

gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
// show_debug_overlay(!RELEASE_MODE);

self.persistent = true;

game_set_speed(display_get_frequency(), gamespeed_fps);
draw_set_circle_precision(64);
draw_enable_svg_aa(true);
draw_set_svg_aa_level(1);

var _w = display_get_width() / 2;
var _h = display_get_height() / 2;
window_set_size(_w, _h);
surface_resize(application_surface, _w, _h);
window_center();
