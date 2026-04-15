// Inherit the parent event
event_inherited();

self.main.set_gap(flexpanel_gutter.all_gutters, 16);

var _input = new UIInput({ width: 360, height: 120 }, {}, {}, { text_ref: i18n.get_text_ref("Placeholder"), colour: ASTOLFO_WHITE_D });
self.main.insert_child(_input);

var _checkbox = new UICheckbox({ width: 360, height: 120 }, {}, { colour: ASTOLFO_WHITE_D }, { text_ref: function() { return "Label"; } }, { height: "90%", aspectRatio: 1.67 }, { colour: ASTOLFO_PINK });
self.main.insert_child(_checkbox);
