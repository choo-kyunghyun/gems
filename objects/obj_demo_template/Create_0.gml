self.quick_button = function(_on_click, _tooltip_key, _text_key) {
    var _style = { width: "80%", height: 100 };
    var _panel = { colour: ASTOLFO_PURPLE, rad: 100 };
    var _trigger = {
        on_enter: function() { window_set_cursor(cr_handpoint); self.parent.colour = ASTOLFO_PINK; },
        on_leave: function() { window_set_cursor(cr_default); self.parent.colour = ASTOLFO_PURPLE; },
        on_click: _on_click,
    };
    var _tooltip = { text_ref: i18n.get_text_ref(_tooltip_key) };
    var _text = { text_ref: i18n.get_text_ref(_text_key), colour: ASTOLFO_WHITE, font: i18n.get_font("regular") }
    var _btn = new UIButton(_style, _panel, _trigger, undefined, _tooltip, _text, undefined);
    return _btn;
}

self.ui = new UIElement({ width: "100%", height: "100%", padding: 16, gap: 16 });
self.header = new UIPanel({ width: "100%", height: 64, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 16 }, { colour: ASTOLFO_BLACK });
self.title = new UIText({}, { text_ref: function() { return $"Level: {object_get_name(obj_demo.level.object_index)}"; } });
self.body = new UIElement({ flexDirection: "row", flexGrow: 1 });
self.main = new UIElement({ height: "100%", flexGrow: 1 });
self.aside = new UIPanel({ width: "20%", height: "100%", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 }, { colour: ASTOLFO_BLACK });

self.ui.insert_child(self.header);
self.header.insert_child(self.title);
self.ui.insert_child(self.body);
self.body.insert_child(self.main);
self.body.insert_child(self.aside);
self.aside.insert_child(self.quick_button(demo_close, "Close", "Close"));
