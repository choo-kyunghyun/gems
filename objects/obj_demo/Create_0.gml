// Inherit the parent event
event_inherited();

i18n.load("i18n/ko-KR/manifest.json");
draw_set_font(i18n.get_font("regular"));

// TODO: Settings, copyright, and time should be global overlay interface
overlay = new UIElement();

room_goto_next();
