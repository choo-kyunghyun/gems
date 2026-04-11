// Inherit the parent event
event_inherited();

#region Input

enum INPUT_ACTIONS {
    UP,
    DOWN,
    LEFT,
    RIGHT,
}

Input.register(INPUT_ACTIONS.UP, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("W")));
Input.register(INPUT_ACTIONS.DOWN, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("S")));
Input.register(INPUT_ACTIONS.LEFT, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("A")));
Input.register(INPUT_ACTIONS.RIGHT, new InputAction().bind(INPUT_TYPE.KEYBOARD, ord("D")));

#endregion

#region UI

i18n.load("i18n/ko-KR/manifest.json");
draw_set_font(i18n.get_font("regular"));
// TODO: Settings, copyright, and time should be global overlay interface
self.overlay = new UIElement();

#endregion

#region Window

var _w = display_get_width() / 2;
var _h = display_get_height() / 2;
window_set_size(_w, _h);
surface_resize(application_surface, _w, _h);
window_center();

#endregion

#region Demo

self.level = noone;

#endregion

// rm_lobby
room_goto_next();
