#macro RELEASE_MODE false

gml_release_mode(RELEASE_MODE);
audio_throw_on_error(!RELEASE_MODE);
show_debug_overlay(!RELEASE_MODE);
