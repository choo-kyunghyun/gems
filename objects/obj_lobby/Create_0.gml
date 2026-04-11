var _menu_add = function(_on_click, _tooltip_key, _text_key, _desc_key) {
    var _style = { width: 360, height: 120 };
    var _panel = { colour: ASTOLFO_BLACK, rad: 120 };
    var _trigger = {
        on_enter: function() { window_set_cursor(cr_handpoint); self.parent.icon.colour = ASTOLFO_PINK; },
        on_leave: function() { window_set_cursor(cr_default); self.parent.icon.colour = ASTOLFO_PURPLE; },
        on_click: _on_click,
    };
    var _icon = { sprite: spr_play, colour: ASTOLFO_PURPLE };
    var _tooltip = { text_ref: i18n.get_text_ref(_tooltip_key) };
    var _text = { text_ref: i18n.get_text_ref(_text_key), colour: ASTOLFO_WHITE, font: i18n.get_font("regular") }
    var _desc = { text_ref: i18n.get_text_ref(_desc_key), colour: ASTOLFO_WHITE_D, font: i18n.get_font("small") };
    var _btn = new UIButton(_style, _panel, _trigger, _icon, _tooltip, _text, _desc);
    obj_lobby.menu.insert_child(_btn);
}

var _aside_add = function(_on_click, _tooltip_key, _text_key) {
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
    obj_lobby.aside.insert_child(_btn);
}

var _top = new UIElement({ width: "100%", height: "10%", paddingHorizontal: 20 }).insert_child(new UIText({}, { text_ref: i18n.get_text_ref("GameMaker Entity & Map System"), font: i18n.get_font("bold") }));
var _body = new UIElement({ width: "100%", height: "90%", flexDirection: "row" });
self.ui = new UIElement({ width: "100%", height: "100%", padding: 32 }).insert_child(_top).insert_child(_body);
self.menu = new UIPanel({ width: "80%", height: "100%", flexWrap: "wrap", gap: 16 }, { colour: ASTOLFO_BLACK_D });
self.aside = new UIPanel({ width: "20%", height: "100%", flexDirection: "column", justifyContent: "space-around", alignItems: "center" }, { colour: ASTOLFO_BLACK });
_body.insert_child(self.menu).insert_child(self.aside);

self.aside.insert_child(new UIImage({ width: "75%", height: "20%" }, { sprite: spr_choo, fit: OBJECT_FIT.CONTAIN }));
_aside_add(function() { url_open("https://github.com/choo-kyunghyun/gems"); }, "", "Repository");
_aside_add(game_end, "", "END");

_menu_add(function() { self.on_leave(); demo_load(obj_demo_cjk); }, "", "CJK", "TTF font test");
_menu_add(function() { self.on_leave(); demo_load(obj_demo_input); }, "", "Input", "Input subsystem test");
_menu_add(function() { self.on_leave(); demo_load(obj_demo_text); }, "", "Text", "UIText test");
