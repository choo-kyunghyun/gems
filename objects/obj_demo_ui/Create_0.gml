// Inherit the parent event
event_inherited();

var _input = new UIInput({ width: 360, height: 120 }, {}, {}, { text_ref: i18n.get_text_ref("Placeholder"), colour: ASTOLFO_WHITE_D });
self.main.insert_child(_input);
